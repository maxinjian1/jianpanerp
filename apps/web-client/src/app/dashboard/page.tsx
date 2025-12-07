'use client'

import { motion } from 'framer-motion'
import {
  ShoppingCartIcon,
  CurrencyYenIcon,
  CubeIcon,
  TruckIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const stats = [
  {
    name: '本日の受注',
    value: '127',
    change: '+12%',
    changeType: 'positive',
    icon: ShoppingCartIcon,
    color: 'from-anet-400 to-anet-600',
  },
  {
    name: '本日の売上',
    value: '¥2,847,500',
    change: '+8%',
    changeType: 'positive',
    icon: CurrencyYenIcon,
    color: 'from-matcha-400 to-matcha-600',
  },
  {
    name: '出荷待ち',
    value: '43',
    change: '-5%',
    changeType: 'positive',
    icon: TruckIcon,
    color: 'from-sky-400 to-sky-600',
  },
  {
    name: '在庫アラート',
    value: '8',
    change: '+2',
    changeType: 'negative',
    icon: ExclamationTriangleIcon,
    color: 'from-amber-400 to-amber-600',
  },
]

const recentOrders = [
  {
    id: 'ORD-2024-001234',
    platform: 'Amazon',
    customer: '山田太郎',
    amount: '¥12,800',
    status: '出荷待ち',
    statusColor: 'warning',
  },
  {
    id: 'ORD-2024-001233',
    platform: '楽天',
    customer: '鈴木花子',
    amount: '¥8,500',
    status: '出荷完了',
    statusColor: 'success',
  },
  {
    id: 'ORD-2024-001232',
    platform: 'Yahoo!',
    customer: '佐藤一郎',
    amount: '¥23,400',
    status: 'ピッキング中',
    statusColor: 'info',
  },
  {
    id: 'ORD-2024-001231',
    platform: 'Amazon',
    customer: '田中美咲',
    amount: '¥5,200',
    status: '出荷完了',
    statusColor: 'success',
  },
  {
    id: 'ORD-2024-001230',
    platform: '楽天',
    customer: '高橋健太',
    amount: '¥18,900',
    status: '確認待ち',
    statusColor: 'error',
  },
]

const lowStockProducts = [
  { sku: 'SKU-001', name: 'プレミアム緑茶 100g', stock: 12, reorderPoint: 20 },
  { sku: 'SKU-023', name: '抹茶パウダー 50g', stock: 5, reorderPoint: 15 },
  { sku: 'SKU-045', name: 'ほうじ茶ティーバッグ 20P', stock: 8, reorderPoint: 25 },
  { sku: 'SKU-067', name: '玄米茶 200g', stock: 3, reorderPoint: 10 },
]

const aiInsights = [
  {
    title: '売上予測',
    description: '来週の売上は前週比15%増の見込みです。金曜日にピークが予想されます。',
    action: '詳細を見る',
  },
  {
    title: '補充提案',
    description: 'SKU-023「抹茶パウダー」は3日以内に欠品の恐れがあります。50個の発注を推奨。',
    action: '発注を作成',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Page header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100">
          ダッシュボード
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-1">
          本日の業務状況をご確認ください
        </p>
      </motion.div>

      {/* Stats grid */}
      <motion.div variants={itemVariants} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-ink-500 dark:text-ink-400">{stat.name}</p>
                <p className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">
                  {stat.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {stat.changeType === 'positive' ? (
                <ArrowUpIcon className="w-4 h-4 text-matcha-500" />
              ) : (
                <ArrowDownIcon className="w-4 h-4 text-red-500" />
              )}
              <span
                className={clsx(
                  'text-sm font-medium',
                  stat.changeType === 'positive' ? 'text-matcha-600' : 'text-red-600'
                )}
              >
                {stat.change}
              </span>
              <span className="text-sm text-ink-400">前日比</span>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="card">
            <div className="p-6 border-b border-washi-100 dark:border-ink-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink-900 dark:text-washi-100">
                  最近の受注
                </h2>
                <a href="/dashboard/orders" className="text-sm text-anet-500 hover:text-anet-600">
                  すべて見る →
                </a>
              </div>
            </div>
            <div className="divide-y divide-washi-100 dark:divide-ink-700">
              {recentOrders.map((order) => (
                <div key={order.id} className="p-4 flex items-center justify-between hover:bg-washi-50 dark:hover:bg-ink-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-washi-100 dark:bg-ink-700 flex items-center justify-center">
                      <ShoppingCartIcon className="w-5 h-5 text-ink-500" />
                    </div>
                    <div>
                      <p className="font-medium text-ink-900 dark:text-washi-100">{order.id}</p>
                      <p className="text-sm text-ink-500 dark:text-ink-400">
                        {order.platform} • {order.customer}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-ink-900 dark:text-washi-100">{order.amount}</p>
                    <span className={`badge badge-${order.statusColor}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* AI Insights */}
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="card">
            <div className="p-6 border-b border-washi-100 dark:border-ink-700">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-anet-500" />
                <h2 className="text-lg font-bold text-ink-900 dark:text-washi-100">
                  AI インサイト
                </h2>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {aiInsights.map((insight, index) => (
                <div key={index} className="p-4 rounded-xl bg-gradient-to-br from-anet-50 to-anet-100/50 dark:from-anet-900/20 dark:to-anet-900/10">
                  <h4 className="font-medium text-ink-900 dark:text-washi-100 mb-1">
                    {insight.title}
                  </h4>
                  <p className="text-sm text-ink-600 dark:text-ink-300 mb-3">
                    {insight.description}
                  </p>
                  <button className="text-sm font-medium text-anet-600 hover:text-anet-700">
                    {insight.action} →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Low stock alert */}
          <div className="card">
            <div className="p-6 border-b border-washi-100 dark:border-ink-700">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-ink-900 dark:text-washi-100">
                  在庫アラート
                </h2>
              </div>
            </div>
            <div className="divide-y divide-washi-100 dark:divide-ink-700">
              {lowStockProducts.map((product) => (
                <div key={product.sku} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-ink-900 dark:text-washi-100 text-sm">
                      {product.name}
                    </p>
                    <span className="badge badge-warning">
                      残り {product.stock}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-washi-200 dark:bg-ink-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${(product.stock / product.reorderPoint) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-500">{product.sku}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-washi-100 dark:border-ink-700">
              <button className="w-full btn-outline text-sm py-2">
                一括発注を作成
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

