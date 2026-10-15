import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Shopify Admin API クライアント（Dev Dashboard アプリ / client_credentials）
 *
 * 2026 年以降、ストア管理画面でのカスタムアプリ作成は廃止。Dev Dashboard で作ったアプリの
 * Client ID / Secret から約 24h 有効のアクセストークンを都度取得する。
 *   POST https://{shop}/admin/oauth/access_token
 *   grant_type=client_credentials&client_id=…&client_secret=…
 */
@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly shop: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiVersion: string;
  private token?: { value: string; expiresAt: number };

  constructor(config: ConfigService) {
    this.shop = config.get<string>('SHOPIFY_STORE_DOMAIN', '');
    this.clientId = config.get<string>('SHOPIFY_CLIENT_ID', '');
    this.clientSecret = config.get<string>('SHOPIFY_CLIENT_SECRET', '');
    this.apiVersion = config.get<string>('SHOPIFY_API_VERSION', '2026-10');
  }

  get configured(): boolean {
    return Boolean(this.shop && this.clientId && this.clientSecret);
  }

  /** 有効なトークンを返す（残り 10 分を切ったら再取得） */
  async getAccessToken(): Promise<string> {
    if (!this.configured) {
      throw new ServiceUnavailableException('Shopify not configured (SHOPIFY_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET)');
    }
    if (this.token && this.token.expiresAt - Date.now() > 10 * 60 * 1000) return this.token.value;

    const res = await fetch(`https://${this.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`Shopify token exchange failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    const ttlSec = data.expires_in ?? 86400;
    this.token = { value: data.access_token, expiresAt: Date.now() + ttlSec * 1000 };
    this.logger.log(`Shopify token refreshed, valid ${Math.round(ttlSec / 3600)}h`);
    return data.access_token;
  }

  /** GraphQL Admin API。userErrors があれば例外 */
  async graphql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    });
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (!res.ok || body.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${res.status} ${JSON.stringify(body.errors ?? body)}`);
    }
    return body.data as T;
  }

  /** Webhook 署名検証（Dev Dashboard アプリは client secret で署名） */
  verifyWebhook(rawBody: Buffer | string | undefined, hmacHeader: string | undefined): boolean {
    if (!rawBody || !hmacHeader || !this.clientSecret) return false;
    const digest = createHmac('sha256', this.clientSecret).update(rawBody).digest('base64');
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ───────────────────────── 画像（staged upload） ─────────────────────────

  /**
   * 外部 URL の画像を一度こちらで取得し、実際のバイト列から形式を判定して Shopify にステージドアップロードする。
   * 卸サイト（腾讯云 COS）の画像は拡張子 .jpg でも中身が WebP 等のことがあり、URL をそのまま渡すと
   * Shopify 側で "file extension/format mismatch" になるため。
   * 戻り値: productCreate / productCreateMedia の originalSource に渡せる resourceUrl の配列（失敗分は除外）。
   */
  async stageImages(urls: string[], max = 12, opts: { process?: boolean } = {}): Promise<string[]> {
    const out: string[] = [];
    const doProcess = opts.process ?? this.imageProcessDefault;
    for (const url of urls.slice(0, max)) {
      try {
        const src = doProcess ? await this.processImage(url) : url;
        out.push(await this.stageOneImage(src));
      } catch (e) {
        this.logger.warn(`image skipped ${url}: ${String(e).slice(0, 160)}`);
      }
    }
    return out;
  }

  // ───────────────────────── 本地画像処理（apps/image-service、GPU） ─────────────────────────

  private get imageServiceUrl(): string {
    return (process.env.IMAGE_SERVICE_URL ?? '').replace(/\/$/, '');
  }
  /** IMAGE_PROCESS=1 で出品時に既定で処理（文字消し・白背景・正方形） */
  private get imageProcessDefault(): boolean {
    return Boolean(this.imageServiceUrl) && /^(1|true|yes)$/i.test(process.env.IMAGE_PROCESS ?? '');
  }
  private get imageSteps(): string[] {
    return (process.env.IMAGE_PROCESS_STEPS ?? 'ocr_inpaint,rembg_white,square').split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** 画像を本地サービスで処理し、処理済み画像の URL（localhost）を返す。サービス未設定/失敗時は元 URL をそのまま返す */
  async processImage(url: string, steps?: string[]): Promise<string> {
    const base = this.imageServiceUrl;
    if (!base) return url;
    try {
      const res = await fetch(`${base}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, steps: steps ?? this.imageSteps, size: Number(process.env.IMAGE_SIZE ?? 1200) }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { url: string; text_boxes?: number; ms?: number };
      this.logger.debug(`image processed ${url} → ${data.url} (text_boxes=${data.text_boxes ?? '-'}, ${data.ms ?? '-'}ms)`);
      return data.url;
    } catch (e) {
      this.logger.warn(`image-service failed for ${url}, using original: ${String(e).slice(0, 160)}`);
      return url;
    }
  }

  private sniffImage(buf: Buffer): { mime: string; ext: string } | null {
    if (buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
    if (buf.subarray(0, 3).toString('ascii') === 'GIF') return { mime: 'image/gif', ext: 'gif' };
    if (buf.subarray(4, 12).toString('ascii').includes('ftyp') && /avif|heic|heif/.test(buf.subarray(8, 12).toString('ascii'))) return { mime: 'image/avif', ext: 'avif' };
    return null;
  }

  private async stageOneImage(url: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const kind = this.sniffImage(buf);
    if (!kind) throw new Error('not an image');
    if (buf.length > 20 * 1024 * 1024) throw new Error('image > 20MB');
    const base = (url.split('/').pop() ?? 'image').split('?')[0].replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'image';
    const filename = `${base}.${kind.ext}`;

    const staged = await this.graphql<{
      stagedUploadsCreate: {
        stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      { input: [{ resource: 'IMAGE', filename, mimeType: kind.mime, httpMethod: 'POST', fileSize: String(buf.length) }] },
    );
    if (staged.stagedUploadsCreate.userErrors.length || !staged.stagedUploadsCreate.stagedTargets[0]) {
      throw new Error(`stagedUploadsCreate: ${JSON.stringify(staged.stagedUploadsCreate.userErrors)}`);
    }
    const target = staged.stagedUploadsCreate.stagedTargets[0];
    const form = new FormData();
    for (const p of target.parameters) form.append(p.name, p.value);
    form.append('file', new Blob([buf], { type: kind.mime }), filename);
    const up = await fetch(target.url, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
    if (!up.ok) throw new Error(`staged upload HTTP ${up.status} ${(await up.text()).slice(0, 200)}`);
    return target.resourceUrl;
  }

  /** 商品のメディア一覧（status / エラー） */
  async listProductMedia(productId: string) {
    const r = await this.graphql<{
      product: { media: { nodes: Array<{ id: string; status: string; mediaErrors: Array<{ message: string }> }> } } | null;
    }>(
      `query($id: ID!) { product(id: $id) { media(first: 50) { nodes { id status mediaErrors { message } } } } }`,
      { id: productId },
    );
    return r.product?.media.nodes ?? [];
  }

  async deleteProductMedia(productId: string, mediaIds: string[]) {
    if (!mediaIds.length) return;
    const r = await this.graphql<{ productDeleteMedia: { userErrors: Array<{ message: string }> } }>(
      `mutation($productId: ID!, $mediaIds: [ID!]!) { productDeleteMedia(productId: $productId, mediaIds: $mediaIds) { userErrors { message } } }`,
      { productId, mediaIds },
    );
    if (r.productDeleteMedia.userErrors.length) throw new Error(JSON.stringify(r.productDeleteMedia.userErrors));
  }

  async addProductMedia(productId: string, resourceUrls: string[]) {
    if (!resourceUrls.length) return;
    const r = await this.graphql<{ productCreateMedia: { userErrors: Array<{ message: string }>; mediaUserErrors?: Array<{ message: string }> } }>(
      `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) { mediaUserErrors { message } userErrors { message } }
      }`,
      { productId, media: resourceUrls.map((u) => ({ originalSource: u, mediaContentType: 'IMAGE' })) },
    );
    const errs = [...(r.productCreateMedia.userErrors ?? []), ...(r.productCreateMedia.mediaUserErrors ?? [])];
    if (errs.length) throw new Error(`productCreateMedia: ${JSON.stringify(errs)}`);
  }

  // ───────────────────────── 販売チャネル ─────────────────────────

  private onlineStorePublicationId?: string;

  /** オンラインストアの publication id（read_publications スコープが必要） */
  async getOnlineStorePublicationId(): Promise<string> {
    if (this.onlineStorePublicationId) return this.onlineStorePublicationId;
    const r = await this.graphql<{ publications: { nodes: Array<{ id: string; name: string }> } }>(
      `{ publications(first: 25) { nodes { id name } } }`,
    );
    const nodes = r.publications.nodes;
    const hit = nodes.find((p) => /online store|オンラインストア/i.test(p.name)) ?? nodes[0];
    if (!hit) throw new Error('No publications found');
    this.onlineStorePublicationId = hit.id;
    return hit.id;
  }

  /** 商品をオンラインストア（販売チャネル）に公開（write_publications スコープが必要） */
  async publishToOnlineStore(productId: string) {
    const publicationId = await this.getOnlineStorePublicationId();
    const r = await this.graphql<{ publishablePublish: { userErrors: Array<{ message: string }> } }>(
      `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
      { id: productId, input: [{ publicationId }] },
    );
    if (r.publishablePublish.userErrors.length) throw new Error(`publishablePublish: ${JSON.stringify(r.publishablePublish.userErrors)}`);
  }

  // ───────────────────────── 商品 ─────────────────────────

  async createProduct(input: {
    title: string;
    descriptionHtml?: string;
    vendor?: string;
    productType?: string;
    tags?: string[];
    status?: 'ACTIVE' | 'DRAFT';
    images: string[]; // 外部 URL。内部で stageImages() を通して Shopify にアップロードする
    options?: string[]; // 例 ["カラー","サイズ"]
    variants: Array<{ sku: string; price: number; optionValues?: string[]; barcode?: string }>;
  }): Promise<{ productId: string; handle: string; variantIds: string[]; imageCount: number }> {
    const hasOptions = (input.options?.length ?? 0) > 0;
    const staged = await this.stageImages(input.images);
    const create = await this.graphql<{
      productCreate: { product: { id: string; handle: string; variants: { nodes: Array<{ id: string }> } } | null; userErrors: Array<{ field: string[]; message: string }> };
    }>(
      `mutation($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product { id handle variants(first: 1) { nodes { id } } }
          userErrors { field message }
        }
      }`,
      {
        product: {
          title: input.title,
          descriptionHtml: input.descriptionHtml,
          vendor: input.vendor,
          productType: input.productType,
          tags: input.tags,
          status: input.status ?? 'DRAFT',
          ...(hasOptions
            ? {
                productOptions: input.options!.map((name, i) => ({
                  name,
                  values: [...new Set(input.variants.map((v) => v.optionValues?.[i]).filter(Boolean))].map((n) => ({ name: n })),
                })),
              }
            : {}),
        },
        media: staged.map((url) => ({ originalSource: url, mediaContentType: 'IMAGE' })),
      },
    );
    if (create.productCreate.userErrors.length || !create.productCreate.product) {
      throw new Error(`productCreate: ${JSON.stringify(create.productCreate.userErrors)}`);
    }
    const product = create.productCreate.product;

    let variantIds: string[] = [];
    if (hasOptions) {
      // 既定バリアントを置き換えて複数バリアントを作成
      const bulk = await this.graphql<{
        productVariantsBulkCreate: { productVariants: Array<{ id: string }>; userErrors: Array<{ message: string }> };
      }>(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
            productVariants { id }
            userErrors { field message }
          }
        }`,
        {
          productId: product.id,
          variants: input.variants.map((v) => ({
            price: String(v.price),
            barcode: v.barcode,
            inventoryPolicy: 'CONTINUE',
            inventoryItem: { sku: v.sku, tracked: false },
            optionValues: v.optionValues!.map((name, i) => ({ optionName: input.options![i], name })),
          })),
        },
      );
      if (bulk.productVariantsBulkCreate.userErrors.length) {
        throw new Error(`productVariantsBulkCreate: ${JSON.stringify(bulk.productVariantsBulkCreate.userErrors)}`);
      }
      variantIds = bulk.productVariantsBulkCreate.productVariants.map((v) => v.id);
    } else {
      const v = input.variants[0];
      const upd = await this.graphql<{
        productVariantsBulkUpdate: { productVariants: Array<{ id: string }>; userErrors: Array<{ message: string }> };
      }>(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }`,
        {
          productId: product.id,
          variants: [
            {
              id: product.variants.nodes[0].id,
              price: String(v.price),
              barcode: v.barcode,
              inventoryPolicy: 'CONTINUE',
              inventoryItem: { sku: v.sku, tracked: false },
            },
          ],
        },
      );
      if (upd.productVariantsBulkUpdate.userErrors.length) {
        throw new Error(`productVariantsBulkUpdate: ${JSON.stringify(upd.productVariantsBulkUpdate.userErrors)}`);
      }
      variantIds = upd.productVariantsBulkUpdate.productVariants.map((x) => x.id);
    }
    return { productId: product.id, handle: product.handle, variantIds, imageCount: staged.length };
  }

  async setProductStatus(productId: string, status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') {
    const r = await this.graphql<{ productUpdate: { userErrors: Array<{ message: string }> } }>(
      `mutation($input: ProductInput!) { productUpdate(input: $input) { userErrors { message } } }`,
      { input: { id: productId, status } },
    );
    if (r.productUpdate.userErrors.length) throw new Error(JSON.stringify(r.productUpdate.userErrors));
  }

  // ───────────────────────── 注文 / 発送 ─────────────────────────

  /** 注文のフルフィルメントオーダーを取得して発送登録（追跡番号付き） */
  async fulfillOrder(orderId: string, tracking: { number: string; company?: string; url?: string }) {
    const q = await this.graphql<{
      order: { fulfillmentOrders: { nodes: Array<{ id: string; status: string }> } } | null;
    }>(
      `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }`,
      { id: orderId },
    );
    const open = q.order?.fulfillmentOrders.nodes.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS') ?? [];
    if (!open.length) throw new Error(`No open fulfillment orders for ${orderId}`);
    const r = await this.graphql<{ fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: Array<{ message: string }> } }>(
      `mutation($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } userErrors { field message } }
      }`,
      {
        fulfillment: {
          notifyCustomer: true,
          trackingInfo: { number: tracking.number, company: tracking.company, url: tracking.url },
          lineItemsByFulfillmentOrder: open.map((f) => ({ fulfillmentOrderId: f.id })),
        },
      },
    );
    if (r.fulfillmentCreate.userErrors.length) throw new Error(JSON.stringify(r.fulfillmentCreate.userErrors));
    return r.fulfillmentCreate.fulfillment?.id;
  }
}
