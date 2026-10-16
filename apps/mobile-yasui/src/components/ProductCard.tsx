import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, yen } from '@/theme';
import type { ProductCard as P } from '@/lib/shopify';

export function ProductCard({ p, rank, width }: { p: P; rank?: number; width: number }) {
  const price = Number(p.priceRange.minVariantPrice.amount);
  const compare = Number(p.compareAtPriceRange.minVariantPrice.amount);
  const sale = compare > price;
  return (
    <Link href={{ pathname: '/product/[handle]', params: { handle: p.handle } }} asChild>
      <Pressable style={[s.card, { width }]} accessibilityRole="button" accessibilityLabel={p.title}>
        <View>
          <Image source={p.featuredImage?.url} style={{ width: '100%', aspectRatio: 1, backgroundColor: '#fafafa' }} contentFit="cover" transition={150} />
          {rank != null && <View style={[s.rank, { backgroundColor: rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : '#555' }]}><Text style={s.rankTxt}>{rank}位</Text></View>}
          {sale && <View style={s.sale}><Text style={s.saleTxt}>セール</Text></View>}
          {!p.availableForSale && <View style={s.soldout}><Text style={s.soldoutTxt}>売り切れ</Text></View>}
        </View>
        <View style={s.body}>
          <Text numberOfLines={2} style={s.title}>{p.title}</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{yen(price)}</Text><Text style={s.tax}>（税込）</Text>
            {sale && <Text style={s.compare}>{yen(compare)}</Text>}
          </View>
          <Text style={s.ship}>送料無料</Text>
        </View>
      </Pressable>
    </Link>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 6, overflow: 'hidden' },
  body: { padding: 8, gap: 4 },
  title: { fontSize: 12.5, lineHeight: 17, color: C.ink, minHeight: 34 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  price: { fontSize: 16, fontWeight: '700', color: C.red },
  tax: { fontSize: 10, color: C.sub, marginLeft: 2 },
  compare: { fontSize: 11, color: C.sub, textDecorationLine: 'line-through', marginLeft: 6 },
  ship: { alignSelf: 'flex-start', fontSize: 10, color: C.green, borderWidth: 1, borderColor: C.green, borderRadius: 2, paddingHorizontal: 5, lineHeight: 15 },
  rank: { position: 'absolute', top: 0, left: 0, paddingHorizontal: 7, paddingVertical: 3, borderBottomRightRadius: 6 },
  rankTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sale: { position: 'absolute', top: 6, right: 6, backgroundColor: C.red, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  saleTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  soldout: { position:"absolute",top:0,left:0,right:0,bottom:0, backgroundColor: 'rgba(255,255,255,.6)', alignItems: 'center', justifyContent: 'center' },
  soldoutTxt: { color: C.ink, fontWeight: '700' },
});
