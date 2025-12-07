'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export default function StatusPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-ink-900 dark:text-washi-100 mb-8">
            システム稼働状況
          </h1>

          <div className="card p-6 mb-8 border-l-4 border-matcha-500 bg-matcha-50 dark:bg-matcha-900/10">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-matcha-500 animate-pulse"></div>
              <p className="font-bold text-matcha-700 dark:text-matcha-400">
                全システム正常稼働中
              </p>
            </div>
            <p className="text-sm text-matcha-600 dark:text-matcha-300 mt-1 pl-6">
              現在、障害の報告はありません。
            </p>
          </div>

          <div className="space-y-4">
            {[
              { name: 'Web管理画面', status: 'operational' },
              { name: 'APIサーバー', status: 'operational' },
              { name: 'Amazon連携', status: 'operational' },
              { name: '楽天連携', status: 'operational' },
              { name: 'Yahoo!ショッピング連携', status: 'operational' },
              { name: 'AI予測エンジン', status: 'operational' },
              { name: 'メール配信システム', status: 'operational' },
            ].map((service) => (
              <div key={service.name} className="flex items-center justify-between p-4 border-b border-washi-200 dark:border-ink-800">
                <span className="font-medium text-ink-700 dark:text-ink-200">
                  {service.name}
                </span>
                <span className="flex items-center gap-2 text-sm text-matcha-600 dark:text-matcha-400 font-medium">
                  <CheckIcon className="w-4 h-4" />
                  稼働中
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}


