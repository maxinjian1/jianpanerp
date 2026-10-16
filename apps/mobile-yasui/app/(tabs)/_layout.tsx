import { Tabs } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { useCart } from '@/lib/cart';
import { C } from '@/theme';

// 絵文字タブアイコン：アイコンフォント依存を避ける（審査上も問題なし）
const Icon = ({ glyph, focused }: { glyph: string; focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;

export default function TabLayout() {
  const { cart } = useCart();
  const n = cart?.totalQuantity ?? 0;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.red, tabBarInactiveTintColor: C.sub, headerTitleStyle: { fontWeight: '700' }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'ホーム', headerTitle: '安い', headerTitleStyle: { color: C.red, fontWeight: '800', fontSize: 22 }, tabBarIcon: ({ focused }) => <Icon glyph="🏠" focused={focused} /> }} />
      <Tabs.Screen name="genres" options={{ title: 'ジャンル', tabBarIcon: ({ focused }) => <Icon glyph="🗂️" focused={focused} /> }} />
      <Tabs.Screen name="search" options={{ title: '検索', tabBarIcon: ({ focused }) => <Icon glyph="🔍" focused={focused} /> }} />
      <Tabs.Screen name="cart" options={{ title: 'カート', tabBarBadge: n > 0 ? n : undefined, tabBarBadgeStyle: { backgroundColor: C.red }, tabBarIcon: ({ focused }) => <View><Icon glyph="🛒" focused={focused} /></View> }} />
      <Tabs.Screen name="account" options={{ title: 'マイページ', tabBarIcon: ({ focused }) => <Icon glyph="👤" focused={focused} /> }} />
    </Tabs>
  );
}
