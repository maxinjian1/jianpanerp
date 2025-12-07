'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TruckIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PrinterIcon,
  PaperAirplaneIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Mock Data
const shipments = [
  {
    id: 'SHP-2024-001',
    orderId: 'ORD-2024-001234',
    customer: '山田太郎',
    carrier: 'SAGAWA',
    service: '飛脚宅配便',
    trackingNumber: '1234-5678-9012',
    status: 'IN_TRANSIT',
    shipDate: '2024-01-15',
    deliveryDate: '2024-01-16',
    prefecture: '東京都',
  },
  {
    id: 'SHP-2024-002',
    orderId: 'ORD-2024-001233',
    customer: '鈴木花子',
    carrier: 'YAMATO',
    service: '宅急便コンパクト',
    trackingNumber: '2345-6789-0123',
    status: 'DELIVERED',
    shipDate: '2024-01-14',
    deliveryDate: '2024-01-15',
    prefecture: '大阪府',
  },
  {
    id: 'SHP-2024-003',
    orderId: 'ORD-2024-001232',
    customer: '佐藤一郎',
    carrier: 'SAGAWA',
    service: '飛脚ラージサイズ',
    trackingNumber: '',
    status: 'PENDING',
    shipDate: '',
    deliveryDate: '2024-01-17',
    prefecture: '愛知県',
  },
  {
    id: 'SHP-2024-004',
    orderId: 'ORD-2024-001230',
    customer: '高橋健太',
    carrier: 'JAPAN_POST',
    service: 'ゆうパック',
    trackingNumber: '3456-7890-1234',
    status: 'RETURNED',
    shipDate: '2024-01-10',
    deliveryDate: '',
    prefecture: '北海道',
  },
  {
    id: 'SHP-2024-005',
    orderId: 'ORD-2024-001240',
    customer: '伊藤美咲',
    carrier: 'FUKUYAMA',
    service: 'フクツー宅配便',
    trackingNumber: '',
    status: 'LABEL_PRINTED',
    shipDate: '2024-01-15',
    deliveryDate: '2024-01-17',
    prefecture: '福岡県',
  },
]

const carrierConfig: Record<string, { name: string; color: string; logo: string }> = {
  SAGAWA: { name: '佐川急便', color: 'bg-blue-50 text-blue-600', logo: '🚚' },
  YAMATO: { name: 'ヤマト運輸', color: 'bg-yellow-50 text-yellow-700', logo: '🐈' },
  JAPAN_POST: { name: '日本郵便', color: 'bg-red-50 text-red-600', logo: '📮' },
  FUKUYAMA: { name: '福山通運', color: 'bg-green-50 text-green-600', logo: '🏭' },
}

const statusConfig: Record<string, { name: string; color: string; icon: any }> = {
  PENDING: { name: '未出荷', color: 'badge-warning', icon: ClockIcon },
  LABEL_PRINTED: { name: 'ラベル発行済', color: 'badge-info', icon: PrinterIcon },
  IN_TRANSIT: { name: '輸送中', color: 'badge-info', icon: TruckIcon },
  DELIVERED: { name: '配達完了', color: 'badge-success', icon: CheckCircleIcon },
  RETURNED: { name: '返送', color: 'badge-error', icon: ExclamationCircleIcon },
}

