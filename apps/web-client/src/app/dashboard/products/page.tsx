'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TagIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  EllipsisVerticalIcon,
  PhotoIcon,
  CubeIcon,
  QrCodeIcon,
  CurrencyYenIcon,
  ArrowPathIcon,
  XMarkIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Mock Data
const products = [
  {
    id: 'PRD-001',
    sku: 'SKU-001',
    jan: '4901234567890',
    name: 'プレミアム緑茶 100g',
    nameKana: 'プレミアムリョクチャ 100g',
    price: 1200,
    cost: 450,
    stock: 85,
    category: '食品・飲料',
    status: 'ACTIVE',
    image: null,
    platforms: {
      amazon: { status: 'ACTIVE', price: 1280 },
      rakuten: { status: 'ACTIVE', price: 1200 },
      yahoo: { status: 'INACTIVE', price: null },
    },
  },
  {
    id: 'PRD-002',
    sku: 'SKU-002',
    jan: '4901234567891',
    name: '抹茶パウダー 50g',
    nameKana: 'マッチャパウダー 50g',
    price: 980,
    cost: 380,
    stock: 15,
    category: '食品・飲料',
    status: 'ACTIVE',
    image: null,
    platforms: {
      amazon: { status: 'ACTIVE', price: 1050 },
      rakuten: { status: 'ACTIVE', price: 980 },
      yahoo: { status: 'ACTIVE', price: 980 },
    },
  },
  {
    id: 'PRD-003',
    sku: 'SKU-003',
    jan: '4901234567892',
    name: '常滑焼 急須',
    nameKana: 'トコナメヤキ キュウス',
    price: 4500,
    cost: 2200,
    stock: 12,
    category: 'キッチン用品',
    status: 'ACTIVE',
    image: null,
    platforms: {
      amazon: { status: 'ACTIVE', price: 4800 },
      rakuten: { status: 'ERROR', price: 4500 }, // Sync Error
      yahoo: { status: 'INACTIVE', price: null },
    },
  },
  {
    id: 'PRD-004',
    sku: 'SKU-004',
    jan: '4901234567893',
    name: '桜餅セット（春限定）',
    nameKana: 'サクラモチセット',
    price: 1500,
    cost: 700,
    stock: 0,
    category: '食品・飲料',
    status: 'OUT_OF_STOCK',
    image: null,
    platforms: {
      amazon: { status: 'INACTIVE', price: 1500 },
      rakuten: { status: 'INACTIVE', price: 1500 },
      yahoo: { status: 'INACTIVE', price: null },
    },
  },
  {
    id: 'PRD-005',
    sku: 'SKU-005',
    jan: '4901234567894',
    name: '和柄ティーマット 2枚組',
    nameKana: 'ワガラティーマット',
    price: 800,
    cost: 200,
    stock: 150,
    category: 'キッチン用品',
    status: 'DRAFT',
    image: null,
    platforms: {
      amazon: { status: 'INACTIVE', price: null },
      rakuten: { status: 'INACTIVE', price: null },
      yahoo: { status: 'INACTIVE', price: null },
    },
  },
]

