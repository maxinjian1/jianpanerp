import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ProductCard } from './ProductCard';
import type { ProductCard as P } from '@/lib/shopify';
import { C } from '@/theme';

export function ProductGrid({ items, ranked, onEnd, loadingMore, header, empty }: { items: P[]; ranked?: boolean; onEnd?: () => void; loadingMore?: boolean; header?: React.ComponentProps<typeof FlatList>['ListHeaderComponent']; empty?: string }) {
  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 4 : 2, gap = 10, w = (width - gap * (cols + 1)) / cols;
  return (
    <FlatList
      key={cols}
      data={items}
      numColumns={cols}
      keyExtractor={(p) => p.id}
      columnWrapperStyle={{ gap, paddingHorizontal: gap }}
      contentContainerStyle={{ gap, paddingBottom: 24 }}
      renderItem={({ item, index }) => <ProductCard p={item} width={w} rank={ranked ? index + 1 : undefined} />}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={s.empty}>{empty ?? '商品が見つかりませんでした'}</Text>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={C.red} /> : <View style={{ height: 8 }} />}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
    />
  );
}
const s = StyleSheet.create({ empty: { textAlign: 'center', color: C.sub, padding: 40 } });
