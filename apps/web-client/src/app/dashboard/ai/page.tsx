'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  SparklesIcon,
  ArrowTrendingUpIcon,
  ArrowPathIcon,
  ShoppingCartIcon,
  ExclamationCircleIcon,
  CheckBadgeIcon,
  CalendarIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// Mock Forecast Data
const generateForecastData = () => {
  const labels = []
  const historical = []
  const forecast = []
  const upper = []
  const lower = []
  
  // Past 30 days
  for (let i = 30; i > 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    labels.push(d.toISOString().slice(5, 10))
    const val = 50 + Math.sin(i * 0.5) * 20 + Math.random() * 10
    historical.push(val)
    forecast.push(null)
    upper.push(null)
    lower.push(null)
  }

  // Future 30 days
  for (let i = 0; i < 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    labels.push(d.toISOString().slice(5, 10))
    const val = 60 + Math.sin(i * 0.5) * 25 + i * 0.5
    historical.push(null)
    forecast.push(val)
    upper.push(val + 15)
    lower.push(val - 15)
  }

  return { labels, historical, forecast, upper, lower }
}

const mockData = generateForecastData()

// Mock Restock Suggestions
const suggestions = [
  {
    id: 'SUG-001',
    sku: 'SKU-002',
    name: '抹茶パウダー 50g',
    currentStock: 15,
    forecastedDemand: 120,
    suggestedQty: 150,
    reason: 'CRITICAL', // CRITICAL, HIGH, MEDIUM
    reasonText: '在庫が安全在庫を下回る見込み。即時発注が必要。',
    daysUntilStockout: 3,
    confidence: 92,
  },
  {
    id: 'SUG-002',
    sku: 'SKU-005',
    name: '桜餅セット（季節限定）',
    currentStock: 50,
    forecastedDemand: 200,
    suggestedQty: 200,
    reason: 'HIGH',
    reasonText: '季節性トレンドにより来週から需要急増の予測。',
    daysUntilStockout: 10,
    confidence: 88,
  },
  {
    id: 'SUG-003',
    sku: 'SKU-001',
    name: 'プレミアム緑茶 100g',
    currentStock: 80,
    forecastedDemand: 90,
    suggestedQty: 50,
    reason: 'MEDIUM',
    reasonText: '定期的な発注サイクル。',
    daysUntilStockout: 25,
    confidence: 95,
  },
]

