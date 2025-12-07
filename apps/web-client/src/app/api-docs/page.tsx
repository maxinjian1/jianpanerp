'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1 hidden lg:block">
              <div className="sticky top-32">
                <h3 className="font-bold text-ink-900 dark:text-washi-100 mb-4">API リファレンス</h3>
                <nav className="space-y-1">
                  {['はじめに', '認証 (Authentication)', '注文 (Orders)', '商品 (Products)', '在庫 (Inventory)', '出荷 (Shipments)', 'ウェブフック (Webhooks)'].map((item) => (
                    <a key={item} href="#" className="block px-3 py-2 text-sm text-ink-600 dark:text-ink-400 hover:bg-washi-100 dark:hover:bg-ink-800 rounded-lg transition-colors">
                      {item}
                    </a>
                  ))}
                </nav>
              </div>
            </div>

            {/* Content */}
            <div className="lg:col-span-3 prose dark:prose-invert max-w-none">
              <h1>API ドキュメント</h1>
              <p>
                Japan ERP APIを使用すると、外部システムからJapan ERPのデータにプログラムでアクセスできます。
                在庫の同期、注文の取得、出荷情報の更新などを自動化できます。
              </p>

              <h2>認証 (Authentication)</h2>
              <p>
                すべてのAPIリクエストには、ヘッダーにAPIキーを含める必要があります。
                APIキーは管理画面の「設定 &gt; API連携」から発行できます。
              </p>
              <pre className="bg-ink-900 text-washi-100 p-4 rounded-lg overflow-x-auto">
                <code>
                  Authorization: Bearer YOUR_API_KEY
                </code>
              </pre>

              <h2>エンドポイント例: 注文一覧の取得</h2>
              <p>
                <code>GET /api/v1/orders</code>
              </p>
              <pre className="bg-ink-900 text-washi-100 p-4 rounded-lg overflow-x-auto">
                <code>
{`// レスポンス例
{
  "data": [
    {
      "id": "ord_12345",
      "platform": "amazon",
      "order_date": "2024-01-01T10:00:00Z",
      "total_amount": 5000,
      "status": "pending",
      "items": [...]
    }
  ],
  "meta": {
    "total": 1,
    "page": 1
  }
}`}
                </code>
              </pre>

              <div className="bg-anet-50 dark:bg-anet-900/10 p-4 rounded-lg border border-anet-200 dark:border-anet-800 mt-8">
                <h3 className="text-anet-800 dark:text-anet-300 font-bold m-0 mb-2">完全なドキュメント</h3>
                <p className="m-0 text-sm text-anet-700 dark:text-anet-400">
                  Swagger UI形式の詳細なAPI仕様書は、開発者ポータルでご覧いただけます。
                  <br />
                  <a href="#" className="font-bold underline">開発者ポータルへ移動 &rarr;</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


