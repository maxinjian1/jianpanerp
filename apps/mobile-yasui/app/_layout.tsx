import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { CartProvider } from '@/lib/cart';
import { C } from '@/theme';

export default function RootLayout() {
  return (
    <CartProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: C.ink, headerTitleStyle: { fontWeight: '700' }, headerBackTitle: '戻る', contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[handle]" options={{ title: '商品詳細' }} />
        <Stack.Screen name="collection/[handle]" options={{ title: '' }} />
        <Stack.Screen name="checkout" options={{ title: 'ご購入手続き', presentation: 'fullScreenModal' }} />
        <Stack.Screen name="web" options={{ title: '' }} />
      </Stack>
    </CartProvider>
  );
}
