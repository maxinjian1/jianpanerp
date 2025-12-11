'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChartBarIcon,
  MagnifyingGlassIcon,
  CurrencyYenIcon,
  ChatBubbleLeftRightIcon,
  ArrowTrendingUpIcon,
  ArrowPathIcon,
  HashtagIcon,
  CheckCircleIcon,
  SparklesIcon,
  NewspaperIcon,
  TagIcon,
  FireIcon,
  XMarkIcon,
  GlobeAltIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

const tabs = [
  { id: 'news', name: 'ニュース・動向', icon: NewspaperIcon },
  { id: 'category', name: 'カテゴリ分析', icon: ChartBarIcon },
  { id: 'social', name: 'SNSトレンド', icon: HashtagIcon },
  { id: 'profit', name: '利益シミュレーション', icon: CurrencyYenIcon },
]

// Mock Data for News
const allNews = {
  AMAZON_JP: [
    {
      id: 'a1',
      title: '【重要】2025年FBA配送代行手数料の改定について',
      category: '手数料',
      date: '2025-01-15',
      summary: '2025年4月1日より、FBA配送代行手数料が改定されます。特に大型商品の手数料が見直され、より柔軟なサイズ区分が導入される予定です。',
      content: `
        <p>2025年4月1日より、FBA配送代行手数料が改定されます。今回の改定は、物流コストの上昇と配送品質の維持を目的としています。</p>
        <h4 class="text-lg font-bold mt-4 mb-2">主な変更点</h4>
        <ul class="list-disc pl-5 space-y-1">
          <li>大型商品の配送代行手数料が平均5%引き上げられます。</li>
          <li>標準サイズの商品は、サイズ区分がより細分化され、軽量な商品については一部値下げとなります。</li>
          <li>長期保管手数料の計算基準が見直され、在庫回転率の向上がより重要になります。</li>
        </ul>
        <p class="mt-4">セラーの皆様におかれましては、新料金体系をご確認の上、価格設定や在庫計画の見直しをお願いいたします。</p>
      `,
      impact: 'HIGH',
      link: '#'
    },
    {
      id: 'a2',
      title: 'Amazonプライムデー2025のエントリー受付開始',
      category: 'イベント',
      date: '2025-02-01',
      summary: '今年のプライムデーに向けたLightning DealsおよびPrime Exclusive Discountsのエントリー受付が開始されました。締め切りは3月31日までです。',
      content: `
        <p>今年のAmazonプライムデー（2025年7月開催予定）に向けた、Lightning Deals（数量限定タイムセール）およびPrime Exclusive Discounts（プライム会員限定割引）のエントリー受付が開始されました。</p>
        <p class="mt-2">参加資格のあるセラー様は、セラーセントラルの「広告」>「タイムセール」ダッシュボードから申請が可能です。</p>
        <div class="bg-amber-50 p-4 rounded-lg mt-4 border border-amber-200 text-amber-800">
            <strong>エントリー締切: 2025年3月31日 23:59</strong>
        </div>
      `,
      impact: 'MEDIUM',
      link: '#'
    },
    {
      id: 'a3',
      title: '商品紹介コンテンツ(A+)に新モジュール追加',
      category: '機能更新',
      date: '2025-02-10',
      summary: 'プレミアムA+コンテンツに、比較表の新しいデザインと、動画を埋め込めるカルーセルモジュールが追加されました。',
      content: `
        <p>ブランド登録済みのセラー様が利用可能な「商品紹介コンテンツ(A+)」に、新しいモジュールが追加されました。</p>
        <ul class="list-disc pl-5 mt-2 space-y-1">
            <li><strong>インタラクティブな比較表:</strong> 顧客が商品を比較しやすくなる新しいデザインテンプレート。</li>
            <li><strong>動画カルーセル:</strong> 複数の動画をスワイプで閲覧できるモジュール。商品の使用感や特徴をより効果的に伝えられます。</li>
        </ul>
      `,
      impact: 'LOW',
      link: '#'
    },
    {
      id: 'a4',
      title: '「在庫パフォーマンス指標(IPI)」の閾値変更のお知らせ',
      category: '在庫管理',
      date: '2025-02-12',
      summary: '在庫保管制限の基準となるIPIスコアの閾値が400から450に変更されます。スコアが低いセラーは保管制限の対象となる可能性があります。',
      content: `
        <p>FBA倉庫の効率的な運用のため、在庫パフォーマンス指標(IPI)の閾値が変更されます。</p>
        <p class="font-bold mt-2">変更内容: 閾値を400から450へ引き上げ</p>
        <p class="mt-2">IPIスコアが450未満のセラー様は、次四半期の在庫保管制限の対象となる可能性があります。過剰在庫の削減や、販売速度の向上に向けた対策をご検討ください。</p>
      `,
      impact: 'HIGH',
      link: '#'
    }
  ],
  RAKUTEN: [
    {
      id: 'r1',
      title: '【楽天スーパーSALE】2025年3月開催日程と事前準備ガイド',
      category: 'イベント',
      date: '2025-02-18',
      summary: '3月の楽天スーパーSALEは4日(火)20:00スタート予定。店舗内買い回り促進のためのクーポン施策と、サーチ申請の締め切りについて解説します。',
      content: `
        <p>四半期に一度のビッグイベント「楽天スーパーSALE」が3月4日(火)20:00より開催される見込みです。</p>
        <h4 class="text-lg font-bold mt-4 mb-2">成功のための重要ポイント</h4>
        <ul class="list-disc pl-5 space-y-1">
          <li><strong>サーチ申請:</strong> 半額以下の商品はサーチ申請を行うことで、スーパーSALE特設ページへの露出チャンスが得られます。締切は2月25日です。</li>
          <li><strong>店舗内買い回り:</strong> 複数商品の購入を促すため、店舗独自の「まとめ買いクーポン」の発行を推奨します。</li>
          <li><strong>事前告知:</strong> イベント開始前の「お気に入り登録」を促すキャンペーンバナーを設置しましょう。</li>
        </ul>
      `,
      impact: 'HIGH',
      link: '#'
    },
    {
      id: 'r2',
      title: 'SKUプロジェクト移行に関する最終案内',
      category: 'システム',
      date: '2025-02-05',
      summary: '商品属性情報の必須入力項目が追加されます。旧来のディレクトリIDから新タグIDへの移行状況をご確認ください。',
      content: `
        <p>楽天市場の検索ロジック改善に伴う「SKUプロジェクト」への完全移行が近づいています。</p>
        <p class="mt-2">商品ページの商品属性（タグID）の入力率が、検索順位に大きく影響するようになります。特にファッション、インテリア、家電カテゴリの店舗様は、必須項目の入力漏れがないか今一度ご確認ください。</p>
      `,
      impact: 'HIGH',
      link: '#'
    },
    {
      id: 'r3',
      title: '「楽天最強配送」ラベルの付与基準緩和について',
      category: '配送',
      date: '2025-01-28',
      summary: '配送品質基準を満たす商品に表示される「最強配送」ラベルの認定基準が一部変更され、より多くの店舗様が取得しやすくなりました。',
      content: `
        <p>お客様に安心感を与える「楽天最強配送」ラベルの取得要件が見直されました。</p>
        <ul class="list-disc pl-5 mt-2 space-y-1">
            <li>出荷遅延率の許容範囲が緩和されました。</li>
            <li>土日出荷対応が必須条件から推奨条件に変更されました（ただし、土日出荷店舗は検索で優遇されます）。</li>
        </ul>
      `,
      impact: 'MEDIUM',
      link: '#'
    }
  ],
  YAHOO: [
    {
      id: 'y1',
      title: 'Yahoo!ショッピング「超PayPay祭」開催決定',
      category: 'イベント',
      date: '2025-02-10',
      summary: '3月開催の超PayPay祭では、最大25%還元の大型キャンペーンを実施。LINE公式アカウントとの連携強化が鍵となります。',
      content: '...',
      impact: 'HIGH',
      link: '#'
    },
    {
      id: 'y2',
      title: '検索連動型広告「アイテムマッチ」の入札ロジック変更',
      category: '広告',
      date: '2025-01-20',
      summary: 'より費用対効果を高めるため、自動入札機能のアルゴリズムがアップデートされました。',
      content: '...',
      impact: 'MEDIUM',
      link: '#'
    }
  ]
}

