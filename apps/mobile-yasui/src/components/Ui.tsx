import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';

export const Loading = () => <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>;
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <View style={s.center}>
    <Text style={s.err}>読み込みに失敗しました</Text>
    <Text style={s.errSub}>{message}</Text>
    {onRetry && <Pressable onPress={onRetry} style={s.btn}><Text style={s.btnTxt}>再読み込み</Text></Pressable>}
  </View>
);
export const Button = ({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.btn, secondary && s.btnSec, disabled && { opacity: 0.5 }]} accessibilityRole="button">
    <Text style={[s.btnTxt, secondary && s.btnSecTxt]}>{title}</Text>
  </Pressable>
);
const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  err: { fontWeight: '700', color: C.ink }, errSub: { color: C.sub, fontSize: 12, textAlign: 'center' },
  btn: { backgroundColor: C.orange, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 1 },
  btnSec: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.red }, btnSecTxt: { color: C.red },
});
