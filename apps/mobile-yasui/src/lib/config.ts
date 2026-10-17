const env = process.env;
// 両方の変数名を受け付ける（Headless チャネルの案内に合わせた EXPO_PUBLIC_SHOPIFY_* 系と、.env.example の EXPO_PUBLIC_STOREFRONT_* 系）
export const SHOP_DOMAIN = env.EXPO_PUBLIC_SHOPIFY_DOMAIN ?? env.EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN ?? '0scqav-e7.myshopify.com';
export const STOREFRONT_TOKEN = env.EXPO_PUBLIC_STOREFRONT_TOKEN ?? env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? '';
export const API_VERSION = env.EXPO_PUBLIC_STOREFRONT_API_VERSION ?? env.EXPO_PUBLIC_SHOPIFY_API_VERSION ?? '2026-10';
export const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL ?? 'https://anetmc.com';

/** ホームの「ジャンル」タブと一致させる。handle は Shopify のコレクション handle。 */
export const GENRES: { handle: string; label: string; image: string }[] = [
  { handle: '日用品雑貨', label: '日用品雑貨', image: 'cat-daily' },
  { handle: '健康-ダイエット', label: '健康・ダイエット', image: 'cat-health' },
  { handle: 'スマートフォン-パソコン-周辺機器', label: 'スマホ・PC', image: 'cat-phone' },
  { handle: '家具-インテリア', label: '家具・インテリア', image: 'cat-furniture' },
  { handle: '旅行-キャンプ用品', label: '旅行・キャンプ', image: 'cat-camp' },
  { handle: 'ペット用品', label: 'ペット用品', image: 'cat-pet' },
  { handle: 'ベビー-マタニティ', label: 'ベビー・マタニティ', image: 'cat-baby' },
  { handle: '衣類-アクセサリー', label: '衣類・アクセサリー', image: 'cat-fashion' },
];
export const RANKING_COLLECTION = 'frontpage'; // 「ホームページ」= 主推 TOP
export const ALL_COLLECTION = '全商品';

/** 法定ページ等（WebView で表示） */
export const PAGES = {
  legal: `${STORE_URL}/policies/legal-notice`,
  privacy: `${STORE_URL}/policies/privacy-policy`,
  refund: `${STORE_URL}/policies/refund-policy`,
  shipping: `${STORE_URL}/policies/shipping-policy`,
  terms: `${STORE_URL}/policies/terms-of-service`,
  contact: `${STORE_URL}/pages/contact`,
  about: `${STORE_URL}/pages/story`,
  account: `${STORE_URL}/account`,
};
