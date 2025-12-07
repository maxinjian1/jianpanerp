'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export default function ApiIntegrationPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-8">
            API連携
          </h1>
          <div className="prose dark:prose-invert max-w-none">
            <p className="lead">
              Japan ERPは、主要なECモールやカートシステムとシームレスに連携します。
            </p>

            <h2>対応プラットフォーム</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 not-prose my-8">
              {['Amazon', '楽天市場', 'Yahoo!ショッピング', 'Shopify', 'BASE', 'STORES', 'WooCommerce', 'EC-CUBE'].map((platform) => (
                <div key={platform} className="card p-4 text-center font-bold text-ink-700 dark:text-ink-200">
                  {platform}
                </div>
              ))}
            </div>

            <h2>主な連携機能</h2>
            <ul>
              <li><strong>受注自動取込:</strong> 各モールの注文情報を自動で取り込み、一元管理します。</li>
              <li><strong>在庫連動:</strong> 1つのモールで商品が売れると、他のモールの在庫数も自動で更新されます。</li>
              <li><strong>商品情報の一括登録:</strong> 商品マスターを1つ作成するだけで、各モールへ出品可能です。</li>
              <li><strong>出荷ステータスの同期:</strong> 出荷が完了すると、各モールのステータスを自動で「発送済み」に更新し、追跡番号を登録します。</li>
            </ul>

            <h2>開発者向けAPI</h2>
            <p>
              独自の基幹システムやWMSと連携するためのREST APIも公開しています。
              詳しくは<a href="/api-docs">APIドキュメント</a>をご覧ください。
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


