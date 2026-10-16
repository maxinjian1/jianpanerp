// カート状態：Shopify Cart API のカート ID を端末に保存して復元する。
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Cart, cartCreate, cartFetch, cartLinesAdd, cartLinesRemove, cartLinesUpdate } from './shopify';

const KEY = 'yasui.cartId';
type Ctx = {
  cart: Cart | null; loading: boolean; error: string | null;
  add: (merchandiseId: string, quantity?: number) => Promise<void>;
  setQty: (lineId: string, quantity: number) => Promise<void>;
  remove: (lineId: string) => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
};
const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (c: Cart | null) => { setCart(c); if (c) await AsyncStorage.setItem(KEY, c.id); else await AsyncStorage.removeItem(KEY); }, []);

  const refresh = useCallback(async () => {
    try {
      const id = await AsyncStorage.getItem(KEY);
      if (!id) return;
      const c = await cartFetch(id);
      await persist(c); // 注文完了後は null が返るので自動でクリア
    } catch (e) { setError(String((e as Error).message)); }
  }, [persist]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = useCallback(async (fn: () => Promise<Cart>) => {
    setLoading(true); setError(null);
    try { await persist(await fn()); } catch (e) { setError(String((e as Error).message)); throw e; } finally { setLoading(false); }
  }, [persist]);

  const add = useCallback(async (merchandiseId: string, quantity = 1) => run(async () => cart ? cartLinesAdd(cart.id, [{ merchandiseId, quantity }]) : cartCreate([{ merchandiseId, quantity }])), [cart, run]);
  const setQty = useCallback(async (lineId: string, quantity: number) => { if (!cart) return; await run(() => quantity <= 0 ? cartLinesRemove(cart.id, [lineId]) : cartLinesUpdate(cart.id, [{ id: lineId, quantity }])); }, [cart, run]);
  const remove = useCallback(async (lineId: string) => { if (!cart) return; await run(() => cartLinesRemove(cart.id, [lineId])); }, [cart, run]);
  const reset = useCallback(async () => persist(null), [persist]);

  const value = useMemo(() => ({ cart, loading, error, add, setQty, remove, reset, refresh }), [cart, loading, error, add, setQty, remove, reset, refresh]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
export const useCart = () => { const c = useContext(CartCtx); if (!c) throw new Error('CartProvider missing'); return c; };
