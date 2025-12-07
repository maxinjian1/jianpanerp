'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export default function LegalPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-8">
            特定商取引法に基づく表記
          </h1>

          <div className="card p-8 bg-white dark:bg-ink-900 shadow-sm border border-washi-200 dark:border-ink-800">
            <dl className="divide-y divide-washi-200 dark:divide-ink-800">
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">販売業者</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">アネット株式会社 (ANET CO LTD.)</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">運営統括責任者</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">代表取締役社長</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">所在地</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  〒739-0025<br />
                  広島県東広島市西条中央２丁目１−１４
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">電話番号</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">082-430-8758</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">メールアドレス</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">support@anetb.com</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">販売価格</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  料金プランページに記載の通り
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">商品代金以外の必要料金</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  消費税、インターネット接続料金、通信料金等
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">支払方法</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  クレジットカード決済、銀行振込
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">支払時期</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  クレジットカード決済：各カード会社の引き落とし日<br />
                  銀行振込：請求書発行後、指定期日までにお振込み
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">サービスの提供時期</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  アカウント登録完了後、即時にご利用いただけます。
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">解約・返品について</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  サービスの性質上、返品はお受けできません。<br />
                  解約はいつでもマイページより手続き可能です。解約月の利用料金は日割り計算を行わず、1ヶ月分ご請求させていただきます。
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