export default function LogisticsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCarrier, setFilterCarrier] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [selectedShipments, setSelectedShipments] = useState<string[]>([])
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  // Filter Logic
  const filteredShipments = shipments.filter((item) => {
    const matchesSearch = 
      item.orderId.includes(searchQuery) || 
      item.customer.includes(searchQuery) ||
      item.trackingNumber.includes(searchQuery)
    
    const matchesCarrier = filterCarrier === 'ALL' || item.carrier === filterCarrier
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus

    return matchesSearch && matchesCarrier && matchesStatus
  })

  // Selection Logic
  const toggleSelection = (id: string) => {
    if (selectedShipments.includes(id)) {
      setSelectedShipments(selectedShipments.filter(s => s !== id))
    } else {
      setSelectedShipments([...selectedShipments, id])
    }
  }

  const toggleAll = () => {
    if (selectedShipments.length === filteredShipments.length) {
      setSelectedShipments([])
    } else {
      setSelectedShipments(filteredShipments.map(s => s.id))
    }
  }

  // Mock CSV Export Handler
  const handleExport = (carrier: string) => {
    alert(`${carrierConfig[carrier].name}用のCSV（Shift-JIS）をダウンロードしました。\n選択件数: ${selectedShipments.length}件`)
    setIsExportModalOpen(false)
    setSelectedShipments([])
  }

  // Export Modal Component
  const ExportModal = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-washi-200 dark:border-ink-700">
          <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100">
            送り状CSV出力
          </h3>
          <p className="text-sm text-ink-500 mt-1">
            選択した {selectedShipments.length} 件の注文を出力します
          </p>
        </div>
        
        <div className="p-6 grid grid-cols-2 gap-4">
          {Object.entries(carrierConfig).map(([key, config]) => (
            <button
              key={key}
              onClick={() => handleExport(key)}
              className={clsx(
                "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all hover:scale-105",
                "border-washi-200 dark:border-ink-700 hover:border-anet-400 dark:hover:border-anet-500",
                config.color.replace('text-', 'bg-').replace('bg-', 'bg-opacity-10 ')
              )}
            >
              <span className="text-2xl mb-2">{config.logo}</span>
              <span className="font-bold text-ink-700 dark:text-ink-200">{config.name}</span>
            </button>
          ))}
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400 mx-6 mb-6 rounded-lg">
          ⚠️ 注意: 出力されるCSVは <strong>Shift-JIS</strong> エンコーディングです。各運送会社のソフト（e飛伝、B2クラウド等）にそのままインポート可能です。
        </div>

        <div className="p-6 border-t border-washi-200 dark:border-ink-700 flex justify-end">
          <button onClick={() => setIsExportModalOpen(false)} className="btn-outline">キャンセル</button>
        </div>
      </motion.div>
    </motion.div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100">
            物流・出荷管理 (TMS)
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            配送状況の追跡と送り状発行
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-outline flex items-center gap-2 text-sm py-2.5">
            <PaperAirplaneIcon className="w-5 h-5" />
            集荷依頼
          </button>
          <button className="btn-primary flex items-center gap-2 text-sm py-2.5">
            <TruckIcon className="w-5 h-5" />
            新規出荷
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10">
          <p className="text-blue-600 dark:text-blue-400 text-sm font-medium">出荷待ち</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">12</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10">
          <p className="text-purple-600 dark:text-purple-400 text-sm font-medium">配送中</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">45</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10">
          <p className="text-green-600 dark:text-green-400 text-sm font-medium">配達完了 (本日)</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">28</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10">
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">配送トラブル</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">1</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
          <div className="flex-1 w-full relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
            <input
              type="text"
              placeholder="注文番号、追跡番号、顧客名で検索..."
              className="input pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full lg:w-auto">
            <select 
              className="input w-full lg:w-40"
              value={filterCarrier}
              onChange={(e) => setFilterCarrier(e.target.value)}
            >
              <option value="ALL">全ての配送業者</option>
              {Object.entries(carrierConfig).map(([key, val]) => (
                <option key={key} value={key}>{val.name}</option>
              ))}
            </select>

            <select 
              className="input w-full lg:w-40"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="ALL">全てのステータス</option>
              {Object.entries(statusConfig).map(([key, val]) => (
                <option key={key} value={key}>{val.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Action Bar */}
        <AnimatePresence>
          {selectedShipments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-anet-50 dark:bg-anet-900/20 border border-anet-200 dark:border-anet-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm font-medium text-anet-700 dark:text-anet-300 ml-2">
                  {selectedShipments.length} 件を選択中
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline text-xs py-2 h-9">
                    追跡番号一括登録
                  </button>
                  <button 
                    onClick={() => setIsExportModalOpen(true)}
                    className="btn-primary text-xs py-2 h-9 flex items-center gap-1"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    CSV出力
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Shipment Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-washi-50 dark:bg-ink-800 border-b border-washi-200 dark:border-ink-700">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                    checked={selectedShipments.length === filteredShipments.length && filteredShipments.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">出荷ID / 注文ID</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">配送先</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">配送業者 / サービス</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">ステータス</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">追跡番号</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
              {filteredShipments.map((item) => {
                const StatusIcon = statusConfig[item.status]?.icon || CheckCircleIcon
                const statusColor = statusConfig[item.status]?.color || 'badge-info'
                const carrier = carrierConfig[item.carrier] || { name: item.carrier, color: 'bg-gray-100', logo: '📦' }

                return (
                  <tr key={item.id} className={clsx(
                    "transition-colors",
                    selectedShipments.includes(item.id) 
                      ? "bg-anet-50/50 dark:bg-anet-900/10" 
                      : "hover:bg-washi-50 dark:hover:bg-ink-800/50"
                  )}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                        checked={selectedShipments.includes(item.id)}
                        onChange={() => toggleSelection(item.id)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-ink-900 dark:text-washi-100">{item.id}</div>
                      <div className="text-xs text-ink-500">{item.orderId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-ink-900 dark:text-washi-100">{item.customer} 様</div>
                      <div className="flex items-center gap-1 text-xs text-ink-500 mt-0.5">
                        <MapPinIcon className="w-3 h-3" />
                        {item.prefecture}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{carrier.logo}</span>
                        <div>
                          <div className="text-sm font-medium text-ink-900 dark:text-washi-100">{carrier.name}</div>
                          <div className="text-xs text-ink-500">{item.service}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${statusColor} flex w-fit items-center gap-1`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[item.status]?.name}
                      </span>
                      {item.deliveryDate && (
                        <div className="text-xs text-ink-400 mt-1">
                          お届け: {item.deliveryDate}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-ink-600 dark:text-ink-300">
                      {item.trackingNumber || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
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
        
        {filteredShipments.length === 0 && (
          <div className="p-12 text-center text-ink-400">
            <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>該当する出荷データが見つかりませんでした</p>
          </div>
        )}
      </div>

      {/* Export Modal */}
      <AnimatePresence>
        {isExportModalOpen && <ExportModal />}
      </AnimatePresence>
    </div>
  )
}