const statusConfig: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '販売中', color: 'badge-success' },
  INACTIVE: { label: '停止中', color: 'badge-neutral' },
  OUT_OF_STOCK: { label: '在庫切れ', color: 'badge-error' },
  DRAFT: { label: '下書き', color: 'badge-warning' },
  ERROR: { label: 'エラー', color: 'bg-red-100 text-red-700' },
}

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // Mock Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    jan: '',
    price: 0,
    cost: 0,
    stock: 0,
    category: '食品・飲料',
    amazonEnabled: true,
    rakutenEnabled: true,
    yahooEnabled: false,
  })

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate API call
    setIsAddModalOpen(false)
    alert('商品を登録しました')
  }

  // Filter Logic
  const filteredProducts = products.filter((item) => {
    const matchesSearch = 
      item.name.includes(searchQuery) || 
      item.sku.includes(searchQuery) ||
      item.jan.includes(searchQuery)
    
    const matchesCategory = filterCategory === 'ALL' || item.category === filterCategory
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus

    return matchesSearch && matchesCategory && matchesStatus
  })

  // Selection Logic
  const toggleSelection = (id: string) => {
    if (selectedProducts.includes(id)) {
      setSelectedProducts(selectedProducts.filter(p => p !== id))
    } else {
      setSelectedProducts([...selectedProducts, id])
    }
  }

  const toggleAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([])
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id))
    }
  }

  const PlatformBadge = ({ platform, data }: { platform: string, data: { status: string, price: number | null } }) => {
    let bgColor = 'bg-gray-100 text-gray-400'
    let text = '-'
    
    if (data.status === 'ACTIVE') {
      bgColor = platform === 'amazon' ? 'bg-amber-100 text-amber-700' : 
                platform === 'rakuten' ? 'bg-red-100 text-red-700' : 
                'bg-pink-100 text-pink-700'
      text = `¥${data.price?.toLocaleString()}`
    } else if (data.status === 'ERROR') {
      bgColor = 'bg-red-50 text-red-500 border border-red-200'
      text = 'エラー'
    } else if (data.status === 'INACTIVE') {
      text = '停止'
    }

    return (
      <div className={clsx("text-xs px-2 py-1 rounded flex items-center justify-center min-w-[60px]", bgColor)}>
        {text}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
            <TagIcon className="w-7 h-7 text-anet-500" />
            商品管理
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            商品マスターと各モールの出品状況
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-outline flex items-center gap-2 text-sm py-2">
            <ArrowPathIcon className="w-4 h-4" />
            モール同期
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex items-center gap-2 text-sm py-2"
          >
            <PlusIcon className="w-5 h-5" />
            商品登録
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
          <div className="flex-1 w-full relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
            <input
              type="text"
              placeholder="商品名、SKU、JANコードで検索..."
              className="input pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full lg:w-auto">
            <select 
              className="input w-full lg:w-40"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="ALL">全てのカテゴリ</option>
              <option value="食品・飲料">食品・飲料</option>
              <option value="キッチン用品">キッチン用品</option>
              <option value="アパレル">アパレル</option>
            </select>

            <select 
              className="input w-full lg:w-40"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="ALL">全てのステータス</option>
              <option value="ACTIVE">販売中</option>
              <option value="INACTIVE">停止中</option>
              <option value="OUT_OF_STOCK">在庫切れ</option>
              <option value="DRAFT">下書き</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        <AnimatePresence>
          {selectedProducts.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-anet-50 dark:bg-anet-900/20 border border-anet-200 dark:border-anet-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm font-medium text-anet-700 dark:text-anet-300 ml-2">
                  {selectedProducts.length} 点を選択中
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline text-xs py-2 h-9 bg-white dark:bg-ink-900">
                    一括編集
                  </button>
                  <button className="btn-outline text-xs py-2 h-9 bg-white dark:bg-ink-900 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300">
                    削除
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Products Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-washi-50 dark:bg-ink-800 border-b border-washi-200 dark:border-ink-700">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                    checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">商品情報</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">価格 / 在庫</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-center">Amazon</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-center">Rakuten</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-center">Yahoo!</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
              {filteredProducts.map((item) => (
                <tr key={item.id} className={clsx(
                  "transition-colors",
                  selectedProducts.includes(item.id) 
                    ? "bg-anet-50/50 dark:bg-anet-900/10" 
                    : "hover:bg-washi-50 dark:hover:bg-ink-800/50"
                )}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                      checked={selectedProducts.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-lg bg-washi-100 dark:bg-ink-700 flex items-center justify-center shrink-0">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <PhotoIcon className="w-6 h-6 text-ink-400" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-ink-900 dark:text-washi-100">{item.name}</div>
                        <div className="text-xs text-ink-400 mt-0.5">{item.sku}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge ${statusConfig[item.status].color} text-[10px] px-1.5 py-0.5`}>
                            {statusConfig[item.status].label}
                          </span>
                          <span className="text-[10px] bg-washi-100 dark:bg-ink-700 text-ink-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <QrCodeIcon className="w-3 h-3" />
                            {item.jan}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-ink-900 dark:text-washi-100 font-bold">
                      <CurrencyYenIcon className="w-4 h-4 text-ink-400" />
                      {item.price.toLocaleString()}
                    </div>
                    <div className={clsx(
                      "text-xs mt-1 font-medium",
                      item.stock === 0 ? "text-red-500" :
                      item.stock < 20 ? "text-amber-500" : "text-matcha-600"
                    )}>
                      在庫: {item.stock}個
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <PlatformBadge platform="amazon" data={item.platforms.amazon} />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <PlatformBadge platform="rakuten" data={item.platforms.rakuten} />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <PlatformBadge platform="yahoo" data={item.platforms.yahoo} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-ink-400 hover:text-anet-500 rounded-full hover:bg-anet-50 dark:hover:bg-anet-900/20 transition-colors">
                      <EllipsisVerticalIcon className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredProducts.length === 0 && (
          <div className="p-12 text-center text-ink-400">
            <CubeIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>商品が見つかりませんでした</p>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-ink-900 rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-washi-200 dark:border-ink-700">
                <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
                  <PlusIcon className="w-6 h-6 text-anet-500" />
                  新規商品登録
                </h3>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 text-ink-400 hover:text-ink-600 rounded-full hover:bg-washi-100 dark:hover:bg-ink-800 transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body (Scrollable) */}
              <div className="p-6 overflow-y-auto flex-1">
                <form id="product-form" onSubmit={handleRegister} className="space-y-8">
                  
                  {/* Basic Info Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-ink-900 dark:text-washi-100 border-l-4 border-anet-500 pl-3">
                      基本情報
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">商品名 <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          required
                          className="input" 
                          placeholder="例: プレミアム緑茶 100g"
                          value={newProduct.name}
                          onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">SKU (自社管理ID) <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          required
                          className="input" 
                          placeholder="例: SKU-001"
                          value={newProduct.sku}
                          onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">JANコード</label>
                        <input 
                          type="text" 
                          className="input" 
                          placeholder="例: 4901234567890"
                          value={newProduct.jan}
                          onChange={(e) => setNewProduct({...newProduct, jan: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">カテゴリ</label>
                        <select 
                          className="input"
                          value={newProduct.category}
                          onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                        >
                          <option value="食品・飲料">食品・飲料</option>
                          <option value="キッチン用品">キッチン用品</option>
                          <option value="アパレル">アパレル</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">商品画像</label>
                        <div className="border-2 border-dashed border-washi-300 dark:border-ink-600 rounded-xl p-4 flex flex-col items-center justify-center text-ink-400 hover:bg-washi-50 dark:hover:bg-ink-800 transition-colors cursor-pointer h-[100px]">
                          <CloudArrowUpIcon className="w-6 h-6 mb-1" />
                          <span className="text-xs">クリックしてアップロード</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pricing & Inventory Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-ink-900 dark:text-washi-100 border-l-4 border-matcha-500 pl-3">
                      価格・在庫
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">通常販売価格 (税込)</label>
                        <div className="relative">
                          <CurrencyYenIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                          <input 
                            type="number" 
                            className="input pl-9" 
                            placeholder="0"
                            value={newProduct.price}
                            onChange={(e) => setNewProduct({...newProduct, price: parseInt(e.target.value)})}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">原価 (税込)</label>
                        <div className="relative">
                          <CurrencyYenIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                          <input 
                            type="number" 
                            className="input pl-9" 
                            placeholder="0"
                            value={newProduct.cost}
                            onChange={(e) => setNewProduct({...newProduct, cost: parseInt(e.target.value)})}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">初期在庫数</label>
                        <input 
                          type="number" 
                          className="input" 
                          placeholder="0"
                          value={newProduct.stock}
                          onChange={(e) => setNewProduct({...newProduct, stock: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Channel Settings Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-ink-900 dark:text-washi-100 border-l-4 border-amber-500 pl-3">
                      出品チャンネル設定
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border border-washi-200 dark:border-ink-700 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white font-bold text-sm">A</div>
                          <span className="font-medium text-ink-900 dark:text-washi-100">Amazon.co.jp</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-warning" 
                          checked={newProduct.amazonEnabled}
                          onChange={(e) => setNewProduct({...newProduct, amazonEnabled: e.target.checked})}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border border-washi-200 dark:border-ink-700 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white font-bold text-sm">R</div>
                          <span className="font-medium text-ink-900 dark:text-washi-100">楽天市場</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-error"
                          checked={newProduct.rakutenEnabled}
                          onChange={(e) => setNewProduct({...newProduct, rakutenEnabled: e.target.checked})}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border border-washi-200 dark:border-ink-700 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-pink-500 flex items-center justify-center text-white font-bold text-sm">Y!</div>
                          <span className="font-medium text-ink-900 dark:text-washi-100">Yahoo!ショッピング</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-secondary" 
                          checked={newProduct.yahooEnabled}
                          onChange={(e) => setNewProduct({...newProduct, yahooEnabled: e.target.checked})}
                        />
                      </div>
                    </div>
                  </div>

                </form>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-washi-200 dark:border-ink-700 flex justify-end gap-3 bg-washi-50 dark:bg-ink-800/50">
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="btn-outline px-6"
                >
                  キャンセル
                </button>
                <button 
                  type="submit"
                  form="product-form"
                  className="btn-primary px-6"
                >
                  登録する
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

