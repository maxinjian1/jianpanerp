'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  TruckIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const platforms = ['すべて', 'Amazon', '楽天', 'Yahoo!', '手動入力']
const statuses = ['すべて', '未処理', '処理中', 'ピッキング', '出荷済', 'キャンセル']

const orders = [
  {
    id: 'ORD-2024-001234',
    externalId: '503-1234567-1234567',
    platform: 'Amazon',
    platformColor: 'bg-amber-500',
    customer: '山田太郎',
    address: '東京都渋谷区道玄坂1-2-3',
    items: 3,
    amount: 12800,
    status: '出荷待ち',
    statusType: 'warning',
    orderedAt: '2024-01-15 14:32',
    carrier: '佐川急便',
  },
  {
    id: 'ORD-2024-001233',
    externalId: '312345-20240115-00001',
    platform: '楽天',
    platformColor: 'bg-red-500',
    customer: '鈴木花子',
    address: '大阪府大阪市中央区心斎橋筋1-2-3',
    items: 1,
    amount: 8500,
    status: '出荷完了',
    statusType: 'success',
    orderedAt: '2024-01-15 12:15',
    carrier: 'ヤマト運輸',
    trackingNumber: '1234-5678-9012',
  },
  {
    id: 'ORD-2024-001232',
    externalId: 'Y-2024-0001234',
    platform: 'Yahoo!',
    platformColor: 'bg-purple-500',
    customer: '佐藤一郎',
    address: '愛知県名古屋市中区栄1-2-3',
    items: 5,
    amount: 23400,
    status: 'ピッキング中',
    statusType: 'info',
    orderedAt: '2024-01-15 10:45',
    carrier: '佐川急便',
  },
  {
    id: 'ORD-2024-001231',
    externalId: '503-7654321-7654321',
    platform: 'Amazon',
    platformColor: 'bg-amber-500',
    customer: '田中美咲',
    address: '福岡県福岡市博多区博多駅前1-2-3',
    items: 2,
    amount: 5200,
    status: '出荷完了',
    statusType: 'success',
    orderedAt: '2024-01-15 09:20',
    carrier: 'ヤマト運輸',
    trackingNumber: '2345-6789-0123',
  },
  {
    id: 'ORD-2024-001230',
    externalId: '312346-20240115-00002',
    platform: '楽天',
    platformColor: 'bg-red-500',
    customer: '高橋健太',
    address: '北海道札幌市中央区北1条西1-2-3',
    items: 4,
    amount: 18900,
    status: '確認待ち',
    statusType: 'error',
    orderedAt: '2024-01-15 08:00',
    carrier: '日本郵便',
  },
]

const statusConfig = {
  warning: { icon: ClockIcon, color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30' },
  success: { icon: CheckCircleIcon, color: 'text-matcha-500 bg-matcha-100 dark:bg-matcha-900/30' },
  info: { icon: TruckIcon, color: 'text-sky-500 bg-sky-100 dark:bg-sky-900/30' },
  error: { icon: XCircleIcon, color: 'text-red-500 bg-red-100 dark:bg-red-900/30' },
}

export default function OrdersPage() {
  const [selectedPlatform, setSelectedPlatform] = useState('すべて')
  const [selectedStatus, setSelectedStatus] = useState('すべて')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    )
  }

  const toggleAllOrders = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([])
    } else {
      setSelectedOrders(orders.map((o) => o.id))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100">
            受注管理
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            全チャネルの受注を一元管理
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-outline flex items-center gap-2 text-sm py-2.5">
            <ArrowDownTrayIcon className="w-4 h-4" />
            CSVエクスポート
          </button>
          <button className="btn-primary flex items-center gap-2 text-sm py-2.5">
            注文を同期
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
              <input
                type="text"
                placeholder="注文番号、顧客名、SKUで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

          {/* Platform filter */}
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-5 h-5 text-ink-400" />
            <div className="flex gap-1 bg-washi-100 dark:bg-ink-800 rounded-xl p-1">
              {platforms.map((platform) => (
                <button
                  key={platform}
                  onClick={() => setSelectedPlatform(platform)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    selectedPlatform === platform
                      ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-washi-100 shadow-sm'
                      : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200'
                  )}
                >
                  {platform}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status filter */}
        <div className="mt-4 flex flex-wrap gap-2">
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={clsx(
                'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                selectedStatus === status
                  ? 'bg-anet-50 dark:bg-anet-900/20 border-anet-300 dark:border-anet-700 text-anet-600 dark:text-anet-400'
                  : 'border-washi-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-anet-300'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedOrders.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 bg-anet-50 dark:bg-anet-900/20 border-anet-200 dark:border-anet-800"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-anet-700 dark:text-anet-300">
              {selectedOrders.length} 件を選択中
            </p>
            <div className="flex items-center gap-2">
              <button className="btn-outline text-sm py-2">
                一括出荷処理
              </button>
              <button className="btn-primary text-sm py-2">
                送り状CSV生成
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Orders table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-washi-50 dark:bg-ink-800 border-b border-washi-100 dark:border-ink-700">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === orders.length}
                    onChange={toggleAllOrders}
                    className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
                  注文情報
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
                  顧客
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
                  金額
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
                  配送
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
              {orders.map((order) => {
                const StatusIcon = statusConfig[order.statusType as keyof typeof statusConfig].icon
                return (
                  <tr
                    key={order.id}
                    className={clsx(
                      'hover:bg-washi-50 dark:hover:bg-ink-800/50 transition-colors',
                      selectedOrders.includes(order.id) && 'bg-anet-50/50 dark:bg-anet-900/10'
                    )}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold', order.platformColor)}>
                          {order.platform.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-ink-900 dark:text-washi-100">
                            {order.id}
                          </p>
                          <p className="text-xs text-ink-500 dark:text-ink-400">
                            {order.externalId}
                          </p>
                          <p className="text-xs text-ink-400 dark:text-ink-500">
                            {order.orderedAt}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-ink-900 dark:text-washi-100">
                        {order.customer}
                      </p>
                      <p className="text-sm text-ink-500 dark:text-ink-400 truncate max-w-[200px]">
                        {order.address}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-bold text-ink-900 dark:text-washi-100">
                        ¥{order.amount.toLocaleString()}
                      </p>
                      <p className="text-sm text-ink-500 dark:text-ink-400">
                        {order.items} 点
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={clsx(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                        statusConfig[order.statusType as keyof typeof statusConfig].color
                      )}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-ink-900 dark:text-washi-100">
                        {order.carrier}
                      </p>
                      {order.trackingNumber && (
                        <p className="text-xs text-anet-500 hover:text-anet-600 cursor-pointer">
                          {order.trackingNumber}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button className="text-sm text-anet-500 hover:text-anet-600 font-medium">
                        詳細
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-washi-100 dark:border-ink-700 flex items-center justify-between">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            1-5 / 127 件
          </p>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg border border-washi-200 dark:border-ink-700 text-sm text-ink-500 dark:text-ink-400 hover:bg-washi-50 dark:hover:bg-ink-800 disabled:opacity-50" disabled>
              前へ
            </button>
            <button className="px-3 py-1.5 rounded-lg border border-washi-200 dark:border-ink-700 text-sm text-ink-500 dark:text-ink-400 hover:bg-washi-50 dark:hover:bg-ink-800">
              次へ
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

