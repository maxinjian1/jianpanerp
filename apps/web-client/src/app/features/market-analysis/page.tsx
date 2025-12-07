'use client'

import { FeatureLayout } from '@/components/FeatureLayout'
import { GlobeAsiaAustraliaIcon } from '@heroicons/react/24/outline'

export default function MarketAnalysisPage() {
  return (
    <FeatureLayout
      title="市場分析・競合調査"
      subtitle="勝てる商品を見つけ、勝てる価格で売る。"
      description="Amazon、楽天のランキングや競合他社の販売動向をリアルタイムで追跡。ニッチな市場機会を発見し、AIが利益を最大化する価格戦略を提案します。"
      icon={GlobeAsiaAustraliaIcon}
      color="from-purple-400 to-purple-600"
      features={[
        "Amazon/楽天のカテゴリ別売れ筋ランキング追跡",
        "競合商品の価格変動モニタリングとアラート",
        "キーワード検索ボリュームと競合性の分析",
        "レビュー感情分析による商品改善ヒントの抽出",
        "利益シミュレーター（手数料・原価・送料計算）",
        "ブルーオーシャン商品発掘アシスト"
      ]}
    >
      <div className="w-full space-y-4">
        <div className="flex justify-between items-end border-b border-washi-200 dark:border-ink-700 pb-2">
          <h3 className="font-bold text-ink-900 dark:text-washi-100">Competitor Price Watch</h3>
          <span className="text-xs text-ink-500">Live Tracking</span>
        </div>
        {[
          { name: 'Competitor A', price: '¥2,980', change: '-5%', status: 'Warning' },
          { name: 'Competitor B', price: '¥3,200', change: '0%', status: 'Stable' },
          { name: 'Your Price', price: '¥3,000', change: 'Optimal', status: 'Good' },
        ].map((comp, i) => (
          <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${comp.name === 'Your Price' ? 'bg-anet-50 dark:bg-anet-900/20 border border-anet-200' : 'bg-washi-50 dark:bg-ink-800'}`}>
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{comp.name}</span>
            <div className="flex items-center gap-4">
              <span className="font-bold text-ink-900 dark:text-washi-100">{comp.price}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                comp.change.startsWith('-') ? 'bg-red-100 text-red-700' : 'bg-matcha-100 text-matcha-700'
              }`}>
                {comp.change}
              </span>
            </div>
          </div>
        ))}
      </div>
    </FeatureLayout>
  )
}