export default function MarketResearchPage() {
  const [activeTab, setActiveTab] = useState('news')
  const [selectedMarket, setSelectedMarket] = useState<'AMAZON_JP' | 'RAKUTEN' | 'YAHOO'>('AMAZON_JP')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedNews, setSelectedNews] = useState<any>(null)

  // Category Analysis State
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categoryResult, setCategoryResult] = useState<any>(null)

  // Social Analysis State
  const [socialQuery, setSocialQuery] = useState('')
  const [socialResult, setSocialResult] = useState<any>(null)

  // Profit Analysis State
  const [profitForm, setProfitForm] = useState({
    cost: 1000,
    price: 3980,
    size: 'standard',
  })
  const [profitResult, setProfitResult] = useState<any>(null)

  // Get current market news
  const currentNews = allNews[selectedMarket] || []

  // Mock Handlers
  const handleCategorySearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setCategoryResult({
        marketSize: 'HIGH',
        competition: 'MEDIUM',
        avgPrice: selectedMarket === 'AMAZON_JP' ? 3500 : 3800, // Slightly different price for different markets
        opportunityScore: selectedMarket === 'AMAZON_JP' ? 85 : 78,
        topBrands: ['Anker', 'Elecom', 'Sony'],
        priceDistribution: [15, 45, 25, 10, 5],
        insights: [
          '冬季に需要が急増する傾向があります',
          '「パッケージが可愛い」というレビューが高評価に繋がっています',
          '3,000円〜4,000円の価格帯が最も成約率が高いです',
        ],
      })
      setIsLoading(false)
    }, 1500)
  }

  const handleSocialSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setSocialResult({
        trend: 'UP',
        volume: 12500,
        sentiment: { positive: 65, neutral: 25, negative: 10 },
        hashtags: ['#日本限定', '#新作', '#おすすめ', '#ギフト'],
        contentIdeas: [
          '開封動画で「限定感」を演出する15秒動画',
          'Instagramストーリーズでのカウントダウン',
          'Twitterでのプレゼントキャンペーン',
        ],
      })
      setIsLoading(false)
    }, 1500)
  }

  const handleProfitCalc = async (e: React.FormEvent) => {
    e.preventDefault()
    // Simple calculation logic
    const shipping = profitForm.size === 'large' ? 1000 : profitForm.size === 'small' ? 200 : 500
    // Different fees for different markets
    const feeRate = selectedMarket === 'AMAZON_JP' ? 0.1 : selectedMarket === 'RAKUTEN' ? 0.08 : 0.06
    const platformFee = profitForm.price * feeRate
    
    const profit = profitForm.price - profitForm.cost - shipping - platformFee
    const margin = (profit / profitForm.price) * 100

    setProfitResult({
      profit,
      margin: margin.toFixed(1),
      breakdown: {
        cost: profitForm.cost,
        shipping,
        platformFee,
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header with Market Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
            市場分析 & 成長戦略
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1">
            データとSNSトレンドを活用して、勝ち筋を見つけましょう
          </p>
        </div>
        
        {/* Global Market Selector */}
        <div className="relative">
            <div className="flex items-center gap-2 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg p-1 pr-3 shadow-sm">
                <div className="p-2 bg-anet-50 dark:bg-anet-900/30 rounded text-anet-600 dark:text-anet-400">
                    {selectedMarket === 'AMAZON_JP' && <ShoppingBagIcon className="w-5 h-5" />}
                    {selectedMarket === 'RAKUTEN' && <span className="w-5 h-5 flex items-center justify-center font-bold text-xs">R</span>}
                    {selectedMarket === 'YAHOO' && <span className="w-5 h-5 flex items-center justify-center font-bold text-xs">Y</span>}
                </div>
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">分析対象マーケット</label>
                    <select 
                        value={selectedMarket}
                        onChange={(e) => {
                            setSelectedMarket(e.target.value as any)
                            // Reset results when switching markets
                            setCategoryResult(null)
                            setSocialResult(null)
                            setProfitResult(null)
                        }}
                        className="bg-transparent border-none p-0 text-sm font-bold text-ink-900 dark:text-washi-100 focus:ring-0 cursor-pointer min-w-[140px]"
                    >
                        <option value="AMAZON_JP">Amazon.co.jp</option>
                        <option value="RAKUTEN">楽天市場</option>
                        <option value="YAHOO">Yahoo!ショッピング</option>
                    </select>
                </div>
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 rounded-xl bg-washi-200/50 dark:bg-ink-800/50 p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap min-w-[120px]',
              activeTab === tab.id
                ? 'bg-white dark:bg-ink-700 text-anet-600 dark:text-anet-400 shadow-sm'
                : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-washi-100 hover:bg-white/50 dark:hover:bg-ink-700/50'
            )}
          >
            <tab.icon className="h-5 w-5" />
            {tab.id === 'news' 
                ? (selectedMarket === 'AMAZON_JP' ? 'Amazonニュース' : selectedMarket === 'RAKUTEN' ? '楽天ニュース' : 'Yahoo!ニュース')
                : tab.name}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {/* ==================== News Tab ==================== */}
        {activeTab === 'news' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main News Feed */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
                    <FireIcon className="w-6 h-6 text-orange-500" />
                    {selectedMarket === 'AMAZON_JP' ? 'Amazon 最新情報' : selectedMarket === 'RAKUTEN' ? '楽天 最新情報' : 'Yahoo! 最新情報'}
                  </h2>
                  <span className="text-sm text-ink-500">最終更新: 2025-02-15</span>
                </div>

                {currentNews.length > 0 ? (
                    currentNews.map((news) => (
                    <div 
                        key={news.id} 
                        onClick={() => setSelectedNews(news)}
                        className="card p-6 hover:shadow-md transition-shadow border-l-4 border-l-anet-500 cursor-pointer group"
                    >
                        <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                            <span className={clsx(
                            "px-2 py-1 rounded text-xs font-bold",
                            news.category === '手数料' ? 'bg-red-100 text-red-700' :
                            news.category === 'イベント' ? 'bg-amber-100 text-amber-700' :
                            news.category === '在庫管理' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                            )}>
                            {news.category}
                            </span>
                            <span className="text-sm text-ink-500">{news.date}</span>
                        </div>
                        {news.impact === 'HIGH' && (
                            <span className="flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-full">
                            <ArrowTrendingUpIcon className="w-3 h-3" />
                            重要度: 高
                            </span>
                        )}
                        </div>
                        <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100 mb-2 group-hover:text-anet-600 transition-colors">
                        {news.title}
                        </h3>
                        <p className="text-ink-600 dark:text-ink-300 text-sm leading-relaxed line-clamp-2">
                        {news.summary}
                        </p>
                    </div>
                    ))
                ) : (
                    <div className="card p-8 text-center text-ink-400">
                        <p>現在表示できるニュースはありません。</p>
                    </div>
                )}
              </div>

              {/* Sidebar Widgets */}
              <div className="space-y-6">
                {/* Event Calendar Widget */}
                <div className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-100 dark:border-amber-900">
                  <h3 className="font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center gap-2">
                    <TagIcon className="w-5 h-5" />
                    開催中のイベント
                  </h3>
                  <div className="space-y-3">
                    {selectedMarket === 'AMAZON_JP' ? (
                        <>
                            <div className="bg-white dark:bg-ink-800 p-3 rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
                                <div className="text-xs text-amber-600 font-bold mb-1">2/10 - 2/17</div>
                                <div className="font-medium text-ink-900 dark:text-washi-100">バレンタイン特集</div>
                            </div>
                            <div className="bg-white dark:bg-ink-800 p-3 rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
                                <div className="text-xs text-amber-600 font-bold mb-1">3/1 - 3/5</div>
                                <div className="font-medium text-ink-900 dark:text-washi-100">Amazon 新生活セール</div>
                            </div>
                        </>
                    ) : selectedMarket === 'RAKUTEN' ? (
                        <>
                            <div className="bg-white dark:bg-ink-800 p-3 rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
                                <div className="text-xs text-amber-600 font-bold mb-1">3/4 20:00~</div>
                                <div className="font-medium text-ink-900 dark:text-washi-100">楽天スーパーSALE</div>
                            </div>
                            <div className="bg-white dark:bg-ink-800 p-3 rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
                                <div className="text-xs text-amber-600 font-bold mb-1">毎月5と0のつく日</div>
                                <div className="font-medium text-ink-900 dark:text-washi-100">ポイント5倍デー</div>
                            </div>
                        </>
                    ) : (
                        <div className="text-sm text-ink-500">
                            イベント情報は現在更新中です。
                        </div>
                    )}
                  </div>
                  <button className="w-full mt-4 py-2 text-sm text-amber-700 font-bold hover:bg-amber-100 rounded-lg transition-colors">
                    イベントカレンダーを見る
                  </button>
                </div>

                {/* Quick Stats Widget */}
                <div className="card p-5">
                  <h3 className="font-bold text-ink-900 dark:text-washi-100 mb-4">
                    市場トレンド (今週)
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-600">家電・カメラ</span>
                        <span className="text-green-600 font-bold">↗ +12%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '70%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-600">ホーム＆キッチン</span>
                        <span className="text-red-500 font-bold">↘ -3%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-gray-400 h-2 rounded-full" style={{ width: '45%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ==================== Category Analysis Tab ==================== */}
        {activeTab === 'category' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Search Bar */}
            <div className="card p-6">
              <form onSubmit={handleCategorySearch} className="flex gap-4">
                <div className="flex-1 relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
                  <input
                    type="text"
                    placeholder={`[${selectedMarket === 'AMAZON_JP' ? 'Amazon' : selectedMarket === 'RAKUTEN' ? '楽天' : 'Yahoo'}] カテゴリキーワード または コードを入力`}
                    className="input pl-10"
                    value={categoryQuery}
                    onChange={(e) => setCategoryQuery(e.target.value)}
                  />
                </div>
                {/* 内部选择器已移除，使用全局选择器 */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary flex items-center gap-2 min-w-[120px] justify-center"
                >
                  {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : '分析開始'}
                </button>
              </form>
            </div>

            {/* Results */}
            {categoryResult && (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Score Card */}
                <div className="card p-6 lg:col-span-1 bg-gradient-to-br from-anet-500 to-anet-600 text-white">
                  <div className="flex justify-between items-start mb-2">
                      <h3 className="text-anet-100 font-medium">市場機会スコア</h3>
                      <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                        {selectedMarket === 'AMAZON_JP' ? 'Amazon' : selectedMarket === 'RAKUTEN' ? '楽天' : 'Yahoo'}
                      </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-6xl font-bold">{categoryResult.opportunityScore}</span>
                    <span className="text-xl mb-2 text-anet-200">/ 100</span>
                  </div>
                  <div className="mt-6 space-y-4">
                    <div className="flex justify-between items-center border-b border-white/20 pb-2">
                      <span className="text-anet-100">市場規模</span>
                      <span className="font-bold">{categoryResult.marketSize}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/20 pb-2">
                      <span className="text-anet-100">競合強度</span>
                      <span className="font-bold">{categoryResult.competition}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2">
                      <span className="text-anet-100">平均単価</span>
                      <span className="font-bold">¥{categoryResult.avgPrice.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Charts & Insights */}
                <div className="card p-6 lg:col-span-2 space-y-6">
                  <div>
                    <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-4">
                      AI インサイト
                    </h3>
                    <div className="space-y-3">
                      {categoryResult.insights.map((insight: string, i: number) => (
                        <div key={i} className="flex gap-3 items-start p-3 bg-matcha-50 dark:bg-matcha-900/20 rounded-lg text-sm text-ink-700 dark:text-ink-200">
                          <CheckCircleIcon className="w-5 h-5 text-matcha-500 shrink-0" />
                          {insight}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-4">
                      価格帯分布
                    </h3>
                    <div className="h-48 w-full">
                      <Bar
                        data={{
                          labels: ['~2k', '2k-5k', '5k-10k', '10k-20k', '20k+'],
                          datasets: [
                            {
                              label: '商品数',
                              data: categoryResult.priceDistribution,
                              backgroundColor: 'rgba(229, 72, 113, 0.6)',
                              borderRadius: 4,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            y: { display: false },
                            x: { grid: { display: false } }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ==================== Social Trends Tab ==================== */}
        {activeTab === 'social' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="card p-6">
              <form onSubmit={handleSocialSearch} className="flex gap-4">
                <div className="flex-1 relative">
                  <HashtagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
                  <input
                    type="text"
                    placeholder="分析したいキーワード (例: 桜スイーツ)"
                    className="input pl-10"
                    value={socialQuery}
                    onChange={(e) => setSocialQuery(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-secondary flex items-center gap-2 min-w-[120px] justify-center"
                >
                  {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : 'トレンド分析'}
                </button>
              </form>
            </div>

            {socialResult && (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Trend Overview */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100">
                      トレンド状況
                    </h3>
                    <span className={clsx(
                      'px-3 py-1 rounded-full text-sm font-bold',
                      socialResult.trend === 'UP' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                    )}>
                      {socialResult.trend === 'UP' ? '🔥 急上昇中' : '➡️ 安定'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-washi-50 dark:bg-ink-800 rounded-xl">
                      <p className="text-sm text-ink-500 mb-1">言及ボリューム (直近30日)</p>
                      <p className="text-2xl font-bold text-ink-900 dark:text-washi-100">
                        {socialResult.volume.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 bg-washi-50 dark:bg-ink-800 rounded-xl">
                      <p className="text-sm text-ink-500 mb-1">ポジティブ比率</p>
                      <p className="text-2xl font-bold text-matcha-600">
                        {socialResult.sentiment.positive}%
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-ink-700 dark:text-ink-300 mb-3">
                      関連ハッシュタグ
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {socialResult.hashtags.map((tag: string) => (
                        <span key={tag} className="px-3 py-1 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-full text-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Content Ideas */}
                <div className="card p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
                  <div className="flex items-center gap-2 mb-4">
                    <SparklesIcon className="w-6 h-6 text-indigo-500" />
                    <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-100">
                      コンテンツ提案 (AI)
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {socialResult.contentIdeas.map((idea: string, i: number) => (
                      <div key={i} className="flex gap-3 bg-white dark:bg-ink-800 p-4 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 font-bold text-xs">
                          {i + 1}
                        </div>
                        <p className="text-sm text-ink-700 dark:text-ink-300">{idea}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ==================== Profit Simulator Tab ==================== */}
        {activeTab === 'profit' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid lg:grid-cols-2 gap-6"
          >
            {/* Input Form */}
            <div className="card p-6 h-fit">
              <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-6 flex items-center gap-2">
                <span>商品パラメータ</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">
                    {selectedMarket === 'AMAZON_JP' ? 'Amazon手数料' : selectedMarket === 'RAKUTEN' ? '楽天手数料' : 'Yahoo手数料'}
                </span>
              </h3>
              <form onSubmit={handleProfitCalc} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    仕入れ原価 (¥)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={profitForm.cost}
                    onChange={(e) => setProfitForm({ ...profitForm, cost: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    販売予定価格 (¥)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={profitForm.price}
                    onChange={(e) => setProfitForm({ ...profitForm, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                    サイズ区分 (物流コスト)
                  </label>
                  <select
                    className="input"
                    value={profitForm.size}
                    onChange={(e) => setProfitForm({ ...profitForm, size: e.target.value })}
                  >
                    <option value="small">小型 (メール便/ネコポスなど)</option>
                    <option value="standard">標準 (60-80サイズ)</option>
                    <option value="large">大型 (100サイズ以上)</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary w-full py-3">
                  計算する
                </button>
              </form>
            </div>

            {/* Result Display */}
            <div className="card p-6 flex flex-col justify-center items-center text-center">
              {!profitResult ? (
                <div className="text-ink-400 flex flex-col items-center">
                  <CurrencyYenIcon className="w-16 h-16 mb-4 opacity-20" />
                  <p>左側のフォームを入力して計算してください</p>
                </div>
              ) : (
                <div className="w-full">
                  <h3 className="text-ink-500 mb-2">予想利益 (1個あたり)</h3>
                  <div className={clsx(
                    "text-5xl font-bold mb-2",
                    profitResult.profit > 0 ? "text-matcha-600" : "text-red-500"
                  )}>
                    ¥{profitResult.profit.toLocaleString()}
                  </div>
                  <div className={clsx(
                    "text-lg font-medium mb-8",
                    profitResult.profit > 0 ? "text-matcha-500" : "text-red-400"
                  )}>
                    利益率: {profitResult.margin}%
                  </div>

                  <div className="space-y-3 bg-washi-50 dark:bg-ink-800 p-6 rounded-2xl text-sm">
                    <div className="flex justify-between">
                      <span className="text-ink-500">販売価格</span>
                      <span className="font-bold">¥{profitForm.price.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-px bg-ink-200 dark:bg-ink-700 my-2" />
                    <div className="flex justify-between text-red-500">
                      <span>原価</span>
                      <span>-¥{profitResult.breakdown.cost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-red-500">
                      <span>販売手数料 ({selectedMarket === 'AMAZON_JP' ? '10%' : selectedMarket === 'RAKUTEN' ? '8%' : '6%'})</span>
                      <span>-¥{profitResult.breakdown.platformFee.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-red-500">
                      <span>物流コスト (概算)</span>
                      <span>-¥{profitResult.breakdown.shipping.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Modal Overlay for News Details */}
      <AnimatePresence>
        {selectedNews && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedNews(null)}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-ink-900 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl relative flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-100 dark:border-ink-800 sticky top-0 bg-white dark:bg-ink-900 z-10 flex justify-between items-start">
                <div className="pr-8">
                    <div className="flex items-center gap-3 mb-2">
                        <span className={clsx(
                        "px-2 py-1 rounded text-xs font-bold",
                        selectedNews.category === '手数料' ? 'bg-red-100 text-red-700' :
                        selectedNews.category === 'イベント' ? 'bg-amber-100 text-amber-700' :
                        selectedNews.category === '在庫管理' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                        )}>
                        {selectedNews.category}
                        </span>
                        <span className="text-sm text-ink-500">{selectedNews.date}</span>
                    </div>
                    <h2 className="text-xl font-bold text-ink-900 dark:text-washi-100">
                        {selectedNews.title}
                    </h2>
                </div>
                <button
                    onClick={() => setSelectedNews(null)}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                >
                    <XMarkIcon className="w-6 h-6 text-ink-500" />
                </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 text-ink-700 dark:text-ink-300 leading-relaxed">
                    <div 
                        className="prose dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedNews.content || selectedNews.summary }} 
                    />
                </div>

                {/* Modal Footer */}
                <div className="p-6 border-t border-gray-100 dark:border-ink-800 bg-gray-50 dark:bg-ink-950/50 flex justify-end">
                <button
                    onClick={() => setSelectedNews(null)}
                    className="px-6 py-2 bg-white dark:bg-ink-800 border border-gray-300 dark:border-ink-700 rounded-lg text-ink-700 dark:text-ink-200 hover:bg-gray-50 dark:hover:bg-ink-700 transition-colors font-medium"
                >
                    閉じる
                </button>
                </div>
            </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  )
}
