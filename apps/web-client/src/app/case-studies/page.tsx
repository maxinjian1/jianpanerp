'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export default function CaseStudiesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              導入事例
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-300 max-w-2xl mx-auto">
              Japan ERPを導入して業務効率化を実現した企業の成功事例をご紹介します。
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-ink-800 dark:to-ink-700 animate-pulse flex items-center justify-center text-ink-400">
                  Image Placeholder
                </div>
                <div className="p-6">
                  <div className="text-sm text-anet-600 dark:text-anet-400 font-bold mb-2">
                    アパレル・ファッション
                  </div>
                  <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100 mb-3">
                    株式会社サンプル様
                  </h3>
                  <p className="text-ink-600 dark:text-ink-300 mb-4 text-sm">
                    導入により、出荷作業時間が50%削減。在庫差異もほぼゼロに。
                    AI売上予測のおかげで、欠品による機会損失を防ぐことができました。
                  </p>
                  <a href="#" className="text-anet-600 dark:text-anet-400 font-bold text-sm hover:underline">
                    続きを読む &rarr;
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


