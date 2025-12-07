'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { CheckIcon } from '@heroicons/react/24/outline'

const plans = [
  {
    name: 'スターター',
    price: '9,800',
    description: '月間出荷件数 1,000件まで',
    features: [
      '受注管理 (Amazon/楽天)',
      '在庫連動 (15分間隔)',
      '送り状発行CSV出力',
      'メールサポート',
      'ユーザー数 3名まで',
    ],
    cta: '無料で試す',
    popular: false,
  },
  {
    name: 'スタンダード',
    price: '29,800',
    description: '月間出荷件数 5,000件まで',
    features: [
      '受注管理 (無制限)',
      '在庫連動 (リアルタイム)',
      'スマート倉庫管理 (WMS)',
      'AI物流ルーティング',
      '売上分析レポート',
      'チャットサポート',
      'ユーザー数 10名まで',
    ],
    cta: '無料で試す',
    popular: true,
  },
  {
    name: 'エンタープライズ',
    price: 'お問い合わせ',
    description: '月間出荷件数 無制限',
    features: [
      'すべてのスタンダード機能',
      '専任カスタマーサクセス',
      'カスタマイズ開発',
      'APIアクセス上限緩和',
      'SLA保証',
      'オンプレミス対応可',
      'ユーザー数 無制限',
    ],
    cta: 'お問い合わせ',
    popular: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-ink-900 dark:text-washi-100 mb-4">
              料金プラン
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-300 max-w-2xl mx-auto">
              事業規模に合わせて選べるシンプルな料金プラン。<br />
              初期費用0円、14日間の無料トライアルから始められます。
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative card p-8 flex flex-col ${
                  plan.popular
                    ? 'border-2 border-anet-500 shadow-xl scale-105 z-10'
                    : 'border border-washi-200 dark:border-ink-800'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-anet-500 text-white px-4 py-1 rounded-full text-sm font-bold">
                    一番人気
                  </div>
                )}
                <h3 className="text-xl font-bold text-ink-900 dark:text-washi-100 mb-2">
                  {plan.name}
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-ink-900 dark:text-washi-100">
                    {plan.price.includes('お問い合わせ') ? '' : '¥'}
                    {plan.price}
                  </span>
                  {!plan.price.includes('お問い合わせ') && (
                    <span className="text-ink-500 dark:text-ink-400"> /月</span>
                  )}
                </div>
                <p className="text-sm text-ink-600 dark:text-ink-300 mb-6">
                  {plan.description}
                </p>
                <ul className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckIcon className="w-5 h-5 text-matcha-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-ink-700 dark:text-ink-200">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-xl font-bold transition-colors ${
                    plan.popular
                      ? 'btn-primary'
                      : 'bg-washi-100 dark:bg-ink-800 text-ink-900 dark:text-washi-100 hover:bg-washi-200 dark:hover:bg-ink-700'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-20 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center text-ink-900 dark:text-washi-100 mb-8">
              よくあるご質問
            </h2>
            <div className="space-y-6">
              {[
                {
                  q: '無料トライアル期間中に解約した場合、料金はかかりますか？',
                  a: 'いいえ、無料トライアル期間中（14日間）に解約された場合、料金は一切発生しません。',
                },
                {
                  q: 'プランの変更はいつでも可能ですか？',
                  a: 'はい、管理画面からいつでもプランのアップグレード・ダウングレードが可能です。変更は翌請求サイクルから適用されます。',
                },
                {
                  q: '支払い方法は何がありますか？',
                  a: 'クレジットカード（Visa, Mastercard, JCB, Amex, Diners）および銀行振込（請求書払い）に対応しています。',
                },
              ].map((faq, index) => (
                <div key={index} className="card p-6">
                  <h3 className="font-bold text-ink-900 dark:text-washi-100 mb-2">
                    Q. {faq.q}
                  </h3>
                  <p className="text-ink-600 dark:text-ink-300">
                    A. {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


