import { Link, Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
export default function NotFound() {
  return (<><Stack.Screen options={{ title: 'ページがありません' }} /><View style={s.c}><Text>ページが見つかりませんでした。</Text><Link href="/" style={s.l}>ホームへ戻る</Link></View></>);
}
const s = StyleSheet.create({ c: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, l: { color: '#BF0000', fontWeight: '700' } });
