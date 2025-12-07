'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CubeIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
  BuildingStorefrontIcon,
  MapPinIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Mock Data
const inventoryItems = [
  {
    id: 'INV-001',
    sku: 'SKU-001',
    name: 'プレミアム緑茶 100g',
    warehouse: '東京第1倉庫',
    location: 'A-01-01',
    quantity: 120,
    reserved: 10,
    available: 110,
    status: 'NORMAL',
    lastUpdated: '2024-01-15 10:30',
  },
  {
    id: 'INV-002',
    sku: 'SKU-002',
    name: '抹茶パウダー 50g',
    warehouse: '東京第1倉庫',
    location: 'A-01-02',
    quantity: 15,
    reserved: 5,
    available: 10,
    status: 'LOW_STOCK',
    lastUpdated: '2024-01-14 15:20',
  },
  {
    id: 'INV-003',
    sku: 'SKU-003',
    name: 'ほうじ茶ティーバッグ 20P',
    warehouse: '大阪倉庫',
    location: 'B-02-05',
    quantity: 300,
    reserved: 50,
    available: 250,
    status: 'NORMAL',
    lastUpdated: '2024-01-15 09:00',
  },
  {
    id: 'INV-004',
    sku: 'SKU-004',
    name: '急須（常滑焼）',
    warehouse: '東京第1倉庫',
    location: 'C-05-01',
    quantity: 0,
    reserved: 0,
    available: 0,
    status: 'OUT_OF_STOCK',
    lastUpdated: '2024-01-10 11:45',
  },
  {
    id: 'INV-005',
    sku: 'SKU-005',
    name: '桜餅セット（季節限定）',
    warehouse: '冷蔵倉庫',
    location: 'R-01-01',
    quantity: 50,
    reserved: 48,
    available: 2,
    status: 'LOW_STOCK',
    lastUpdated: '2024-01-15 14:10',
  },
]

const warehouses = ['すべての倉庫', '東京第1倉庫', '大阪倉庫', '冷蔵倉庫']