export default function AiAnalysisPage() {
  const [selectedSku, setSelectedSku] = useState('SKU-002')
  const [isSimulating, setIsSimulating] = useState(false)

  const handleSimulate = () => {
    setIsSimulating(true)
    setTimeout(() => setIsSimulating(false), 2000)
  }

  const chartData = {
    labels: mockData.labels,
    datasets: [
      {
        label: '実績',
        data: mockData.historical,
        borderColor: 'rgba(107, 114, 128, 0.5)',
        backgroundColor: 'rgba(107, 114, 128, 0.5)',
        pointRadius: 2,
        tension: 0.4,
      },
      {
        label: 'AI予測',
        data: mockData.forecast,
        borderColor: '#e54871', // Sakura-500
        backgroundColor: '#e54871',
        pointRadius: 2,
        tension: 0.4,
        borderDash: [5, 5],
      },
      {
        label: '信頼区間 (上限)',
        data: mockData.upper,
        borderColor: 'transparent',
        backgroundColor: 'rgba(229, 72, 113, 0.1)', // Sakura-500 alpha
        fill: 1, // fill to next dataset
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: '信頼区間 (下限)',
        data: mockData.lower,
        borderColor: 'transparent',
        backgroundColor: 'rgba(229, 72, 113, 0.1)',
        fill: true,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          filter: (item: any) => !item.text.includes('信頼区間'),
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 10,
        },
      },
    },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
            <SparklesIcon className="w-7 h-7 text-anet-500" />
            AI 分析 & 予測
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            Prophetモデルによる需要予測と在庫最適化
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <CpuChipIcon className="w-4 h-4" />
          モデル最終更新: 本日 09:30
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ==================== Sales Forecast Chart ==================== */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-5 h-5 text-anet-500" />
                売上予測 (30日)
              </h3>
              <select 
                className="input py-1 px-3 text-sm w-48"
                value={selectedSku}
                onChange={(e) => setSelectedSku(e.target.value)}
              >
                <option value="SKU-002">抹茶パウダー 50g</option>
                <option value="SKU-001">プレミアム緑茶 100g</option>
                <option value="SKU-005">桜餅セット</option>
              </select>
            </div>
            
            <div className="h-80 w-full relative">
              {isSimulating && (
                <div className="absolute inset-0 bg-white/50 dark:bg-ink-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <ArrowPathIcon className="w-8 h-8 text-anet-500 animate-spin" />
                    <span className="text-sm font-medium text-anet-600">AI計算中...</span>
                  </div>
                </div>
              )}
              <Line data={chartData} options={chartOptions} />
            </div>

            <div className="mt-4 flex gap-4 text-xs text-ink-500 justify-center">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-gray-400 opacity-50"></div>
                実績データ
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-anet-500"></div>
                AI予測値
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-anet-200 opacity-50"></div>
                信頼区間 (95%)
              </div>
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card p-5 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
              <h4 className="text-indigo-900 dark:text-indigo-100 font-bold mb-2 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                季節性トレンド検知
              </h4>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                この商品は<strong>「週末」</strong>と<strong>「月下旬」</strong>に売上が伸びる傾向があります。また、気温が25度を超えると需要が15%上昇する相関が見られます。
              </p>
            </div>
            <div className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
              <h4 className="text-amber-900 dark:text-amber-100 font-bold mb-2 flex items-center gap-2">
                <ExclamationCircleIcon className="w-5 h-5" />
                リスク警告
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                現在の在庫減少ペースが続くと、予測される<strong>10日後のピーク需要</strong>に対応できない可能性が高いです。
              </p>
            </div>
          </div>
        </div>

        {/* ==================== Restock Suggestions ==================== */}
        <div className="space-y-6">
          <div className="card p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 flex items-center gap-2">
                <ShoppingCartIcon className="w-5 h-5 text-matcha-500" />
                自動補充提案
              </h3>
              <button 
                onClick={handleSimulate}
                className="text-xs text-anet-500 hover:text-anet-600 flex items-center gap-1"
              >
                <ArrowPathIcon className={clsx("w-3 h-3", isSimulating && "animate-spin")} />
                再計算
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto max-h-[600px] pr-2">
              {suggestions.map((item) => (
                <div 
                  key={item.id} 
                  className={clsx(
                    "p-4 rounded-xl border transition-all hover:shadow-md",
                    item.reason === 'CRITICAL' ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" :
                    item.reason === 'HIGH' ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" :
                    "bg-white border-washi-200 dark:bg-ink-800 dark:border-ink-700"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={clsx(
                        "text-xs font-bold px-2 py-0.5 rounded-full mb-1 inline-block",
                        item.reason === 'CRITICAL' ? "bg-red-100 text-red-700" :
                        item.reason === 'HIGH' ? "bg-amber-100 text-amber-700" :
                        "bg-matcha-100 text-matcha-700"
                      )}>
                        {item.reason === 'CRITICAL' ? '緊急' : item.reason === 'HIGH' ? '要注意' : '通常'}
                      </span>
                      <h4 className="font-bold text-ink-900 dark:text-washi-100 text-sm">
                        {item.name}
                      </h4>
                      <p className="text-xs text-ink-500">{item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-ink-500">欠品まで</p>
                      <p className="font-bold text-ink-900 dark:text-washi-100">あと {item.daysUntilStockout} 日</p>
                    </div>
                  </div>

                  <p className="text-xs text-ink-600 dark:text-ink-300 mb-3 bg-white/50 dark:bg-black/20 p-2 rounded">
                    💡 {item.reasonText}
                  </p>

                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="text-center">
                      <p className="text-xs text-ink-400">現在庫</p>
                      <p className="font-medium">{item.currentStock}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-ink-400">予測需要</p>
                      <p className="font-medium">{item.forecastedDemand}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-ink-400 text-matcha-600">推奨発注</p>
                      <p className="font-bold text-matcha-600 text-lg">+{item.suggestedQty}</p>
                    </div>
                  </div>

                  <button className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2">
                    <CheckBadgeIcon className="w-4 h-4" />
                    発注を作成
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

