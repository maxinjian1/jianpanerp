'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CalculatorIcon,
  InboxStackIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  DEFAULT_RAKUTEN_FEES,
  DropshipPurchaseStatus,
  RakutenFeeSettings,
  adCostPerOrder,
  calculateDropshipProfit,
  suggestSellingPrice,
  totalFeeRate,
  type DropshipQueueGroup,
  type DropshipQueueOrder,
} from '@japan-erp/shared-types'
import { apiFetch } from '@/lib/api'

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`

const statusLabel: Record<DropshipPurchaseStatus, { label: string; className: string }> = {
  PENDING: { label: '未発注', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  ORDERED: { label: '発注済', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  SHIPPED: { label: '発送済', className: 'bg-matcha-100 text-matcha-700 dark:bg-matcha-900/30 dark:text-matcha-400' },
  CANCELLED: { label: 'キャンセル', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

const carriers = [
  { value: 'YAMATO', label: 'ヤマト運輸' },
  { value: 'SAGAWA', label: '佐川急便' },
  { value: 'JAPAN_POST', label: '日本郵便' },
  { value: 'FUKUYAMA', label: '福山通運' },
  { value: 'SEINO', label: '西濃運輸' },
  { value: 'NITTSU', label: '日本通運' },
]

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-washi-50 dark:bg-ink-800 border border-washi-200 dark:border-ink-700 focus:border-anet-400 focus:outline-none text-sm'

export default function DropshipPage() {
  const [tab, setTab] = useState<'queue' | 'calculator'>('queue')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100">直送発注</h1>
        <p className="text-sm text-ink-500 mt-1">
          楽天の注文を卸業者へ発注し、追跡番号を楽天へ連携します
        </p>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'queue' as const, label: '発注待ち', icon: InboxStackIcon },
          { key: 'calculator' as const, label: '利益計算', icon: CalculatorIcon },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-anet-500 text-white'
                : 'bg-white dark:bg-ink-900 text-ink-600 dark:text-ink-400 hover:bg-washi-100 dark:hover:bg-ink-800',
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' ? <PurchaseQueue /> : <ProfitCalculator />}
    </div>
  )
}

// ============================================
// 発注待ち
// ============================================

function PurchaseQueue() {
  const [orders, setOrders] = useState<DropshipQueueOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOrders(await apiFetch<DropshipQueueOrder[]>('/dropship/queue'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const syncRakuten = async () => {
    try {
      const result = await apiFetch<{ created: number }>('/rakuten/sync', { method: 'POST', body: '{}' })
      toast.success(`楽天から注文を同期しました (新規 ${result.created} 件)`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同期に失敗しました')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">{orders.length} 件の注文が発注・発送待ちです</p>
        <div className="flex gap-2">
          <button
            onClick={syncRakuten}
            className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600"
          >
            楽天から注文を取得
          </button>
          <button
            onClick={load}
            className="p-2 rounded-xl bg-white dark:bg-ink-900 hover:bg-washi-100 dark:hover:bg-ink-800"
            aria-label="再読み込み"
          >
            <ArrowPathIcon className={clsx('w-5 h-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-ink-900 text-ink-500">
          発注待ちの注文はありません
        </div>
      )}

      {orders.map((order) => (
        <OrderCard key={order.orderId} order={order} onChange={load} />
      ))}
    </div>
  )
}

function OrderCard({ order, onChange }: { order: DropshipQueueOrder; onChange: () => void }) {
  const copyAddress = async () => {
    await navigator.clipboard.writeText(order.shippingAddressText)
    toast.success('お届け先をコピーしました')
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-ink-900 border border-washi-200 dark:border-ink-700 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink-500">{order.externalOrderId}</p>
          <p className="text-xs text-ink-400">
            {new Date(order.orderedAt).toLocaleString('ja-JP')}
            {order.deliveryDate && ` ・ お届け希望日 ${new Date(order.deliveryDate).toLocaleDateString('ja-JP')}`}
            {order.deliveryTimeSlot && ` ${order.deliveryTimeSlot}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{yen(order.totalAmount)}</p>
          {order.profit && (
            <p
              className={clsx(
                'text-sm font-medium',
                order.profit.profit >= 0 ? 'text-matcha-600' : 'text-red-500',
              )}
            >
              利益 {yen(order.profit.profit)} ({order.profit.profitMargin}%)
            </p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-3 items-start">
        <pre className="text-sm whitespace-pre-wrap rounded-xl bg-washi-50 dark:bg-ink-800 p-3 font-sans">
          {order.shippingAddressText}
        </pre>
        <button
          onClick={copyAddress}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-anet-500 text-white text-sm font-medium hover:bg-anet-600"
        >
          <ClipboardDocumentIcon className="w-4 h-4" />
          お届け先をコピー
        </button>
      </div>

      {order.unlinkedItems.length > 0 && (
        <div className="flex gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <div>
            卸業者が紐付いていない商品があります:{' '}
            {order.unlinkedItems.map((i) => `${i.name} (${i.sku}) × ${i.quantity}`).join('、')}
          </div>
        </div>
      )}

      {order.groups.map((group) => (
        <SupplierGroup key={group.supplierId} orderId={order.orderId} group={group} onChange={onChange} />
      ))}
    </div>
  )
}

