// Shopify Storefront API（GraphQL）薄いクライアント。公開トークンのみ使用、顧客情報は扱わない。
import { API_VERSION, SHOP_DOMAIN, STOREFRONT_TOKEN } from './config';

const ENDPOINT = `https://${SHOP_DOMAIN}/api/${API_VERSION}/graphql.json`;

export class StorefrontError extends Error {}

export async function sf<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!STOREFRONT_TOKEN) throw new StorefrontError('EXPO_PUBLIC_STOREFRONT_TOKEN が未設定です（.env を確認）');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN, 'Accept-Language': 'ja' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new StorefrontError(`Storefront ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new StorefrontError(json.errors.map((e) => e.message).join('; '));
  return json.data as T;
}

// ---------- 型 ----------
export type Money = { amount: string; currencyCode: string };
export type Img = { url: string; altText: string | null; width?: number; height?: number };
export type ProductCard = {
  id: string; handle: string; title: string; vendor: string; availableForSale: boolean;
  featuredImage: Img | null;
  priceRange: { minVariantPrice: Money };
  compareAtPriceRange: { minVariantPrice: Money };
};
export type Variant = { id: string; title: string; availableForSale: boolean; quantityAvailable?: number | null; price: Money; compareAtPrice: Money | null; image: Img | null; selectedOptions: { name: string; value: string }[] };
export type Product = ProductCard & {
  descriptionHtml: string; description: string; productType: string; tags: string[];
  images: { nodes: Img[] };
  options: { name: string; values: string[] }[];
  variants: { nodes: Variant[] };
};
export type CartLine = { id: string; quantity: number; cost: { totalAmount: Money }; merchandise: { id: string; title: string; image: Img | null; price: Money; product: { handle: string; title: string } } };
export type Cart = { id: string; checkoutUrl: string; totalQuantity: number; cost: { subtotalAmount: Money; totalAmount: Money }; lines: { nodes: CartLine[] } };

const CARD = `fragment Card on Product { id handle title vendor availableForSale featuredImage { url(transform:{maxWidth:600,maxHeight:600}) altText width height } priceRange { minVariantPrice { amount currencyCode } } compareAtPriceRange { minVariantPrice { amount currencyCode } } }`;
const CART = `fragment CartFields on Cart { id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } lines(first: 100) { nodes { id quantity cost { totalAmount { amount currencyCode } } merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url(transform:{maxWidth:300,maxHeight:300}) altText } product { handle title } } } } } }`;

// ---------- 商品 ----------
export async function collectionProducts(handle: string, first = 24, after?: string | null, sortKey: 'BEST_SELLING' | 'CREATED' | 'PRICE' | 'COLLECTION_DEFAULT' = 'COLLECTION_DEFAULT', reverse = false) {
  const d = await sf<{ collection: { title: string; products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductCard[] } } | null }>(
    `${CARD} query($h:String!,$n:Int!,$a:String,$s:ProductCollectionSortKeys,$r:Boolean){ collection(handle:$h){ title products(first:$n, after:$a, sortKey:$s, reverse:$r){ pageInfo{hasNextPage endCursor} nodes{ ...Card } } } }`,
    { h: handle, n: first, a: after ?? null, s: sortKey, r: reverse },
  );
  return d.collection;
}

export async function newArrivals(first = 10) {
  const d = await sf<{ products: { nodes: ProductCard[] } }>(`${CARD} query($n:Int!){ products(first:$n, sortKey:CREATED_AT, reverse:true, query:"vendor:ANET"){ nodes{ ...Card } } }`, { n: first });
  return d.products.nodes;
}

export async function productByHandle(handle: string) {
  const d = await sf<{ product: Product | null }>(
    `${CARD} query($h:String!){ product(handle:$h){ ...Card descriptionHtml description productType tags images(first:12){ nodes{ url(transform:{maxWidth:1200,maxHeight:1200}) altText width height } } options{ name values } variants(first:50){ nodes{ id title availableForSale price{amount currencyCode} compareAtPrice{amount currencyCode} image{ url(transform:{maxWidth:600,maxHeight:600}) altText } selectedOptions{ name value } } } } }`,
    { h: handle },
  );
  return d.product;
}

export async function searchProducts(q: string, first = 24, after?: string | null) {
  const d = await sf<{ search: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductCard[] } }>(
    `${CARD} query($q:String!,$n:Int!,$a:String){ search(query:$q, first:$n, after:$a, types:[PRODUCT], productFilters:[{available:true}]){ pageInfo{hasNextPage endCursor} nodes{ ...on Product { ...Card } } } }`,
    { q, n: first, a: after ?? null },
  );
  return d.search;
}

// ---------- カート ----------
export async function cartCreate(lines: { merchandiseId: string; quantity: number }[] = []) {
  const d = await sf<{ cartCreate: { cart: Cart | null; userErrors: { message: string }[] } }>(`${CART} mutation($l:[CartLineInput!]){ cartCreate(input:{ lines:$l, buyerIdentity:{ countryCode: JP } }){ cart{ ...CartFields } userErrors{ message } } }`, { l: lines });
  if (d.cartCreate.userErrors.length) throw new StorefrontError(d.cartCreate.userErrors[0].message);
  return d.cartCreate.cart!;
}
export async function cartFetch(id: string) {
  const d = await sf<{ cart: Cart | null }>(`${CART} query($id:ID!){ cart(id:$id){ ...CartFields } }`, { id });
  return d.cart;
}
export async function cartLinesAdd(cartId: string, lines: { merchandiseId: string; quantity: number }[]) {
  const d = await sf<{ cartLinesAdd: { cart: Cart | null; userErrors: { message: string }[] } }>(`${CART} mutation($id:ID!,$l:[CartLineInput!]!){ cartLinesAdd(cartId:$id, lines:$l){ cart{ ...CartFields } userErrors{ message } } }`, { id: cartId, l: lines });
  if (d.cartLinesAdd.userErrors.length) throw new StorefrontError(d.cartLinesAdd.userErrors[0].message);
  return d.cartLinesAdd.cart!;
}
export async function cartLinesUpdate(cartId: string, lines: { id: string; quantity: number }[]) {
  const d = await sf<{ cartLinesUpdate: { cart: Cart | null; userErrors: { message: string }[] } }>(`${CART} mutation($id:ID!,$l:[CartLineUpdateInput!]!){ cartLinesUpdate(cartId:$id, lines:$l){ cart{ ...CartFields } userErrors{ message } } }`, { id: cartId, l: lines });
  if (d.cartLinesUpdate.userErrors.length) throw new StorefrontError(d.cartLinesUpdate.userErrors[0].message);
  return d.cartLinesUpdate.cart!;
}
export async function cartLinesRemove(cartId: string, lineIds: string[]) {
  const d = await sf<{ cartLinesRemove: { cart: Cart | null; userErrors: { message: string }[] } }>(`${CART} mutation($id:ID!,$l:[ID!]!){ cartLinesRemove(cartId:$id, lineIds:$l){ cart{ ...CartFields } userErrors{ message } } }`, { id: cartId, l: lineIds });
  if (d.cartLinesRemove.userErrors.length) throw new StorefrontError(d.cartLinesRemove.userErrors[0].message);
  return d.cartLinesRemove.cart!;
}