export default function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('すべての倉庫')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [operationType, setOperationType] = useState<'RECEIVE' | 'ADJUST' | 'TRANSFER'>('RECEIVE')

  // Filter logic
  const filteredItems = inventoryItems.filter((item) => {
    const matchesSearch = 
      item.name.includes(searchQuery) || 
      item.sku.includes(searchQuery) ||
      item.location.includes(searchQuery)
    
    const matchesWarehouse = selectedWarehouse === 'すべての倉庫' || item.warehouse === selectedWarehouse
    
    const matchesLowStock = showLowStockOnly ? (item.status === 'LOW_STOCK' || item.status === 'OUT_OF_STOCK') : true

    return matchesSearch && matchesWarehouse && matchesLowStock
  })

  // Modal Component
  const OperationModal = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-washi-200 dark:border-ink-700 flex justify-between items-center">
          <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100">
            {operationType === 'RECEIVE' && '入荷処理 (Receiving)'}
            {operationType === 'ADJUST' && '在庫調整 (Adjustment)'}
            {operationType === 'TRANSFER' && '倉庫間移動 (Transfer)'}
          </h3>
          <button onClick={() => setIsModalOpen(false)} className="text-ink-400 hover:text-ink-600">
            ✕
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">商品 (SKU)</label>
            <input type="text" className="input" placeholder="スキャン または SKU入力" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">数量</label>
              <input type="number" className="input" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">ロケーション</label>
              <input type="text" className="input" placeholder="A-01-01" />
            </div>
          </div>

          {operationType === 'ADJUST' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">調整理由</label>
              <select className="input">
                <option>棚卸差異</option>
                <option>破損・廃棄</option>
                <option>システム修正</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">備考</label>
            <textarea className="input h-24" placeholder="メモを入力..." />
          </div>
        </div>

        <div className="p-6 border-t border-washi-200 dark:border-ink-700 flex justify-end gap-3">
          <button onClick={() => setIsModalOpen(false)} className="btn-outline">キャンセル</button>
          <button className="btn-primary">実行する</button>
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
            在庫管理 (WMS)
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            リアルタイム在庫・ロケーション管理
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { setOperationType('ADJUST'); setIsModalOpen(true); }}
            className="btn-outline flex items-center gap-2 text-sm py-2.5"
          >
            <ClipboardDocumentCheckIcon className="w-5 h-5" />
            在庫調整
          </button>
          <button 
            onClick={() => { setOperationType('RECEIVE'); setIsModalOpen(true); }}
            className="btn-primary flex items-center gap-2 text-sm py-2.5"
          >
            <PlusIcon className="w-5 h-5" />
            入荷登録
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-matcha-100 text-matcha-600 flex items-center justify-center">
            <CubeIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-ink-500">総在庫数</p>
            <p className="text-xl font-bold text-ink-900 dark:text-washi-100">4,520</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
            <BuildingStorefrontIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-ink-500">保管倉庫数</p>
            <p className="text-xl font-bold text-ink-900 dark:text-washi-100">3</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-ink-500">在庫アラート</p>
            <p className="text-xl font-bold text-ink-900 dark:text-washi-100">8 SKU</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-anet-100 text-anet-600 flex items-center justify-center">
            <MapPinIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-ink-500">占有率</p>
            <p className="text-xl font-bold text-ink-900 dark:text-washi-100">78%</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="flex-1 w-full relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
            <input
              type="text"
              placeholder="SKU、商品名、ロケーションで検索..."
              className="input pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full lg:w-auto">
            <select 
              className="input w-full lg:w-48"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
            >
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            
            <button 
              className={clsx(
                "btn-outline whitespace-nowrap flex items-center gap-2",
                showLowStockOnly && "bg-amber-50 border-amber-300 text-amber-700"
              )}
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
            >
              <ExclamationTriangleIcon className="w-5 h-5" />
              在庫切れのみ
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-washi-50 dark:bg-ink-800 border-b border-washi-200 dark:border-ink-700">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">商品情報</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">倉庫 / ロケーション</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-center">利用可能数</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-center">総在庫</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-center">引当済</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">状態</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-washi-50 dark:hover:bg-ink-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-ink-900 dark:text-washi-100">{item.name}</div>
                    <div className="text-xs text-ink-500">{item.sku}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-ink-900 dark:text-washi-100">{item.warehouse}</div>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-xs font-mono text-ink-600 dark:text-ink-300 mt-1">
                      <MapPinIcon className="w-3 h-3" />
                      {item.location}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-lg font-bold text-matcha-600 dark:text-matcha-400">
                      {item.available}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-ink-600 dark:text-ink-300">
                    {item.quantity}
                  </td>
                  <td className="px-6 py-4 text-center text-ink-400">
                    {item.reserved}
                  </td>
                  <td className="px-6 py-4">
                    {item.status === 'LOW_STOCK' && (
                      <span className="badge badge-warning flex items-center gap-1">
                        <ExclamationTriangleIcon className="w-3 h-3" />
                        残りわずか
                      </span>
                    )}
                    {item.status === 'OUT_OF_STOCK' && (
                      <span className="badge badge-error flex items-center gap-1">
                        <ExclamationTriangleIcon className="w-3 h-3" />
                        在庫切れ
                      </span>
                    )}
                    {item.status === 'NORMAL' && (
                      <span className="badge badge-success">通常</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-sm text-anet-500 hover:text-anet-600 font-medium">
                      履歴
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredItems.length === 0 && (
          <div className="p-12 text-center text-ink-400">
            <CubeIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>該当する商品が見つかりませんでした</p>
          </div>
        )}
      </div>

      {/* Modal Overlay */}
      <AnimatePresence>
        {isModalOpen && <OperationModal />}
      </AnimatePresence>
    </div>
  )
}

