'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              ヘルプセンター
            </h1>
            <div className="relative max-w-xl mx-auto">
              <input
                type="text"
                placeholder="キーワードで検索（例：在庫連携、Amazon設定）"
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-washi-50 dark:bg-ink-900 border border-washi-200 dark:border-ink-800 focus:ring-2 focus:ring-anet-500 focus:border-transparent outline-none transition-all shadow-sm"
              />
              <MagnifyingGlassIcon className="w-6 h-6 text-ink-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { title: 'はじめての方へ', items: ['アカウント作成方法', '初期設定ガイド', '基本機能の紹介'] },
              { title: '受注管理', items: ['注文の確認方法', 'ステータスの変更', 'キャンセルの処理'] },
              { title: '在庫管理', items: ['在庫の登録・編集', 'ロケーション管理', '棚卸しについて'] },
              { title: '連携設定', items: ['Amazon連携手順', '楽天RMS連携手順', 'Yahoo!ショッピング連携'] },
              { title: 'トラブルシューティング', items: ['ログインできない場合', 'エラーが表示される場合', '連携がうまくいかない時'] },
              { title: 'アカウント・請求', items: ['パスワード変更', 'プラン変更', '請求書のダウンロード'] },
            ].map((section) => (
              <div key={section.title} className="card p-6">
                <h2 className="text-lg font-bold text-ink-900 dark:text-washi-100 mb-4">
                  {section.title}
                </h2>
                <ul className="space-y-3">
                  {section.items.map((item) => (
                    <li key={item}>
                      <a href="#" className="text-ink-600 dark:text-ink-300 hover:text-anet-500 hover:underline flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-anet-400"></span>
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


