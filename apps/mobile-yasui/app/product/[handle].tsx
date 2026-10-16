import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button, ErrorBox, Loading } from '@/components/Ui';
import { useCart } from '@/lib/cart';
import { STORE_URL } from '@/lib/config';
import { productByHandle } from '@/lib/shopify';
import { useAsync } from '@/lib/useAsync';
import { C, yen } from '@/theme';

export default function ProductScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { data: p, error, loading, reload } = useAsync(() => productByHandle(handle), [handle]);
  const { add, loading: adding } = useCart();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<Record<string, string>>({});
  const [img, setImg] = useState(0);
  const [descH, setDescH] = useState(200);

  const variant = useMemo(() => {
    if (!p) return null;
    const vs = p.variants.nodes;
    if (vs.length === 1) return vs[0];
    const hit = vs.find((v) => v.selectedOptions.every((o) => (sel[o.name] ?? p.options.find((x) => x.name === o.name)?.values[0]) === o.value));
    return hit ?? vs[0];
  }, [p, sel]);

  if (loading) return <Loading />;
  if (error || !p) return <ErrorBox message={error ?? '商品が見つかりません'} onRetry={reload} />;
  const v = variant!;
  const compare = v.compareAtPrice ? Number(v.compareAtPrice.amount) : 0;
  const price = Number(v.price.amount);
  const images = p.images.nodes.length ? p.images.nodes : p.featuredImage ? [p.featuredImage] : [];
  const hasOptions = p.options.length > 0 && !(p.options.length === 1 && p.options[0].values.length === 1 && p.options[0].values[0] === 'Default Title');

  const onAdd = async (goCheckout: boolean) => {
    try { await add(v.id, 1); if (goCheckout) router.push('/checkout'); else Alert.alert('カートに追加しました', p.title, [{ text: '買い物を続ける' }, { text: 'カートを見る', onPress: () => router.push('/cart') }]); }
    catch (e) { Alert.alert('追加できませんでした', String((e as Error).message)); }
  };
  // 商品説明は Shopify の HTML をそのまま表示（WebView、スクリプト無効）
  const descHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;margin:0;padding:0 2px;word-break:break-word}img{max-width:100%;height:auto}table{max-width:100%}h1,h2,h3{font-size:15px}</style></head><body>${p.descriptionHtml}<script>function r(){window.ReactNativeWebView.postMessage(String(document.documentElement.scrollHeight))}window.onload=r;setTimeout(r,500);setTimeout(r,2000)</script></body></html>`;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable hitSlop={10} onPress={() => Share.share({ message: `${p.title} ${STORE_URL}/products/${p.handle}` })}><Text style={{ fontSize: 18 }}>⇪</Text></Pressable> }} />
      <ScrollView>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setImg(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {images.map((im, i) => <Image key={i} source={im.url} style={{ width, height: width, backgroundColor: '#fafafa' }} contentFit="contain" />)}
        </ScrollView>
        {images.length > 1 && <View style={s.dots}>{images.map((_, i) => <View key={i} style={[s.dot, i === img && s.dotOn]} />)}</View>}
        <View style={s.box}>
          <Text style={s.title}>{p.title}</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{yen(price)}</Text><Text style={s.tax}>（税込）</Text>
            {compare > price && <><Text style={s.compare}>{yen(compare)}</Text><Text style={s.off}>{Math.round((1 - price / compare) * 100)}%OFF</Text></>}
          </View>
          <View style={s.badges}>{['全国送料無料', '平日12時までのご注文は当日出荷', '国内倉庫から直送'].map((b) => <Text key={b} style={s.badge}>{b}</Text>)}</View>
          <Text style={s.stock}>{v.availableForSale ? (v.quantityAvailable != null && v.quantityAvailable <= 5 && v.quantityAvailable > 0 ? `残り${v.quantityAvailable}点` : '在庫あり') : '売り切れ'}</Text>
        </View>
        {hasOptions && (
          <View style={s.box}>
            {p.options.map((o) => (
              <View key={o.name} style={{ marginBottom: 10 }}>
                <Text style={s.optName}>{o.name}</Text>
                <View style={s.optRow}>{o.values.map((val) => { const on = (sel[o.name] ?? o.values[0]) === val; return <Pressable key={val} onPress={() => setSel({ ...sel, [o.name]: val })} style={[s.opt, on && s.optOn]}><Text style={[s.optTxt, on && s.optTxtOn]}>{val}</Text></Pressable>; })}</View>
              </View>
            ))}
          </View>
        )}
        <View style={s.box}>
          <Text style={s.h}>お届けの目安</Text>
          <Text style={s.p}>ご注文確定後、通常1〜3営業日でお届けします（平日12時までのご注文は当日出荷）。離島・一部地域は追加日数をいただく場合があります。</Text>
          <Text style={s.h}>返品・交換</Text>
          <Text style={s.p}>初期不良・誤配送は商品到着後7日以内にご連絡ください。送料当店負担で交換または返金いたします。</Text>
          <Text style={s.h}>お支払い</Text>
          <Text style={s.p}>クレジットカード、Apple Pay、Google Pay、コンビニ決済、PayPay、銀行振込に対応しています（購入手続き画面でご確認ください）。</Text>
        </View>
        <View style={s.box}>
          <Text style={s.h}>商品説明</Text>
          <WebView originWhitelist={['*']} source={{ html: descHtml }} style={{ height: descH, backgroundColor: 'transparent' }} scrollEnabled={false} javaScriptEnabled onMessage={(e) => { const h = Number(e.nativeEvent.data); if (h > 0 && h < 20000) setDescH(h + 16); }} />
        </View>
        <View style={{ height: 16 }} />
      </ScrollView>
      <View style={s.footer}>
        <View style={{ flex: 1 }}>
          <Button title={v.availableForSale ? 'カートに入れる' : '売り切れ'} onPress={() => onAdd(false)} disabled={!v.availableForSale || adding} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="今すぐ購入" onPress={() => onAdd(true)} disabled={!v.availableForSale || adding} secondary />
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: C.white },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' }, dotOn: { backgroundColor: C.red },
  box: { backgroundColor: C.white, padding: 14, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', lineHeight: 25, color: C.ink },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10, flexWrap: 'wrap' },
  price: { fontSize: 26, fontWeight: '800', color: C.red }, tax: { fontSize: 12, color: C.sub, marginLeft: 3 },
  compare: { marginLeft: 10, color: C.sub, textDecorationLine: 'line-through' }, off: { marginLeft: 6, color: C.red, fontWeight: '700', fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { fontSize: 11, color: C.orange, borderWidth: 1, borderColor: C.orange, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 2 },
  stock: { marginTop: 10, fontSize: 13, color: C.green, fontWeight: '600' },
  optName: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { borderWidth: 1, borderColor: C.line, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 }, optOn: { borderColor: C.red, backgroundColor: '#FFF4F4' },
  optTxt: { fontSize: 13, color: C.ink }, optTxtOn: { color: C.red, fontWeight: '700' },
  h: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 6, marginBottom: 4 }, p: { fontSize: 13, color: '#333', lineHeight: 20, marginBottom: 8 },
  footer: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 20, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line },
});
