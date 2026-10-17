import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ALL_COLLECTION, GENRES, STORE_URL } from '@/lib/config';
import { C } from '@/theme';

export default function GenresScreen() {
  return (
    <ScrollView contentContainerStyle={s.grid}>
      <Link href={{ pathname: '/collection/[handle]', params: { handle: ALL_COLLECTION } }} asChild>
        <Pressable style={StyleSheet.flatten([s.tile, s.all])}><Text style={s.allTxt}>全商品を見る ›</Text></Pressable>
      </Link>
      {GENRES.map((g) => (
        <Link key={g.handle} href={{ pathname: '/collection/[handle]', params: { handle: g.handle } }} asChild>
          <Pressable style={s.tile}>
            <Image source={`${STORE_URL}/cdn/shop/files/${g.image}.png?width=600`} style={s.img} contentFit="cover" transition={150} />
            <View style={s.label}><Text style={s.labelTxt}>{g.label}</Text></View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 10 },
  tile: { width: '48%', flexGrow: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  all: { width: '100%', aspectRatio: undefined, paddingVertical: 16, alignItems: 'center', backgroundColor: C.red, borderColor: C.red },
  allTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  img: { width: '100%', height: '100%' },
  label: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,.9)', paddingVertical: 8, alignItems: 'center' },
  labelTxt: { fontWeight: '700', color: C.ink, fontSize: 13 },
});
