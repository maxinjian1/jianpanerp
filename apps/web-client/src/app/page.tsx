'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ShoppingCartIcon,
  CubeIcon,
  TruckIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  GlobeAsiaAustraliaIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline'

const features = [
  {
    name: 'マルチチャネル受注管理',
    description: 'Amazon、楽天、Yahoo!ショッピングなど、複数のECプラットフォームからの注文を一元管理',
    icon: ShoppingCartIcon,
    color: 'from-anet-400 to-anet-600',
    link: '/features/order-management',
  },
  {
    name: 'スマート倉庫管理 (WMS)',
    description: 'PDA対応のピッキング、ロット管理、リアルタイム在庫追跡で倉庫作業を効率化',
    icon: CubeIcon,
    color: 'from-matcha-400 to-matcha-600',
    link: '/features/warehouse-management',
  },
  {
    name: '智能物流ルーティング',
    description: 'ヤマト、佐川、福山通運を自動判別。最適なキャリアを選択し、Shift-JIS対応CSVを生成',
    icon: TruckIcon,
    color: 'from-sky-400 to-sky-600',
    link: '/features/logistics',
  },
  {
    name: 'AI売上予測',
    description: 'Prophet/LGBMによる需要予測で、欠品・過剰在庫を防止。自動補充提案を生成',
    icon: SparklesIcon,
    color: 'from-amber-400 to-amber-600',
    link: '/features/ai-forecast',
  },
  {
    name: '市場分析・競合調査',
    description: '競合の価格・販売動向をリアルタイムで追跡。AIが最適な価格戦略を提案',
    icon: GlobeAsiaAustraliaIcon,
    color: 'from-purple-400 to-purple-600',
    link: '/features/market-analysis',
  },
  {
    name: '高度なレポート・分析',
    description: 'チャネル別、商品別の利益率を可視化。データに基づいた経営判断をサポート',
    icon: PresentationChartLineIcon,
    color: 'from-pink-400 to-pink-600',
    link: '/features/analytics',
  },
]

const benefits = [
  '14日間無料トライアル',
  'クレジットカード不要',
  'いつでもキャンセル可能',
  '日本語サポート完備',
]

const stats = [
  { value: '99.9%', label: '稼働率' },
  { value: '50%', label: '作業時間削減' },
  { value: '30%', label: '欠品率低下' },
  { value: '24/7', label: 'サポート対応' },
]

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { HeroDashboardPreview } from '@/components/HeroDashboardPreview'

export default function LandingPage() {
  const [email, setEmail] = useState('')

  return (
    <div className="min-h-screen pattern-bg">
      <SiteHeader />

      {/* Hero Section */}

      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-anet-100 dark:bg-anet-900/30 text-anet-600 dark:text-anet-400 text-sm font-medium mb-6">
              <SparklesIcon className="w-4 h-4" />
              AI駆動型 次世代ECプラットフォーム
            </span>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-ink-900 dark:text-washi-100 mb-6 leading-tight">
              日本のEC事業を
              <br />
              <span className="gradient-text">スマートに管理</span>
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-300 max-w-3xl mx-auto mb-10">
              Amazon、楽天、Yahoo!ショッピングの注文を一元管理。
              AI予測で在庫最適化、智能ルーティングで物流コスト削減。
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link href="/register" className="btn-primary text-lg px-8 py-4 flex items-center gap-2">
                14日間無料トライアル
                <ArrowRightIcon className="w-5 h-5" />
              </Link>
              <Link href="/demo" className="btn-outline text-lg px-8 py-4">
                デモを見る
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {benefits.map((benefit, index) => (
                <span key={index} className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
                  <CheckCircleIcon className="w-4 h-4 text-matcha-500" />
                  {benefit}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <div className="mt-16">
             <HeroDashboardPreview />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-ink-900">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              すべてを一つのプラットフォームで
            </h2>
            <p className="text-xl text-ink-600 dark:text-ink-300 max-w-2xl mx-auto">
              受注から出荷まで、EC運営に必要なすべての機能を統合
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Link 
                  href={feature.link}
                  className="card card-hover p-8 flex flex-col items-center text-center h-full group"
                >
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100 mb-3 group-hover:text-anet-600 dark:group-hover:text-anet-400 transition-colors">
                    {feature.name}
                  </h3>
                  <p className="text-ink-600 dark:text-ink-300 mb-6 flex-grow">
                    {feature.description}
                  </p>
                  <span className="text-anet-600 dark:text-anet-400 font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                    詳細を見る <ArrowRightIcon className="w-4 h-4" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="card overflow-hidden"
          >
            <div className="bg-gradient-to-br from-anet-500 to-anet-600 p-12 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">
                今すぐ始めましょう
              </h2>
              <p className="text-anet-100 mb-8 max-w-xl mx-auto">
                14日間の無料トライアルで、Japan ERPのすべての機能をお試しください。
                クレジットカードは不要です。
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="メールアドレス"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full sm:flex-1 px-5 py-4 rounded-xl bg-white/20 backdrop-blur border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
                />
                <button className="w-full sm:w-auto bg-white text-anet-600 px-8 py-4 rounded-xl font-bold hover:bg-anet-50 transition-colors">
                  無料で始める
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  )
}


