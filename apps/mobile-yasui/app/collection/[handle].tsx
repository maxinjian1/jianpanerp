import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProductGrid } from '@/components/ProductGrid';
import { ErrorBox, Loading } from '@/components/Ui';
import { GENRES, RANKING_COLLECTION } from '@/lib/config';
import { collectionProducts, ProductCard } from '@/lib/shopify';
import { C } from '@/theme';

type Sort = { key: 'COLLECTION_DEFAULT' | 'BEST_SELLING' | 'CREATED' | 'PRICE'; reverse: boolean; label: string };
const SORTS: Sort[] = [{ key: 'COLLECTION_DEFAULT', reverse: false, label: 'おすすめ' }, { key: 'BEST_SELLING', reverse: false, label: '売れ筋' }, { key: 'CREATED', reverse: true, label: '新着' }, { key: 'PRICE', reverse: false, label: '価格が安い' }, { key: 'PRICE', reverse: true, label: '価格が高い' }];

export default function CollectionScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [sort, setSort] = useState(0); const [title, setTitle] = useState(''); const [items, setItems] = useState<ProductCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (after: string | null = null) => {
    setLoading(true); setError(null);
    try {
      const c = await collectionProducts(handle, 24, after, SORTS[sort].key, SORTS[sort].reverse);
      if (!c) { setError('コレクションが見つかりません'); return; }
      setTitle(handle === RANKING_COLLECTION ? 'リアルタイムランキング' : GENRES.find((g) => g.handle === handle)?.label ?? c.title);
      setItems((prev) => after ? [...prev, ...c.products.nodes] : c.products.nodes);
      setCursor(c.products.pageInfo.hasNextPage ? c.products.pageInfo.endCursor : null);
    } catch (e) { setError(String((e as Error).message)); } finally { setLoading(false); }
  }, [handle, sort]);
  useEffect(() => { load(); }, [load]);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title }} />
      <View style={s.sortBar}>
        {SORTS.map((o, i) => <Pressable key={o.label} onPress={() => setSort(i)} style={[s.sort, i === sort && s.sortOn]}><Text style={[s.sortTxt, i === sort && s.sortTxtOn]}>{o.label}</Text></Pressable>)}
      </View>
      {loading && !items.length ? <Loading /> : error && !items.length ? <ErrorBox message={error} onRetry={() => load()} /> : (
        <ProductGrid items={items} ranked={handle === RANKING_COLLECTION && sort === 0} onEnd={() => cursor && !loading && load(cursor)} loadingMore={loading} />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  sortBar: { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 6, paddingVertical: 6, gap: 4 },
  sort: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }, sortOn: { backgroundColor: C.red },
  sortTxt: { fontSize: 12, color: C.ink }, sortTxtOn: { color: '#fff', fontWeight: '700' },
});