function SupplierGroup({
  orderId,
  group,
  onChange,
}: {
  orderId: string
  group: DropshipQueueGroup
  onChange: () => void
}) {
  const [supplierOrderNo, setSupplierOrderNo] = useState(group.supplierOrderNo ?? '')
  const [actualCost, setActualCost] = useState('')
  const [carrier, setCarrier] = useState(group.carrier ?? 'YAMATO')
  const [trackingNumber, setTrackingNumber] = useState(group.trackingNumber ?? '')
  const [busy, setBusy] = useState(false)
  const status = statusLabel[group.status]

  const post = async (action: 'ordered' | 'shipped' | 'cancel', body: object, success: string) => {
    setBusy(true)
    try {
      await apiFetch(`/dropship/queue/${orderId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ supplierId: group.supplierId, ...body }),
      })
      toast.success(success)
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-washi-200 dark:border-ink-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{group.supplierName}</span>
          <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', status.className)}>
            {status.label}
          </span>
        </div>
        <span className="text-sm text-ink-500">仕入 {yen(group.estimatedCost)}</span>
      </div>

      {group.senderName && (
        <p className="text-xs text-ink-500">発送元名義: {group.senderName}</p>
      )}

      <ul className="space-y-1">
        {group.items.map((item) => (
          <li key={item.sku} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {item.name} <span className="text-ink-400">× {item.quantity}</span>
              {item.supplierSku && <span className="ml-2 font-mono text-xs text-ink-400">{item.supplierSku}</span>}
            </span>
            {item.supplierUrl && (
              <a
                href={item.supplierUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-anet-600 hover:underline shrink-0"
              >
                卸サイトで注文
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </a>
            )}
          </li>
        ))}
      </ul>

      {group.status === 'PENDING' && (
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            className={inputClass}
            placeholder="卸業者の注文番号"
            value={supplierOrderNo}
            onChange={(e) => setSupplierOrderNo(e.target.value)}
          />
          <input
            className={inputClass}
            type="number"
            placeholder="支払額 (税込・送料込)"
            value={actualCost}
            onChange={(e) => setActualCost(e.target.value)}
          />
          <button
            disabled={busy}
            onClick={() =>
              post(
                'ordered',
                {
                  supplierOrderNo: supplierOrderNo || undefined,
                  actualCost: actualCost ? Number(actualCost) : undefined,
                },
                '発注済みにしました',
              )
            }
            className="px-4 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
          >
            発注済みにする
          </button>
        </div>
      )}

      {(group.status === 'PENDING' || group.status === 'ORDERED') && (
        <div className="grid sm:grid-cols-[auto_1fr_auto_auto] gap-2">
          <select className={inputClass} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {carriers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="追跡番号"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <button
            disabled={busy || !trackingNumber}
            onClick={() => post('shipped', { carrier, trackingNumber }, '楽天へ発送通知しました')}
            className="px-4 py-2 rounded-lg bg-matcha-500 text-white text-sm font-medium hover:bg-matcha-600 disabled:opacity-50"
          >
            発送済み・楽天へ通知
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm('この卸業者への発注をキャンセルしますか？(欠品など)')) {
                post('cancel', {}, 'キャンセルしました')
              }
            }}
            className="px-3 py-2 rounded-lg text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            欠品・キャンセル
          </button>
        </div>
      )}

      {group.status === 'SHIPPED' && group.trackingNumber && (
        <p className="text-sm text-ink-500">
          {carriers.find((c) => c.value === group.carrier)?.label ?? group.carrier} {group.trackingNumber}
        </p>
      )}
    </div>
  )
}

// ============================================
// 利益計算
// ============================================

function ProfitCalculator() {
  const [costPrice, setCostPrice] = useState(1200)
  const [shippingCost, setShippingCost] = useState(0)
  const [sellingPrice, setSellingPrice] = useState(2480)
  const [cpc, setCpc] = useState(25)
  const [cvr, setCvr] = useState(5)
  const [targetMargin, setTargetMargin] = useState(20)
  const [isTaxableBusiness, setIsTaxableBusiness] = useState(false)
  const [fees, setFees] = useState<RakutenFeeSettings>(DEFAULT_RAKUTEN_FEES)

  const adCost = adCostPerOrder(cpc, cvr)
  const input = { costPrice, shippingCost, adCostPerOrder: adCost, fees, isTaxableBusiness }
  const result = useMemo(
    () => calculateDropshipProfit({ ...input, sellingPrice }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [costPrice, shippingCost, sellingPrice, adCost, fees, isTaxableBusiness],
  )
  const suggested = suggestSellingPrice({ ...input, targetMarginPercent: targetMargin })

  const numberField = (label: string, value: number, set: (n: number) => void, hint?: string, step = 1) => (
    <label className="block">
      <span className="text-sm text-ink-600 dark:text-ink-400">{label}</span>
      <input
        type="number"
        step={step}
        className={clsx(inputClass, 'mt-1')}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </label>
  )

  const feeFields: Array<[keyof RakutenFeeSettings, string]> = [
    ['systemFeeRate', 'システム利用料 %'],
    ['paymentFeeRate', '楽天ペイ決済 %'],
    ['pointCostRate', 'ポイント原資 %'],
    ['affiliateRate', 'アフィリエイト %'],
    ['otherFeeRate', 'その他 %'],
  ]

  const rows: Array<[string, number, boolean?]> = [
    ['販売価格', result.sellingPrice],
    ['卸価格 + 送料', -result.totalCost],
    [`楽天手数料 (${result.feeRate.toFixed(1)}%)`, -result.rakutenFees],
    ['広告費 (RPP)', -result.adCost],
    ...(isTaxableBusiness ? [['消費税納付 (概算)', -result.consumptionTax] as [string, number]] : []),
    ['利益', result.profit, true],
  ]

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-white dark:bg-ink-900 border border-washi-200 dark:border-ink-700 p-5 space-y-4">
        <h2 className="font-bold">商品</h2>
        <div className="grid grid-cols-2 gap-3">
          {numberField('卸価格 (税込)', costPrice, setCostPrice, '× 数量')}
          {numberField('卸業者への送料 (税込)', shippingCost, setShippingCost)}
          {numberField('楽天販売価格 (税込)', sellingPrice, setSellingPrice)}
          {numberField('目標利益率 %', targetMargin, setTargetMargin)}
        </div>

        <h2 className="font-bold pt-2">広告 (RPP)</h2>
        <div className="grid grid-cols-2 gap-3">
          {numberField('クリック単価 (円)', cpc, setCpc)}
          {numberField('転換率 %', cvr, setCvr, `1注文あたり広告費 ${yen(adCost)}`, 0.1)}
        </div>

        <h2 className="font-bold pt-2">楽天手数料 (合計 {totalFeeRate(fees).toFixed(1)}%)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {feeFields.map(([key, label]) =>
            numberField(label, fees[key], (n) => setFees({ ...fees, [key]: n }), undefined, 0.1),
          )}
        </div>
        <p className="text-xs text-ink-400">
          ご契約の出店プラン・月間売上で料率が変わります。RMS の請求明細に合わせて調整してください。
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isTaxableBusiness}
            onChange={(e) => setIsTaxableBusiness(e.target.checked)}
          />
          課税事業者 (消費税の納付額を差し引く)
        </label>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-white dark:bg-ink-900 border border-washi-200 dark:border-ink-700 p-5">
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, value, strong]) => (
                <tr key={label} className={clsx(strong && 'border-t border-washi-200 dark:border-ink-700')}>
                  <td className={clsx('py-2', strong && 'font-bold')}>{label}</td>
                  <td
                    className={clsx(
                      'py-2 text-right tabular-nums',
                      strong && 'font-bold text-lg',
                      strong && (value >= 0 ? 'text-matcha-600' : 'text-red-500'),
                    )}
                  >
                    {yen(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right text-sm text-ink-500">利益率 {result.profitMargin}%</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white dark:bg-ink-900 border border-washi-200 dark:border-ink-700 p-5">
            <p className="text-sm text-ink-500">損益分岐価格</p>
            <p className="text-2xl font-bold">{result.breakEvenPrice ? yen(result.breakEvenPrice) : '—'}</p>
          </div>
          <div className="rounded-2xl bg-anet-50 dark:bg-anet-900/20 border border-anet-200 dark:border-anet-800 p-5">
            <p className="text-sm text-anet-600">利益率 {targetMargin}% の推奨価格</p>
            <p className="text-2xl font-bold text-anet-600">{suggested ? yen(suggested) : '達成不可'}</p>
            {suggested && (
              <button
                onClick={() => setSellingPrice(suggested)}
                className="mt-2 text-xs text-anet-600 hover:underline"
              >
                この価格で計算する
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
