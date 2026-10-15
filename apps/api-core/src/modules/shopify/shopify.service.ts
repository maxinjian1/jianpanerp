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

  // ───────────────────────── 商品 ─────────────────────────

  async createProduct(input: {
    title: string;
    descriptionHtml?: string;
    vendor?: string;
    productType?: string;
    tags?: string[];
    status?: 'ACTIVE' | 'DRAFT';
    images: string[];
    options?: string[]; // 例 ["カラー","サイズ"]
    variants: Array<{ sku: string; price: number; optionValues?: string[]; barcode?: string }>;
  }): Promise<{ productId: string; handle: string; variantIds: string[] }> {
    const hasOptions = (input.options?.length ?? 0) > 0;
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
        media: input.images.slice(0, 20).map((url) => ({ originalSource: url, mediaContentType: 'IMAGE' })),
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
    return { productId: product.id, handle: product.handle, variantIds };
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
