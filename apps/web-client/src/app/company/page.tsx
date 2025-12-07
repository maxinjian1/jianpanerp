'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import Image from 'next/image'

export default function CompanyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-8">
            会社概要
          </h1>

          {/* Hero Image */}
          <div className="relative w-full h-64 sm:h-80 md:h-96 mb-12 rounded-2xl overflow-hidden shadow-xl">
            <Image
              src="/images/anet-office.jpg"
              alt="ANET Office"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
              <div className="text-white">
                <h2 className="text-2xl font-bold mb-2">アネット株式会社</h2>
                <p className="text-washi-200">Bridge of the world - 世界への架け橋</p>
              </div>
            </div>
          </div>

          <div className="card p-8 bg-white dark:bg-ink-900 shadow-sm border border-washi-200 dark:border-ink-800">
            <dl className="divide-y divide-washi-200 dark:divide-ink-800">
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">会社名</dt>
                <dd className="flex items-center gap-4 sm:col-span-2">
                  <div className="relative h-8 w-32">
                    <Image 
                      src="/images/anet-logo.png" 
                      alt="ANET Logo"
                      fill
                      className="object-contain object-left"
                    />
                  </div>
                  <span className="text-sm text-ink-900 dark:text-washi-100">アネット株式会社 (ANET CO LTD.)</span>
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">設立</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">2005年（平成17年）</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">所在地</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  〒739-0025<br />
                  広島県東広島市西条中央２丁目１−１４
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">代表者</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">代表取締役社長</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">連絡先</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  Tel: 082-430-8758<br />
                  Fax: 082-430-8757
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">URL</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  <a href="http://www.anetb.com" target="_blank" rel="noopener noreferrer" className="text-anet-600 hover:text-anet-500 hover:underline">
                    http://www.anetb.com
                  </a>
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">事業内容</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">
                  <ul className="list-disc list-inside space-y-1">
                    <li>クラウドERPシステムの開発・運営</li>
                    <li>ECサイト運営代行・コンサルティング</li>
                    <li>物流システム開発</li>
                    <li>AIソリューション開発</li>
                  </ul>
                </dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">法人番号</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">2240001023528</dd>
              </div>
              <div className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-ink-500 dark:text-ink-400">適格請求書発行事業者登録番号</dt>
                <dd className="text-sm text-ink-900 dark:text-washi-100 sm:col-span-2">T2240001023528</dd>
              </div>
            </dl>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

