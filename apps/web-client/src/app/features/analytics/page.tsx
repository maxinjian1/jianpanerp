'use client'

import { FeatureLayout } from '@/components/FeatureLayout'
import { PresentationChartLineIcon } from '@heroicons/react/24/outline'

export default function AnalyticsPage() {
  return (
    <FeatureLayout
      title="高度なレポート・分析"
      subtitle="データの力で、経営判断を確信に。"
      description="売上、利益、広告対効果（ROAS）、LTVなど、EC経営に必要な重要指標（KPI）を自動で集計・可視化。チャネル別、商品別の詳細な損益分析（PL）もワンクリックで。"
      icon={PresentationChartLineIcon}
      color="from-pink-400 to-pink-600"
      features={[
        "リアルタイムの売上・粗利ダッシュボード",
        "チャネル別（Amazon vs 楽天）の収益性比較",
        "商品別・SKU別の詳細な損益計算（PL）",
        "顧客LTV分析とリピート率の可視化",
        "広告費（Amazon Ads等）と連動したROAS分析",
        "日次・週次・月次の自動レポート配信"
      ]}
    >
      <div className="grid grid-cols-2 gap-4 w-full h-full">
        <div className="col-span-2 bg-washi-50 dark:bg-ink-800 rounded-xl p-4 border border-washi-200 dark:border-ink-700">
          <div className="h-24 flex items-end justify-between gap-1">
             {[40, 60, 50, 70, 80, 60, 90].map((h, i) => (
               <div key={i} className="w-full bg-pink-500 rounded-t-sm" style={{ height: `${h}%`, opacity: (i + 3) / 10 }} />
             ))}
          </div>
          <div className="mt-2 text-center text-sm font-bold text-ink-700 dark:text-ink-200">Gross Profit Trend</div>
        </div>
        <div className="bg-washi-50 dark:bg-ink-800 rounded-xl p-4 border border-washi-200 dark:border-ink-700 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-pink-500">24%</div>
          <div className="text-xs text-ink-500">Profit Margin</div>
        </div>
        <div className="bg-washi-50 dark:bg-ink-800 rounded-xl p-4 border border-washi-200 dark:border-ink-700 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-sky-500">4.5x</div>
          <div className="text-xs text-ink-500">ROAS</div>
        </div>
      </div>
    </FeatureLayout>
  )
}


