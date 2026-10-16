import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Section } from '@/components/Section';
import { ErrorBox, Loading } from '@/components/Ui';
import { ALL_COLLECTION, GENRES, RANKING_COLLECTION, STORE_URL } from '@/lib/config';
import { collectionProducts, newArrivals, ProductCard } from '@/lib/shopify';
import { useAsync } from '@/lib/useAsync';
import { C } from '@/theme';

type Home = { ranking: ProductCard[]; recommend: ProductCard[]; fresh: ProductCard[]; health: ProductCard[]; daily: ProductCard[] };
async function loadHome(): Promise<Home> {
  const [r, a, f, h, d] = await Promise.all([
    collectionProducts(RANKING_COLLECTION, 10), collectionProducts(ALL_COLLECTION, 10, null, 'BEST_SELLING'), newArrivals(10),
    collectionProducts('健康-ダイエット', 10, null, 'BEST_SELLING'), collectionProducts('日用品雑貨', 10, null, 'BEST_SELLING'),
  ]);
  return { ranking: r?.products.nodes ?? [], recommend: a?.products.nodes ?? [], fresh: f, health: h?.products.nodes ?? [], daily: d?.products.nodes ?? [] };
}

export default function HomeScreen() {
  const { data, error, loading, reload } = useAsync(loadHome, []);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await Promise.resolve(reload()); setRefreshing(false); }, [reload]);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  const h = data!;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} />}>
      {/* ジャンル横スクロール（楽天のジャンルバー） */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.genreBar} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {[{ handle: ALL_COLLECTION, label: '全商品' }, ...GENRES].map((g) => (
          <Link key={g.handle} href={{ pathname: '/collection/[handle]', params: { handle: g.handle } }} asChild>
            <Pressable style={s.genreChip}><Text style={s.genreTxt}>{g.label}</Text></Pressable>
          </Link>
        ))}
      </ScrollView>
      {/* バナー */}
      <Link href={{ pathname: '/collection/[handle]', params: { handle: RANKING_COLLECTION } }} asChild>
        <Pressable style={s.hero}>
          <Image source={`${STORE_URL}/cdn/shop/files/hero-mobile.png?width=1080`} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={s.heroText}>
            <Text style={s.heroH}>日本一の安さを、{'\n'}目指して。</Text>
            <Text style={s.heroS}>全国送料無料 ・ 表示価格は税込 ・ 平日12時までのご注文は当日出荷</Text>
          </View>
        </Pressable>
      </Link>
      {/* 4 つの約束 */}
      <View style={s.promise}>
        {[['国内倉庫から直送', '海外発送ではありません'], ['当日出荷', '平日12時までのご注文'], ['1,000点以上', '毎週新商品を追加'], ['安心サポート', '到着後7日以内 交換・返金']].map(([t, d]) => (
          <View key={t} style={s.promiseItem}><Text style={s.promiseT}>{t}</Text><Text style={s.promiseD}>{d}</Text></View>
        ))}
      </View>
      <Section title="リアルタイムランキング" sub="今いちばん売れている・見られているアイテム" items={h.ranking} ranked more={{ pathname: '/collection/[handle]', params: { handle: RANKING_COLLECTION } }} />
      <Section title="あなたへのおすすめ" items={h.recommend} more={{ pathname: '/collection/[handle]', params: { handle: ALL_COLLECTION } }} />
      <Section title="特集｜おうちで、からだを整える" items={h.health} more={{ pathname: '/collection/[handle]', params: { handle: '健康-ダイエット' } }} />
      <Section title="特集｜毎日のちょっとした不便を解決" items={h.daily} more={{ pathname: '/collection/[handle]', params: { handle: '日用品雑貨' } }} />
      <Section title="新着アイテム" items={h.fresh} more={{ pathname: '/collection/[handle]', params: { handle: ALL_COLLECTION } }} />
      <Text style={s.foot}>アネット株式会社 ・ 表示価格はすべて税込</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  genreBar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 7, marginHorizontal: 3, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  genreTxt: { fontSize: 13, color: C.ink, fontWeight: '600' },
  hero: { height: 190, backgroundColor: '#eee', justifyContent: 'flex-end' },
  heroText: { padding: 16, backgroundColor: 'rgba(255,255,255,.82)' },
  heroH: { fontSize: 22, fontWeight: '800', color: C.ink, lineHeight: 30 },
  heroS: { fontSize: 11.5, color: '#333', marginTop: 6 },
  promise: { flexDirection: 'row', backgroundColor: C.white, paddingVertical: 10, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  promiseItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  promiseT: { fontSize: 11.5, fontWeight: '700', color: C.ink, textAlign: 'center' },
  promiseD: { fontSize: 9.5, color: C.sub, textAlign: 'center', marginTop: 2 },
  foot: { textAlign: 'center', color: C.sub, fontSize: 11, padding: 24 },
});
