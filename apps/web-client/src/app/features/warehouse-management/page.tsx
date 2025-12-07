'use client'

import { FeatureLayout } from '@/components/FeatureLayout'
import { CubeIcon } from '@heroicons/react/24/outline'

export default function WarehouseManagementPage() {
  return (
    <FeatureLayout
      title="スマート倉庫管理 (WMS)"
      subtitle="誤出荷ゼロ、在庫差異ゼロへ。"
      description="バーコードスキャンを活用した検品システムで、人為的なミスを排除。ロケーション管理、賞味期限管理、ロット管理など、高度な物流要件にも対応します。"
      icon={CubeIcon}
      color="from-matcha-400 to-matcha-600"
      features={[
        "ハンディターミナル・スマホでのバーコード検品",
        "フリーロケーション・固定ロケーションの両対応",
        "賞味期限・ロット番号別の在庫管理",
        "セット組み・加工指示書の作成",
        "FBA納品プラン作成機能",
        "棚卸し業務のデジタル化"
      ]}
    >
      <div className="grid grid-cols-2 gap-4 w-full">
        {[
          { label: '棚A-01', items: 120, status: 'Full' },
          { label: '棚B-03', items: 45, status: 'Low' },
          { label: '棚C-12', items: 88, status: 'OK' },
          { label: '冷凍庫1', items: 200, status: 'OK' },
        ].map((loc, i) => (
          <div key={i} className="p-4 bg-washi-50 dark:bg-ink-800 rounded-xl border border-washi-200 dark:border-ink-700 flex flex-col items-center justify-center gap-2">
            <CubeIcon className="w-8 h-8 text-ink-400" />
            <div className="font-bold text-ink-900 dark:text-washi-100">{loc.label}</div>
            <div className="text-sm text-ink-500">{loc.items} items</div>
            <div className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              loc.status === 'Low' ? 'bg-amber-100 text-amber-700' : 'bg-matcha-100 text-matcha-700'
            }`}>
              {loc.status}
            </div>
          </div>
        ))}
      </div>
    </FeatureLayout>
  )
}


