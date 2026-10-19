import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@japan-erp/database';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { ShopifyService } from '../shopify/shopify.service';

/** 採集スクリプト（tools/kjyf-scraper）が送ってくる 1 商品 */
// 批发商模板型号（YB-05、C-44、YKOGH-01、TEMU-xxxx 等）：标题末尾的去掉。规则与 tools/market-research/fix-catalog.mjs 相同，
// 真实型号（DSHJ-S-2128-JP、R1004 等）保留（2026-10-19 用户决定：新建时自动去型番）
const TEMPLATE_CODE = /(?:\s*[（(]?\s*(?<![A-Za-z0-9])(?:YB-05|[A-Z]{1,6}-\d{2}(?:-[A-Z]+)?|TEMU-\d{3,4}(?:-[A-Z])?|sg\d{3}(?:-[a-z])?|ny\d{3}|de\d{3}|zk\d{3}|sl\d{3})\s*[)）]?)+\s*$/;
export const stripTemplateCode = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.replace(TEMPLATE_CODE, '').replace(/\s+/g, ' ').trim() || s;
};

export interface ScrapedProduct {
  externalId: string;
  sourceUrl: string;
  titleZh: string;
  descriptionZh?: string;
  category?: string;
  images: string[];
  variants: Array<{ name?: string; sku?: string; wholesalePrice: number; stock?: number; options?: string[] }>;
  optionNames?: string[]; // 例 ["颜色","尺码"]
  raw?: unknown;
}

export interface ListingCopy {
  title: string;
  description_html: string;
  bullets: string[];
  tags: string[];
  option_names?: string[];
  option_values?: Record<string, string>; // 中文 → 日本語
}

