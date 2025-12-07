'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  CurrencyYenIcon,
  PresentationChartLineIcon,
  ShoppingBagIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

// Mock Data
const salesData = {
  labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
  datasets: [
    {
      label: '売上 (万円)',
      data: [120, 190, 300, 250, 200, 350],
      borderColor: '#e54871',
      backgroundColor: '#e54871',
      tension: 0.4,
    },
    {
      label: '利益 (万円)',
      data: [30, 50, 80, 60, 50, 90],
      borderColor: '#529652',
      backgroundColor: '#529652',
      tension: 0.4,
    },
  ],
}

const platformData = {
  labels: ['Amazon', 'Rakuten', 'Yahoo!', 'Shopify'],
  datasets: [
    {
      data: [45, 30, 15, 10],
      backgroundColor: [
        '#FF9900', // Amazon Orange
        '#BF0000', // Rakuten Red
        '#FF0033', // Yahoo Red (using a distinct red)
        '#95BF47', // Shopify Green
      ],
      borderWidth: 0,
    },
  ],
}

const topProducts = [
  { id: 1, name: 'プレミアム緑茶 100g', revenue: 1250000, quantity: 850, trend: '+12%' },
  { id: 2, name: '抹茶パウダー 50g', revenue: 980000, quantity: 620, trend: '+5%' },
  { id: 3, name: '急須（常滑焼）', revenue: 650000, quantity: 120, trend: '-3%' },
  { id: 4, name: 'ほうじ茶ティーバッグ', revenue: 450000, quantity: 900, trend: '+8%' },
  { id: 5, name: '桜餅セット', revenue: 320000, quantity: 200, trend: '+25%' },
]

export default function ReportsPage() {
  const [period, setPeriod] = useState('month') // week, month, year

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
            <PresentationChartLineIcon className="w-7 h-7 text-anet-500" />
            レポート & 分析
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            ビジネスの健全性と成長指標を可視化
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white dark:bg-ink-800 rounded-lg p-1 border border-washi-200 dark:border-ink-700">
            <button
              onClick={() => setPeriod('week')}
              className={clsx(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                period === 'week' ? 'bg-anet-50 text-anet-600' : 'text-ink-500 hover:text-ink-900'
              )}
            >
              週次
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={clsx(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                period === 'month' ? 'bg-anet-50 text-anet-600' : 'text-ink-500 hover:text-ink-900'
              )}
            >
              月次
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={clsx(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                period === 'year' ? 'bg-anet-50 text-anet-600' : 'text-ink-500 hover:text-ink-900'
              )}
            >
              年次
            </button>
          </div>
          <button className="btn-outline flex items-center gap-2 text-sm py-2">
            <ArrowDownTrayIcon className="w-4 h-4" />
            エクスポート
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-ink-500">総売上</p>
              <h3 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">¥3,650,000</h3>
            </div>
            <div className="p-2 bg-anet-100 rounded-lg text-anet-600">
              <CurrencyYenIcon className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-matcha-600 font-medium">↗ 12.5%</span>
            <span className="text-ink-400 ml-2">対前月比</span>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-ink-500">注文数</p>
              <h3 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">1,245</h3>
            </div>
            <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
              <ShoppingBagIcon className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-matcha-600 font-medium">↗ 8.2%</span>
            <span className="text-ink-400 ml-2">対前月比</span>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-ink-500">平均客単価</p>
              <h3 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">¥2,931</h3>
            </div>
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <UserGroupIcon className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-red-500 font-medium">↘ 1.4%</span>
            <span className="text-ink-400 ml-2">対前月比</span>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-ink-500">粗利益率</p>
              <h3 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mt-1">32.8%</h3>
            </div>
            <div className="p-2 bg-matcha-100 rounded-lg text-matcha-600">
              <ChartBarIcon className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-matcha-600 font-medium">↗ 2.1pt</span>
            <span className="text-ink-400 ml-2">対前月比</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-6">売上・利益推移</h3>
          <div className="h-80 w-full">
            <Line
              data={salesData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                  },
                  x: {
                    grid: { display: false },
                  },
                },
                plugins: {
                  legend: { position: 'top' },
                },
              }}
            />
          </div>
        </div>

        {/* Platform Breakdown */}
        <div className="card p-6">
          <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-6">チャネル別売上構成</h3>
          <div className="h-64 w-full flex items-center justify-center">
            <Doughnut
              data={platformData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom' },
                },
              }}
            />
          </div>
          <div className="mt-6 space-y-3">
            {platformData.labels.map((label, i) => (
              <div key={label} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: platformData.datasets[0].backgroundColor[i] }} />
                  <span className="text-ink-600 dark:text-ink-300">{label}</span>
                </div>
                <span className="font-bold text-ink-900 dark:text-washi-100">{platformData.datasets[0].data[i]}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Products Table */}
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-washi-200 dark:border-ink-700">
          <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100">商品別パフォーマンス (Top 5)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-washi-50 dark:bg-ink-800 border-b border-washi-200 dark:border-ink-700">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">順位</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500">商品名</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">売上高</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">販売数</th>
                <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">トレンド</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
              {topProducts.map((product, index) => (
                <tr key={product.id} className="hover:bg-washi-50 dark:hover:bg-ink-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className={clsx(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      index === 0 ? "bg-amber-100 text-amber-700" :
                      index === 1 ? "bg-gray-100 text-gray-700" :
                      index === 2 ? "bg-orange-100 text-orange-700" :
                      "text-ink-500"
                    )}>
                      {index + 1}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-ink-900 dark:text-washi-100">
                    {product.name}
                  </td>
                  <td className="px-6 py-4 text-right">
                    ¥{product.revenue.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-ink-600 dark:text-ink-300">
                    {product.quantity.toLocaleString()} 個
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={clsx(
                      "text-sm font-medium",
                      product.trend.startsWith('+') ? "text-matcha-600" : "text-red-500"
                    )}>
                      {product.trend}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

