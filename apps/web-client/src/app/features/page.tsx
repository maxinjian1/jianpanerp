'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { CheckCircleIcon, CubeIcon, ShoppingCartIcon, TruckIcon, ChartBarIcon, SparklesIcon } from '@heroicons/react/24/outline'

const features = [
  {
    name: 'マルチチャネル受注管理',
    description: 'Amazon、楽天、Yahoo!ショッピングなど、複数のECモールからの注文を一元管理。在庫連動機能により、売り越しを防止します。',
    icon: ShoppingCartIcon,
    color: 'from-anet-400 to-anet-600',
  },
  {
    name: 'スマート倉庫管理 (WMS)',
    description: 'バーコード検品、ロケーション管理、賞味期限管理など、倉庫業務を効率化する機能が充実。ハンディターミナルやスマホでの操作も可能です。',
    icon: CubeIcon,
    color: 'from-matcha-400 to-matcha-600',
  },
  {
    name: 'AI物流最適化',
    description: '配送先住所や荷物サイズに基づき、最適な配送業者（ヤマト、佐川、日本郵便など）をAIが自動選定。送料コストを最小化します。',
    icon: TruckIcon,
    color: 'from-sky-400 to-sky-600',
  },
  {
    name: '売上・在庫分析',
    description: 'チャネル別、商品別の売上推移を可視化。AIが将来の需要を予測し、最適な発注タイミングを提案します。',
    icon: ChartBarIcon,
    color: 'from-amber-400 to-amber-600',
  },
  {
    name: 'マーケティング支援',
    description: '市場トレンド分析、競合価格調査など、売上拡大のためのインサイトを提供。日本の商習慣に合わせた販促施策をサポートします。',
    icon: SparklesIcon,
    color: 'from-purple-400 to-purple-600',
  },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              機能一覧
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-300 max-w-2xl mx-auto">
              Japan ERPは、EC運営に必要なすべての機能をワンストップで提供します。
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div key={feature.name} className="card p-8 hover:shadow-lg transition-shadow">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100 mb-3">
                  {feature.name}
                </h3>
                <p className="text-ink-600 dark:text-ink-300">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center text-ink-900 dark:text-washi-100 mb-12">
              その他の機能
            </h2>
            <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 max-w-4xl mx-auto">
              {[
                '受注伝票の一括作成・印刷',
                '送り状発行ソフト（B2、e飛伝など）連携',
                'メールテンプレート管理・自動送信',
                'セット商品・同梱管理',
                '返品・交換対応フロー',
                '定期購入・サブスクリプション対応',
                '多言語・多通貨対応',
                '権限管理・操作ログ',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-matcha-500 flex-shrink-0" />
                  <span className="text-ink-700 dark:text-ink-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


