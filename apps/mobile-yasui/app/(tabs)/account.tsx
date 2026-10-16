import { Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { PAGES } from '@/lib/config';
import { C } from '@/theme';

const Row = ({ title, url }: { title: string; url: string }) => (
  <Link href={{ pathname: '/web', params: { url, title } }} asChild>
    <Pressable style={s.row}><Text style={s.rowT}>{title}</Text><Text style={s.chev}>›</Text></Pressable>
  </Link>
);
export default function AccountScreen() {
  return (
    <ScrollView>
      <View style={s.group}>
        <Text style={s.gh}>ご注文</Text>
        <Row title="注文履歴・アカウント" url={PAGES.account} />
        <Row title="お問い合わせ" url={PAGES.contact} />
      </View>
      <View style={s.group}>
        <Text style={s.gh}>ご利用ガイド</Text>
        <Row title="配送について（全国送料無料・平日12時まで当日出荷）" url={PAGES.shipping} />
        <Row title="返品・交換について" url={PAGES.refund} />
        <Row title="特定商取引法に基づく表記" url={PAGES.legal} />
        <Row title="プライバシーポリシー" url={PAGES.privacy} />
        <Row title="利用規約" url={PAGES.terms} />
      </View>
      <View style={s.group}>
        <Text style={s.gh}>アネットについて</Text>
        <Row title="ANET について" url={PAGES.about} />
      </View>
      <Text style={s.ver}>安い v{Constants.expoConfig?.version} ・ アネット株式会社</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  group: { backgroundColor: C.white, marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  gh: { fontSize: 12, color: C.sub, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  rowT: { flex: 1, fontSize: 14, color: C.ink }, chev: { color: C.sub, fontSize: 18 },
  ver: { textAlign: 'center', color: C.sub, fontSize: 11, padding: 24 },
});
