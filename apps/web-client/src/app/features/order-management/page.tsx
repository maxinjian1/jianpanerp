'use client'

import { FeatureLayout } from '@/components/FeatureLayout'
import { ShoppingCartIcon } from '@heroicons/react/24/outline'

export default function OrderManagementPage() {
  return (
    <FeatureLayout
      title="マルチチャネル受注管理"
      subtitle="すべての注文を、ひとつの画面で。"
      description="Amazon、楽天市場、Yahoo!ショッピング、Shopifyなど、複数の販売チャネルからの注文を自動で取り込み、一元管理します。在庫連動機能により、売り越しによるキャンセルリスクをゼロに。"
      icon={ShoppingCartIcon}
      color="from-anet-400 to-anet-600"
      features={[
        "主要モール（Amazon, Rakuten, Yahoo!）とのAPI完全連携",
        "15分間隔での在庫自動同期による売り越し防止",
        "受注ステータスの自動更新と追跡番号の自動アップロード",
        "セット商品・同梱発送の自動処理",
        "ギフトラッピング・のし対応の自動判別",
        "受注伝票・納品書の一括作成・印刷"
      ]}
    >
      <div className="w-full space-y-4">
        {['Amazon', 'Rakuten', 'Yahoo!', 'Shopify'].map((mall, i) => (
          <div key={mall} className="flex items-center justify-between p-4 bg-washi-50 dark:bg-ink-800 rounded-xl border border-washi-200 dark:border-ink-700 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-ink-700 flex items-center justify-center font-bold text-ink-700 dark:text-ink-200 shadow-sm">
                {mall[0]}
              </div>
              <div>
                <div className="font-bold text-ink-900 dark:text-washi-100">{mall} Store</div>
                <div className="text-xs text-ink-500">Last sync: Just now</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-matcha-600 dark:text-matcha-400 text-sm font-bold">
              <span className="w-2 h-2 rounded-full bg-matcha-500 animate-pulse" />
              Connected
            </div>
          </div>
        ))}
      </div>
    </FeatureLayout>
  )
}


