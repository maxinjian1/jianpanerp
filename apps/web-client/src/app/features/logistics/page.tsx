'use client'

import { FeatureLayout } from '@/components/FeatureLayout'
import { TruckIcon } from '@heroicons/react/24/outline'

export default function LogisticsPage() {
  return (
    <FeatureLayout
      title="智能物流ルーティング"
      subtitle="最適な配送キャリアを、AIが瞬時に判断。"
      description="配送先の地域、荷物のサイズ・重量、配送希望日時から、最も安く、かつ確実に届く配送業者（ヤマト、佐川、日本郵便など）を自動で選択します。"
      icon={TruckIcon}
      color="from-sky-400 to-sky-600"
      features={[
        "ヤマト運輸、佐川急便、日本郵便の自動振り分け",
        "サイズ・重量・地域に基づく最安送料の自動計算",
        "各社送り状発行ソフト（B2、e飛伝など）用CSV生成",
        "Shift-JISエンコーディング自動対応",
        "離島・中継料発生地域の自動検知アラート",
        "配送状況のリアルタイムトラッキング"
      ]}
    >
      <div className="relative w-full h-64 bg-washi-100 dark:bg-ink-800 rounded-xl overflow-hidden">
        {/* Mock Map UI */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Kanto_region_map.png/640px-Kanto_region_map.png')] bg-cover bg-center" />
        
        {/* Animated Routes */}
        <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-anet-500 rounded-full shadow-lg shadow-anet-500/50 transform -translate-x-1/2 -translate-y-1/2 z-10" />
        
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute top-1/2 left-1/2 w-full h-0.5 bg-gradient-to-r from-anet-500 to-transparent transform origin-left animate-pulse" 
            style={{ 
              transform: `rotate(${i * 120}deg) translateX(0)`, 
              width: '40%' 
            }} 
          >
            <div className="absolute right-0 -top-1.5 w-3 h-3 bg-matcha-500 rounded-full" />
          </div>
        ))}

        <div className="absolute bottom-4 left-4 right-4 bg-white/90 dark:bg-ink-900/90 p-3 rounded-lg text-sm border border-washi-200 dark:border-ink-700 backdrop-blur">
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold text-ink-900 dark:text-washi-100">Order #1234</span>
            <span className="text-matcha-600 font-bold">Yamato Selected</span>
          </div>
          <div className="text-xs text-ink-500">Tokyo → Osaka (60 size) - ¥850</div>
        </div>
      </div>
    </FeatureLayout>
  )
}


