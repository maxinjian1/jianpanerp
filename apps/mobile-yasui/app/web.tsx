import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '@/theme';

export default function WebScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: title ?? '' }} />
      <WebView source={{ uri: url }} startInLoadingState renderLoading={() => <View style={s.load}><ActivityIndicator color={C.red} size="large" /></View>} sharedCookiesEnabled />
    </View>
  );
}
const s = StyleSheet.create({ load: { position:"absolute",top:0,left:0,right:0,bottom:0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' } });
