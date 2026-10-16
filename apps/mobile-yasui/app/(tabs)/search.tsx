import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ProductGrid } from '@/components/ProductGrid';
import { ErrorBox } from '@/components/Ui';
import { ProductCard, searchProducts } from '@/lib/shopify';
import { C } from '@/theme';

const HOT = ['収納', 'リュック', 'iPhone ケース', 'ラグ', 'シャンプー', 'キャットタワー', '折りたたみ', '珪藻土'];

export default function SearchScreen() {
  const [q, setQ] = useState(''); const [items, setItems] = useState<ProductCard[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (term: string, after: string | null = null) => {
    if (!term.trim()) { setItems([]); setSearched(false); return; }
    setLoading(true); setError(null);
    try { const r = await searchProducts(term.trim(), 24, after); setItems((prev) => after ? [...prev, ...r.nodes] : r.nodes); setCursor(r.pageInfo.hasNextPage ? r.pageInfo.endCursor : null); setSearched(true); }
    catch (e) { setError(String((e as Error).message)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => run(q), 400); return () => { if (timer.current) clearTimeout(timer.current); }; }, [q, run]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        <TextInput value={q} onChangeText={setQ} placeholder="商品名・キーワードで検索" placeholderTextColor="#999" style={s.input} returnKeyType="search" onSubmitEditing={() => run(q)} clearButtonMode="while-editing" autoCorrect={false} />
      </View>
      {!searched && !loading ? (
        <View style={s.hot}><Text style={s.hotT}>人気のキーワード</Text><View style={s.chips}>{HOT.map((h) => <Text key={h} onPress={() => setQ(h)} style={s.chip}>{h}</Text>)}</View></View>
      ) : error ? <ErrorBox message={error} onRetry={() => run(q)} /> : (
        <ProductGrid items={items} onEnd={() => cursor && !loading && run(q, cursor)} loadingMore={loading} empty={`「${q}」に一致する商品はありません`} />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  bar: { padding: 10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  input: { backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 14, height: 42, fontSize: 15, color: C.ink },
  hot: { padding: 16 }, hotT: { fontWeight: '700', color: C.ink, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontSize: 13, color: C.ink, overflow: 'hidden' },
});
