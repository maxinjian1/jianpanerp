import { Link, Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProductCard } from './ProductCard';
import type { ProductCard as P } from '@/lib/shopify';
import { C } from '@/theme';

/** 楽天風：赤い左ボーダーの見出し + 横スクロール商品列 */
export function Section({ title, sub, items, ranked, more }: { title: string; sub?: string; items: P[]; ranked?: boolean; more?: Href }) {
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {sub ? <Text style={s.sub}>{sub}</Text> : null}
        </View>
        {more ? <Link href={more} style={s.more}>すべて見る ›</Link> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}>
        {items.map((p, i) => <ProductCard key={p.id} p={p} width={150} rank={ranked ? i + 1 : undefined} />)}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { paddingVertical: 12, backgroundColor: C.white, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', color: C.ink, borderLeftWidth: 5, borderLeftColor: C.red, paddingLeft: 8, lineHeight: 22 },
  sub: { fontSize: 12, color: C.sub, marginTop: 4, paddingLeft: 13 },
  more: { color: C.red, fontSize: 13, fontWeight: '600' },
});
