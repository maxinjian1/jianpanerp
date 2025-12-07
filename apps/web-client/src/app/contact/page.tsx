'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { EnvelopeIcon, PhoneIcon, MapPinIcon } from '@heroicons/react/24/outline'

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              お問い合わせ
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-300">
              ご質問やご相談がございましたら、お気軽にお問い合わせください。
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div className="card p-8 bg-white dark:bg-ink-900 shadow-lg border border-washi-200 dark:border-ink-800">
              <form className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    お名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    className="w-full px-4 py-3 rounded-xl bg-washi-50 dark:bg-ink-950 border border-washi-200 dark:border-ink-800 focus:ring-2 focus:ring-anet-500 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    メールアドレス <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="w-full px-4 py-3 rounded-xl bg-washi-50 dark:bg-ink-950 border border-washi-200 dark:border-ink-800 focus:ring-2 focus:ring-anet-500 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    件名
                  </label>
                  <select
                    id="subject"
                    className="w-full px-4 py-3 rounded-xl bg-washi-50 dark:bg-ink-950 border border-washi-200 dark:border-ink-800 focus:ring-2 focus:ring-anet-500 focus:border-transparent outline-none transition-all"
                  >
                    <option value="general">製品に関するお問い合わせ</option>
                    <option value="support">テクニカルサポート</option>
                    <option value="billing">料金・請求について</option>
                    <option value="partnership">パートナーシップについて</option>
                    <option value="other">その他</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    お問い合わせ内容 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="message"
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl bg-washi-50 dark:bg-ink-950 border border-washi-200 dark:border-ink-800 focus:ring-2 focus:ring-anet-500 focus:border-transparent outline-none transition-all"
                    required
                  ></textarea>
                </div>
                <button
                  type="submit"
                  className="w-full btn-primary py-4 text-lg font-bold shadow-lg shadow-anet-500/30 hover:shadow-anet-500/50"
                >
                  送信する
                </button>
              </form>
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <div className="card p-8 bg-washi-50 dark:bg-ink-900 border border-washi-200 dark:border-ink-800">
                <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100 mb-6">
                  アネット株式会社
                </h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <MapPinIcon className="w-6 h-6 text-anet-500 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-bold text-ink-900 dark:text-washi-100">所在地</p>
                      <p className="text-ink-600 dark:text-ink-300 mt-1">
                        〒739-0025<br />
                        広島県東広島市西条中央２丁目１−１４
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <PhoneIcon className="w-6 h-6 text-anet-500 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-bold text-ink-900 dark:text-washi-100">電話・FAX</p>
                      <p className="text-ink-600 dark:text-ink-300 mt-1">
                        Tel: 082-430-8758<br />
                        Fax: 082-430-8757
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <EnvelopeIcon className="w-6 h-6 text-anet-500 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-bold text-ink-900 dark:text-washi-100">オンライン</p>
                      <p className="text-ink-600 dark:text-ink-300 mt-1">
                        <a href="http://www.anetb.com" target="_blank" rel="noopener noreferrer" className="hover:text-anet-500 underline">
                          http://www.anetb.com
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card p-8 bg-gradient-to-br from-anet-50 to-anet-100 dark:from-anet-950/30 dark:to-anet-900/30 border border-anet-200 dark:border-anet-800">
                <h3 className="text-lg font-bold text-anet-800 dark:text-anet-200 mb-2">
                  お急ぎですか？
                </h3>
                <p className="text-anet-700 dark:text-anet-300 mb-4">
                  よくある質問については、ヘルプセンターをご確認ください。
                </p>
                <a href="/help" className="text-anet-600 dark:text-anet-400 font-bold hover:underline flex items-center gap-1">
                  ヘルプセンターを見る &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


