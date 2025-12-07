'use client'

import { FeatureLayout } from '@/components/FeatureLayout'
import { SparklesIcon } from '@heroicons/react/24/outline'

export default function AiForecastPage() {
  return (
    <FeatureLayout
      title="AI売上予測"
      subtitle="未来の需要を予測し、機会損失を防ぐ。"
      description="過去の販売データ、季節性、トレンドをAI（Prophet/LGBM）が分析。いつ、どの商品が、どれくらい売れるかを高精度に予測し、最適な発注数を提案します。"
      icon={SparklesIcon}
      color="from-amber-400 to-amber-600"
      features={[
        "Prophet & LightGBMによるハイブリッド予測モデル",
        "季節性・イベント（セール等）を考慮した需要予測",
        "欠品リスク・過剰在庫リスクのアラート通知",
        "適正発注量の自動算出と発注書ドラフト作成",
        "SKUごとのライフサイクル分析（導入期〜衰退期）",
        "天候データとの連動（オプション）"
      ]}
    >
      <div className="w-full h-full flex items-end justify-between gap-2 px-4 pb-4">
        {[30, 45, 35, 60, 50, 75, 65, 80, 95, 85].map((h, i) => (
          <div key={i} className="relative w-full group">
            <div 
              className={`w-full rounded-t-md transition-all duration-500 ${i > 6 ? 'bg-amber-400 opacity-80 border-t-2 border-white border-dashed' : 'bg-anet-500'}`}
              style={{ height: `${h}%` }}
            />
            {i === 7 && (
              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-ink-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                AI Prediction
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-ink-900 rotate-45" />
              </div>
            )}
          </div>
        ))}
      </div>
    </FeatureLayout>
  )
}