@Injectable()
export class DropshipService {
  private readonly logger = new Logger(DropshipService.name);
  private readonly markup: number;
  private readonly roundTo: number;
  private readonly vendor: string;

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmGatewayService,
    private readonly shopify: ShopifyService,
  ) {
    this.markup = Number(config.get('KJYF_MARKUP', '1.15'));
    this.roundTo = Number(config.get('KJYF_PRICE_ROUND', '10'));
    this.vendor = config.get<string>('DROPSHIP_VENDOR', 'ANET');
  }

  /** 販売価格 = 卸価格 × 1.15、¥10 単位に切り上げ（貨物は日本国内・円建てのため為替なし） */
  retailPrice(wholesale: number): number {
    const p = wholesale * this.markup;
    return Math.ceil(p / this.roundTo) * this.roundTo;
  }

  // ───────────────────────── 1. 取り込み ─────────────────────────

  async importScraped(items: ScrapedProduct[], supplier = 'kjyf') {
    let created = 0;
    let updated = 0;
    for (const it of items) {
      const minWholesale = Math.min(...it.variants.map((v) => v.wholesalePrice));
      const stock = it.variants.reduce((s, v) => s + (v.stock ?? 0), 0);
      const data = {
        supplier,
        externalId: it.externalId,
        sourceUrl: it.sourceUrl,
        titleZh: it.titleZh,
        descriptionZh: it.descriptionZh,
        category: it.category,
        images: it.images,
        variants: it.variants as object[],
        wholesalePrice: minWholesale,
        retailPrice: this.retailPrice(minWholesale),
        stock,
        raw: { ...((it.raw as object) ?? {}), optionNames: it.optionNames ?? [] } as object,
      };
      const existing = await prisma.supplierProduct.findUnique({ where: { supplier_externalId: { supplier, externalId: it.externalId } } });
      if (existing) {
        await prisma.supplierProduct.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.supplierProduct.create({ data });
        created++;
      }
    }
    return { created, updated };
  }

  // ───────────────────────── 2. 日本語化 ─────────────────────────

  async translate(id: string) {
    const p = await prisma.supplierProduct.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(id);
    const variants = p.variants as ScrapedProduct['variants'];
    const optionNames = ((p.raw as any)?.optionNames as string[] | undefined) ?? [];
    const optionValues = [...new Set(variants.flatMap((v) => v.options ?? []))];

    const res = await this.llm.chat({
      dataClass: 'public',
      taskType: 'listing_copy',
      json: true,
      reasoning: 'low',
      temperature: 0.3,
      maxTokens: 2000,
      messages: [
        {
          role: 'system',
          content:
            'あなたは日本の EC（Shopify）向け商品ページのプロのコピーライターです。卸サイトの商品情報（中国語または機械翻訳調の日本語）を、自然で読みやすい日本語の商品ページに書き換えます。' +
            'タイトルはキーワードの羅列ではなく商品名＋主要特長に整理し、型番（例 YB-05）は末尾に残す。卸元の社名・倉庫名・発送案内・価格は本文に入れない。' +
            '景品表示法・薬機法に触れる表現（最高、No.1、治る、痩せる、など）は使わない。出力は JSON のみ。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction:
              '次の商品情報から JSON を返してください: {"title": 60字以内の日本語タイトル, "description_html": 商品説明HTML（<p><ul><li>のみ, 300-600字）, "bullets": 日本語の特長5点, "tags": 日本語タグ8-12個, "option_names": オプション名の日本語配列（例 COLOR→カラー, SIZE→サイズ）, "option_values": {元の選択肢: 日本語（既に日本語ならそのまま）}}',
            source_title: p.titleZh,
            source_description_html: (p.descriptionZh ?? '').replace(/<img[^>]*>/gi, '').slice(0, 6000),
            category: p.category ?? '',
            option_names_zh: optionNames,
            option_values_zh: optionValues,
          }),
        },
      ],
    });

    let copy: ListingCopy;
    try {
      copy = JSON.parse(res.content.replace(/^```json\s*|```$/g, '').trim());
    } catch (e) {
      await prisma.supplierProduct.update({ where: { id }, data: { status: 'error', lastError: `translate parse: ${res.content.slice(0, 200)}` } });
      throw e;
    }
    await prisma.supplierProduct.update({
      where: { id },
      data: {
        titleJa: copy.title,
        descriptionJa: copy.description_html,
        bulletsJa: copy.bullets,
        tags: copy.tags,
        raw: { ...((p.raw as object) ?? {}), optionNames, optionNamesJa: copy.option_names ?? [], optionValuesJa: copy.option_values ?? {} },
        status: 'translated',
        lastError: null,
      },
    });
    return copy;
  }

  // ───────────────────────── 3. Shopify 出品 ─────────────────────────

  async publish(id: string, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE') {
    const p = await prisma.supplierProduct.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(id);
    if (!p.titleJa) await this.translate(id);
    const fresh = (await prisma.supplierProduct.findUnique({ where: { id } }))!;
    const variants = fresh.variants as ScrapedProduct['variants'];
    const raw = (fresh.raw as any) ?? {};
    const optionNamesJa: string[] = raw.optionNamesJa?.length ? raw.optionNamesJa : raw.optionNames ?? [];
    const valuesJa: Record<string, string> = raw.optionValuesJa ?? {};
    const hasOptions = optionNamesJa.length > 0 && variants.some((v) => v.options?.length);

    const bullets = (fresh.bulletsJa as string[] | null) ?? [];
    const descriptionHtml =
      (bullets.length ? `<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : '') + (fresh.descriptionJa ?? '');

    try {
      const result = await this.shopify.createProduct({
        title: stripTemplateCode(fresh.titleJa!),
        descriptionHtml,
        vendor: this.vendor,
        productType: fresh.category ?? undefined,
        tags: (fresh.tags as string[] | null) ?? [],
        status,
        images: fresh.images as string[], // 卸サイトの原画像をそのまま使用（ユーザー決定）
        options: hasOptions ? optionNamesJa : undefined,
        variants: (() => {
          const seen = new Map<string, number>();
          return variants.map((v, i) => {
            // 選択肢が欠けている SKU は SKU コードで埋める（Shopify は空のオプション値を拒否）
            let ov = hasOptions ? optionNamesJa.map((_, k) => valuesJa[v.options?.[k] ?? ''] || v.options?.[k] || v.sku || `#${i + 1}`) : undefined;
            if (ov) {
              // 卸データに同じ選択肢の SKU が複数ある（"variant already exists"）→ 末尾の値に SKU を付けて一意化
              const key = ov.join('\u0000');
              const n = (seen.get(key) ?? 0) + 1;
              seen.set(key, n);
              if (n > 1) ov = [...ov.slice(0, -1), `${ov[ov.length - 1]} (${v.sku || i + 1})`];
            }
            return { sku: v.sku || `KJYF-${fresh.externalId}-${i + 1}`, price: this.retailPrice(v.wholesalePrice), optionValues: ov };
          });
        })(),
      });
      // 販売チャネル（オンラインストア + Headless）へ公開。スコープ不足等で失敗しても出品自体は成功扱い、lastError に残す
      let channelError: string | null = null;
      if (status === 'ACTIVE') {
        try {
          await this.shopify.publishToSalesChannels(result.productId);
        } catch (e) {
          channelError = `channel: ${String(e).slice(0, 300)}`;
          this.logger.warn(`${fresh.externalId} ${channelError}`);
        }
      }
      await prisma.supplierProduct.update({
        where: { id },
        data: { shopifyProductId: result.productId, shopifyHandle: result.handle, status: 'published', publishedAt: new Date(), lastError: channelError },
      });
      return { ...result, channelError };
    } catch (e) {
      await prisma.supplierProduct.update({ where: { id }, data: { status: 'error', lastError: String(e).slice(0, 500) } });
      throw e;
    }
  }

  /**
   * 出品済み商品の修復：
   *  - media: 失敗した画像（FAILED）を削除し、ステージドアップロードで再登録
   *  - channel: オンラインストア + Headless へ公開
   */
  async repairPublished(opts: { limit?: number; offset?: number; media?: boolean; channel?: boolean; ids?: string[]; reprocess?: boolean } = {}) {
    const limit = opts.limit ?? 500;
    const doMedia = opts.media ?? true;
    const reprocess = opts.reprocess ?? false; // true: 画像を本地 image-service で処理し直して全差し替え
    const doChannel = opts.channel ?? true;
    const todo = await prisma.supplierProduct.findMany({
      where: opts.ids?.length ? { id: { in: opts.ids } } : { status: 'published', shopifyProductId: { not: null } },
      take: limit,
      skip: opts.offset ?? 0,
      orderBy: { publishedAt: 'asc' },
    });
    const out: Array<{ id: string; externalId: string; media?: string; channel?: string }> = [];
    for (const p of todo) {
      const row: (typeof out)[number] = { id: p.id, externalId: p.externalId };
      const pid = p.shopifyProductId!;
      if (doMedia) {
        try {
          const media = await this.shopify.listProductMedia(pid);
          const failed = media.filter((m) => m.status === 'FAILED');
          const expected = Math.min((p.images as string[]).length, 12);
          const ready = media.length - failed.length;
          if (reprocess || failed.length || ready < expected) {
            // 1 枚でも失敗/不足があれば（または reprocess 指定時）全部消してステージドアップロードで入れ直す
            const staged = await this.shopify.stageImages(p.images as string[], 12, reprocess ? { process: true } : {});
            if (!staged.length) throw new Error('no image could be staged');
            await this.shopify.deleteProductMedia(pid, media.map((m) => m.id));
            await this.shopify.addProductMedia(pid, staged);
            await prisma.supplierProduct.update({ where: { id: p.id }, data: { raw: { ...((p.raw as object) ?? {}), imagesProcessed: reprocess } } });
            row.media = `${reprocess ? 'reprocessed' : 're-uploaded'} ${staged.length}/${expected} (had ${ready} ok, ${failed.length} failed)`;
          } else {
            row.media = `ok (${ready})`;
          }
        } catch (e) {
          row.media = `error: ${String(e).slice(0, 200)}`;
        }
      }
      if (doChannel) {
        try {
          await this.shopify.publishToSalesChannels(pid);
          row.channel = 'published';
        } catch (e) {
          row.channel = `error: ${String(e).slice(0, 200)}`;
        }
      }
      const err = [row.media, row.channel].filter((s) => s?.startsWith('error')).join(' | ') || null;
      await prisma.supplierProduct.update({ where: { id: p.id }, data: { lastError: err } });
      out.push(row);
    }
    return out;
  }

  /** 一括: 未出品のものを n 件まで翻訳→出品 */
  async publishBatch(limit = 10, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE') {
    const todo = await prisma.supplierProduct.findMany({ where: { status: { in: ['scraped', 'translated'] } }, take: limit, orderBy: { scrapedAt: 'asc' } });
    const out: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const p of todo) {
      try {
        await this.publish(p.id, status);
        out.push({ id: p.id, ok: true });
      } catch (e) {
        out.push({ id: p.id, ok: false, error: String(e).slice(0, 200) });
      }
    }
    return out;
  }

  // ───────────────────────── 4. 注文 ─────────────────────────

  /** Shopify orders/create webhook → 「確認待ち」草稿。顧客情報はローカル DB のみ */
  async intakeShopifyOrder(order: any) {
    const shopifyOrderId = String(order.admin_graphql_api_id ?? `gid://shopify/Order/${order.id}`);
    const exists = await prisma.dropshipOrder.findUnique({ where: { shopifyOrderId } });
    if (exists) return exists;

    const skus: string[] = (order.line_items ?? []).map((li: any) => li.sku).filter(Boolean);
    const products = await prisma.supplierProduct.findMany({ where: { shopifyProductId: { not: null } } });
    const skuToExternal = new Map<string, string>();
    for (const p of products) {
      for (const v of p.variants as ScrapedProduct['variants']) if (v.sku) skuToExternal.set(v.sku, p.externalId);
      (p.variants as any[]).forEach((_, i) => skuToExternal.set(`KJYF-${p.externalId}-${i + 1}`, p.externalId));
    }
    const a = order.shipping_address ?? {};
    const rec = await prisma.dropshipOrder.create({
      data: {
        shopifyOrderId,
        shopifyOrderName: order.name ?? String(order.order_number ?? order.id),
        totalPrice: Number(order.total_price ?? 0),
        currency: order.currency ?? 'JPY',
        lineItems: (order.line_items ?? []).map((li: any) => ({
          sku: li.sku,
          title: li.title,
          variantTitle: li.variant_title,
          qty: li.quantity,
          price: Number(li.price),
          supplierExternalId: li.sku ? skuToExternal.get(li.sku) ?? null : null,
        })),
        shipping: {
          name: `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim() || a.name,
          zip: a.zip,
          province: a.province,
          city: a.city,
          address1: a.address1,
          address2: a.address2,
          phone: a.phone ?? order.phone ?? order.customer?.phone,
          email: order.email,
        },
        status: 'pending_confirm',
        log: [{ at: new Date().toISOString(), step: 'intake', message: `webhook ${skus.length} SKU` }],
      },
    });
    this.logger.log(`dropship order ${rec.shopifyOrderName} 待确认`);
    return rec;
  }

  listOrders(status?: string) {
    return prisma.dropshipOrder.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** 人が「確認」→ 卸サイト発注キューへ（実際の発注は Windows 側の Playwright ワーカーが取りに来る） */
  async confirm(id: string, user: string) {
    const o = await prisma.dropshipOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException(id);
    return prisma.dropshipOrder.update({
      where: { id },
      data: {
        status: 'placing',
        confirmedBy: user,
        confirmedAt: new Date(),
        log: [...(((o.log as any[]) ?? [])), { at: new Date().toISOString(), step: 'confirm', message: `by ${user}` }],
      },
    });
  }

  /** 発注ワーカーからの結果報告 */
  async reportPlacement(id: string, body: { supplierOrderNo?: string; status: 'placed' | 'paid' | 'failed'; message?: string }) {
    const o = await prisma.dropshipOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException(id);
    return prisma.dropshipOrder.update({
      where: { id },
      data: {
        status: body.status,
        supplierOrderNo: body.supplierOrderNo ?? o.supplierOrderNo,
        placedAt: body.status !== 'failed' ? new Date() : o.placedAt,
        log: [...(((o.log as any[]) ?? [])), { at: new Date().toISOString(), step: body.status, message: body.message ?? '' }],
      },
    });
  }

  /** 追跡番号登録 → Shopify 発送通知 */
  async ship(id: string, tracking: { number: string; company?: string; url?: string }) {
    const o = await prisma.dropshipOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException(id);
    await this.shopify.fulfillOrder(o.shopifyOrderId, tracking);
    return prisma.dropshipOrder.update({
      where: { id },
      data: {
        status: 'shipped',
        trackingNumber: tracking.number,
        trackingCarrier: tracking.company,
        shippedAt: new Date(),
        log: [...(((o.log as any[]) ?? [])), { at: new Date().toISOString(), step: 'shipped', message: tracking.number }],
      },
    });
  }
}
