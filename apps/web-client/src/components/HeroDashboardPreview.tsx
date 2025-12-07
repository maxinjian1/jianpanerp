'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CubeIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
  BellIcon,
  MagnifyingGlassIcon,
  EllipsisHorizontalIcon,
  BoltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

// Mock Data for Animations
const initialSalesData = [
  { name: '00:00', value: 4000 },
  { name: '04:00', value: 3000 },
  { name: '08:00', value: 2000 },
  { name: '12:00', value: 2780 },
  { name: '16:00', value: 1890 },
  { name: '20:00', value: 2390 },
  { name: '24:00', value: 3490 },
]

const inventoryData = [
  { name: '在庫A', value: 85, full: 100 },
  { name: '在庫B', value: 45, full: 100 },
  { name: '在庫C', value: 90, full: 100 },
  { name: '在庫D', value: 30, full: 100 },
]

const recentOrders = [
  { id: 'ORD-7829', product: 'プレミアム化粧水', amount: '¥4,500', status: 'shipped', time: '2分前' },
  { id: 'ORD-7830', product: 'オーガニックコットン', amount: '¥2,800', status: 'processing', time: '5分前' },
  { id: 'ORD-7831', product: 'ワイヤレスイヤホン', amount: '¥12,000', status: 'pending', time: '8分前' },
]

