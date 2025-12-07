'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export default function CareersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              採用情報
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-300 max-w-2xl mx-auto">
              日本のEC物流を変革する仲間を募集しています。
            </p>
          </div>

          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mb-6 border-b border-washi-200 dark:border-ink-800 pb-2">
                募集中の職種
              </h2>
              
              <div className="grid gap-6">
                {[
                  {
                    title: 'バックエンドエンジニア (NestJS)',
                    type: '正社員',
                    location: 'フルリモート / 広島本社',
                    description: 'ECプラットフォームのAPI開発、マイクロサービス設計、DBパフォーマンスチューニングを担当していただきます。',
                  },
                  {
                    title: 'フロントエンドエンジニア (Next.js)',
                    type: '正社員',
                    location: 'フルリモート / 広島本社',
                    description: 'Japan ERPのWebクライアント開発、UI/UX改善、パフォーマンス最適化を担当していただきます。',
                  },
                  {
                    title: 'AIエンジニア (Python)',
                    type: '正社員 / 業務委託',
                    location: 'フルリモート / 広島本社',
                    description: '売上予測モデルの構築、自然言語処理を用いたトレンド分析機能の開発を担当していただきます。',
                  },
                  {
                    title: 'カスタマーサクセス',
                    type: '正社員',
                    location: '広島本社 (一部リモート可)',
                    description: '導入企業様へのオンボーディング支援、運用サポート、フィードバック収集を担当していただきます。',
                  },
                ].map((job) => (
                  <div key={job.title} className="card p-6 hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100">
                        {job.title}
                      </h3>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 rounded-full bg-anet-100 dark:bg-anet-900/30 text-anet-700 dark:text-anet-300 text-xs font-bold">
                          {job.type}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-washi-200 dark:bg-ink-800 text-ink-700 dark:text-ink-300 text-xs font-bold">
                          {job.location}
                        </span>
                      </div>
                    </div>
                    <p className="text-ink-600 dark:text-ink-300 mb-4">
                      {job.description}
                    </p>
                    <a href="#" className="inline-block font-bold text-anet-600 dark:text-anet-400 hover:underline">
                      詳細を見る &rarr;
                    </a>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-washi-50 dark:bg-ink-900 p-8 rounded-2xl">
              <h2 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mb-4">
                働く環境
              </h2>
              <ul className="grid sm:grid-cols-2 gap-4 text-ink-700 dark:text-ink-300">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-anet-500"></span>
                  フレックスタイム制
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-anet-500"></span>
                  リモートワーク推奨
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-anet-500"></span>
                  書籍購入補助
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-anet-500"></span>
                  カンファレンス参加費補助
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-anet-500"></span>
                  最新PC貸与 (MacBook Pro等)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-anet-500"></span>
                  社会保険完備
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


