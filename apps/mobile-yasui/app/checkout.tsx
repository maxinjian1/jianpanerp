// Shopify のチェックアウトを WebView で表示。注文完了 (thank_you) を検知したらカートを空にする。
import { Stack, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ErrorBox } from '@/components/Ui';
import { useCart } from '@/lib/cart';
import { C } from '@/theme';

export default function CheckoutScreen() {
  const { cart, reset } = useCart();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const finished = useRef(false);
  if (!cart) return <ErrorBox message="カートが空です" onRetry={() => router.back()} />;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerLeft: () => <Pressable hitSlop={10} onPress={() => router.back()}><Text style={{ fontSize: 15, color: C.red }}>{done ? '閉じる' : 'キャンセル'}</Text></Pressable> }} />
      {progress < 1 && <View style={[s.bar, { width: `${Math.max(progress * 100, 5)}%` }]} />}
      <WebView
        source={{ uri: cart.checkoutUrl }}
        startInLoadingState
        renderLoading={() => <View style={s.load}><ActivityIndicator color={C.red} size="large" /></View>}
        onLoadProgress={(e) => setProgress(e.nativeEvent.progress)}
        sharedCookiesEnabled thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={(nav) => {
          if (!finished.current && /\/thank[-_]you|\/orders\/|\/checkouts\/[^/]+\/thank_you/.test(nav.url)) { finished.current = true; setDone(true); reset(); }
        }}
      />
    </View>
  );
}
const s = StyleSheet.create({ bar: { height: 2, backgroundColor: C.red }, load: { position:"absolute",top:0,left:0,right:0,bottom:0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white } });
