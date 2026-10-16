import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Ui';
import { useCart } from '@/lib/cart';
import { C, yen } from '@/theme';

export default function CartScreen() {
  const { cart, loading, error, setQty, remove } = useCart();
  const router = useRouter();
  const lines = cart?.lines.nodes ?? [];
  if (!lines.length) return (
    <View style={s.empty}>
      <Text style={{ fontSize: 40 }}>🛒</Text>
      <Text style={s.emptyT}>カートは空です</Text>
      <Link href="/" asChild><Pressable style={s.link}><Text style={s.linkTxt}>買い物を続ける</Text></Pressable></Link>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 10, gap: 8 }}>
        {lines.map((l) => (
          <View key={l.id} style={s.line}>
            <Image source={l.merchandise.image?.url} style={s.img} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Link href={{ pathname: '/product/[handle]', params: { handle: l.merchandise.product.handle } }}><Text numberOfLines={2} style={s.title}>{l.merchandise.product.title}</Text></Link>
              {l.merchandise.title !== 'Default Title' && <Text style={s.variant}>{l.merchandise.title}</Text>}
              <View style={s.row}>
                <Text style={s.price}>{yen(l.cost.totalAmount.amount)}</Text>
                <View style={s.qty}>
                  <Pressable onPress={() => setQty(l.id, l.quantity - 1)} style={s.qbtn}><Text style={s.qtxt}>−</Text></Pressable>
                  <Text style={s.qnum}>{l.quantity}</Text>
                  <Pressable onPress={() => setQty(l.id, l.quantity + 1)} style={s.qbtn}><Text style={s.qtxt}>＋</Text></Pressable>
                </View>
                <Pressable onPress={() => remove(l.id)} hitSlop={8}><Text style={s.del}>削除</Text></Pressable>
              </View>
            </View>
          </View>
        ))}
        {error && <Text style={s.err}>{error}</Text>}
      </ScrollView>
      <View style={s.footer}>
        <View style={s.row}><Text style={s.sumL}>小計（{cart!.totalQuantity}点・税込）</Text><Text style={s.sumV}>{yen(cart!.cost.subtotalAmount.amount)}</Text></View>
        <Text style={s.ship}>送料：全国無料</Text>
        {loading ? <ActivityIndicator color={C.red} style={{ margin: 12 }} /> : <Button title="ご購入手続きへ" onPress={() => router.push('/checkout')} />}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, emptyT: { fontSize: 16, color: C.sub },
  link: { marginTop: 8, borderWidth: 1.5, borderColor: C.red, borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 }, linkTxt: { color: C.red, fontWeight: '700' },
  line: { flexDirection: 'row', gap: 10, backgroundColor: C.white, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 10 },
  img: { width: 84, height: 84, borderRadius: 4, backgroundColor: '#fafafa' },
  title: { fontSize: 13, color: C.ink, lineHeight: 18 }, variant: { fontSize: 11, color: C.sub },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { color: C.red, fontWeight: '700', fontSize: 15 },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 4 },
  qbtn: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' }, qtxt: { fontSize: 16, color: C.ink }, qnum: { minWidth: 28, textAlign: 'center', fontWeight: '700' },
  del: { color: C.sub, fontSize: 12, textDecorationLine: 'underline' },
  err: { color: C.red, fontSize: 12, textAlign: 'center' },
  footer: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, padding: 14, paddingBottom: 20 },
  sumL: { color: C.sub }, sumV: { fontSize: 20, fontWeight: '800', color: C.red }, ship: { fontSize: 12, color: C.green, marginTop: 4 },
});
