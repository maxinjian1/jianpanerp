'use client'

import Link from 'next/link'
import Image from 'next/image'

export function SiteFooter() {
  return (
    <footer className="bg-ink-900 dark:bg-ink-950 text-washi-300 py-12 px-4 sm:px-6 lg:px-8 border-t border-ink-800">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="block mb-6">
              <div className="relative h-10 w-40 bg-white/10 rounded-lg p-2">
                <Image
                  src="/images/anet-logo.png"
                  alt="ANET Logo"
                  fill
                  className="object-contain"
                />
              </div>
            </Link>
            <p className="text-sm text-ink-400 mb-6">
              日本のEC事業を支える
              <br />
              AI駆動型ERPプラットフォーム
            </p>
            <div className="text-sm text-ink-500 mb-4">
              <p className="font-bold text-ink-400">アネット株式会社</p>
              <p>〒739-0025</p>
              <p>広島県東広島市西条中央２丁目１−１４</p>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-white mb-4">製品</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/features" className="hover:text-anet-400 transition-colors">機能一覧</Link></li>
              <li><Link href="/pricing" className="hover:text-anet-400 transition-colors">料金プラン</Link></li>
              <li><Link href="/case-studies" className="hover:text-anet-400 transition-colors">導入事例</Link></li>
              <li><Link href="/api-integration" className="hover:text-anet-400 transition-colors">API連携</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">サポート</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/help" className="hover:text-anet-400 transition-colors">ヘルプセンター</Link></li>
              <li><Link href="/contact" className="hover:text-anet-400 transition-colors">お問い合わせ</Link></li>
              <li><Link href="/status" className="hover:text-anet-400 transition-colors">ステータス</Link></li>
              <li><Link href="/api-docs" className="hover:text-anet-400 transition-colors">API ドキュメント</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">会社情報</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/company" className="hover:text-anet-400 transition-colors">会社概要</Link></li>
              <li><Link href="/careers" className="hover:text-anet-400 transition-colors">採用情報</Link></li>
              <li><Link href="/privacy" className="hover:text-anet-400 transition-colors">プライバシーポリシー</Link></li>
              <li><Link href="/terms" className="hover:text-anet-400 transition-colors">利用規約</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-ink-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-ink-500">
          <div>
            <p>2024 アネット株式会社 (ANET CO LTD.) All rights reserved.</p>
            <p className="text-xs mt-1 text-ink-600">法人番号: 2240001023528 | インボイス番号: T2240001023528</p>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-anet-400 transition-colors">プライバシーポリシー</Link>
            <Link href="/terms" className="hover:text-anet-400 transition-colors">利用規約</Link>
            <Link href="/legal" className="hover:text-anet-400 transition-colors">特定商取引法に基づく表記</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