export function HeroDashboardPreview() {
  const [salesData, setSalesData] = useState(initialSalesData)
  const [activeOrders, setActiveOrders] = useState(recentOrders)
  const [notification, setNotification] = useState<string | null>(null)

  // Simulate Real-time Data Updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update Sales Chart
      setSalesData((prev) => {
        const newData = [...prev]
        const lastValue = newData[newData.length - 1].value
        const randomChange = Math.floor(Math.random() * 1000) - 400
        const newValue = Math.max(1000, Math.min(5000, lastValue + randomChange))
        
        newData.shift()
        newData.push({
          name: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
          value: newValue
        })
        return newData
      })

      // Random Notification
      if (Math.random() > 0.7) {
        const msgs = ['AI在庫分析完了', '新規注文を受信', '出荷ラベル生成完了', 'Amazon在庫同期完了']
        setNotification(msgs[Math.floor(Math.random() * msgs.length)])
        setTimeout(() => setNotification(null), 3000)
      }

    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative mx-auto max-w-6xl perspective-1000">
      {/* Glassmorphism Container with Tilt Effect */}
      <motion.div
        initial={{ rotateX: 10, rotateY: 0, opacity: 0, y: 50 }}
        animate={{ rotateX: 0, rotateY: 0, opacity: 1, y: 0 }}
        transition={{ duration: 1.2, type: 'spring', bounce: 0.3 }}
        className="relative z-10 bg-white/90 dark:bg-ink-900/90 backdrop-blur-xl rounded-2xl border border-washi-200 dark:border-ink-700 shadow-2xl overflow-hidden"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-washi-200 dark:border-ink-800">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-matcha-500/80" />
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-washi-100 dark:bg-ink-800 rounded-lg text-xs text-ink-500">
              <MagnifyingGlassIcon className="w-3.5 h-3.5" />
              <span>検索...</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <BellIcon className="w-5 h-5 text-ink-400" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-anet-500 rounded-full animate-pulse" />
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-anet-400 to-anet-600" />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="p-6 grid grid-cols-12 gap-6">
          
          {/* Left Column: Stats & Chart */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: '本日の売上', value: '¥1,240,000', change: '+12%', icon: ArrowTrendingUpIcon, color: 'text-matcha-500' },
                { label: '受注件数', value: '156件', change: '+5%', icon: ShoppingCartIcon, color: 'text-sky-500' },
                { label: '出荷待ち', value: '23件', change: '-2%', icon: TruckIcon, color: 'text-amber-500' },
                { label: '稼働率', value: '99.9%', change: '安定', icon: BoltIcon, color: 'text-anet-500' },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="p-4 rounded-xl bg-washi-50 dark:bg-ink-800/50 border border-washi-100 dark:border-ink-800"
                >
                  <div className="flex justify-between items-start mb-2">
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    <span className={`text-xs font-medium ${stat.change.startsWith('+') ? 'text-matcha-600' : 'text-ink-400'}`}>
                      {stat.change}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-ink-900 dark:text-washi-100 tracking-tight">
                    {stat.value}
                  </div>
                  <div className="text-xs text-ink-500 mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Main Chart Area */}
            <div className="p-6 rounded-2xl bg-white dark:bg-ink-800/30 border border-washi-200 dark:border-ink-700 relative overflow-hidden group">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-bold text-ink-900 dark:text-washi-100">リアルタイム売上推移</h3>
                  <p className="text-xs text-ink-500 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-matcha-500 animate-pulse" />
                    Live Update
                  </p>
                </div>
                <div className="flex gap-2">
                  {['1H', '24H', '7D', '30D'].map((t) => (
                    <button key={t} className={`px-3 py-1 text-xs rounded-md transition-colors ${t === '24H' ? 'bg-anet-100 text-anet-700 font-medium' : 'text-ink-400 hover:bg-washi-100'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesData}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} opacity={0.5} />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `¥${value}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1b1e', border: 'none', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#ec4899"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                      isAnimationActive={true}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Scanning Line Effect */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                <motion.div
                  animate={{ left: ['0%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                  className="absolute top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-anet-400 to-transparent opacity-50 blur-[1px]"
                />
              </div>
            </div>
          </div>

          {/* Right Column: AI Insights & Recent Activity */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            {/* AI Analysis Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-ink-900 to-ink-800 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-anet-500/20 blur-3xl rounded-full" />
              <div className="flex items-center gap-2 mb-4">
                <SparklesIcon className="w-5 h-5 text-anet-400" />
                <h3 className="font-bold">AI 需要予測</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1 text-ink-300">
                    <span>在庫リスク予測</span>
                    <span className="text-amber-400">注意</span>
                  </div>
                  <div className="w-full bg-ink-700 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '75%' }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      className="bg-amber-400 h-2 rounded-full"
                    />
                  </div>
                  <p className="text-xs text-ink-400 mt-2">
                    「プレミアム化粧水」の在庫が週末までに不足する可能性があります。
                  </p>
                </div>
                
                <div className="pt-4 border-t border-ink-700">
                  <div className="flex justify-between text-sm mb-1 text-ink-300">
                    <span>販売推奨アクション</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-ink-700/50 border border-ink-600">
                    <ArrowTrendingUpIcon className="w-4 h-4 text-matcha-400" />
                    <span className="text-xs">クーポン配布でCVR 15%向上見込み</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Orders List */}
            <div className="p-6 rounded-2xl bg-white dark:bg-ink-800/30 border border-washi-200 dark:border-ink-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-ink-900 dark:text-washi-100">最新の注文</h3>
                <EllipsisHorizontalIcon className="w-5 h-5 text-ink-400" />
              </div>
              <div className="space-y-4">
                <AnimatePresence>
                  {activeOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center justify-between p-2 hover:bg-washi-50 dark:hover:bg-ink-800 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-washi-100 dark:bg-ink-700 flex items-center justify-center">
                          <CubeIcon className="w-4 h-4 text-ink-500" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-ink-900 dark:text-washi-100">{order.product}</div>
                          <div className="text-xs text-ink-500">{order.id} • {order.time}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-ink-900 dark:text-washi-100">{order.amount}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          order.status === 'shipped' ? 'bg-matcha-100 text-matcha-700' :
                          order.status === 'processing' ? 'bg-sky-100 text-sky-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {order.status === 'shipped' ? '発送済' : order.status === 'processing' ? '処理中' : '保留'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Pop-up Notification Toast */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 20, x: '-50%' }}
              className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-ink-900 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm z-50"
            >
              <span className="w-2 h-2 rounded-full bg-matcha-500 animate-pulse" />
              {notification}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Background decorative elements */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-anet-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-sky-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
    </div>
  )
}

