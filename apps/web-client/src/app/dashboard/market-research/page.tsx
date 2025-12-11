'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
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
  { id: 'amazon-news', name: 'Amazonニュース', icon: NewspaperIcon },
  { id: 'category', name: 'カテゴリ分析', icon: ChartBarIcon },
  { id: 'social', name: 'SNSトレンド', icon: HashtagIcon },
  { id: 'profit', name: '利益シミュレーション', icon: CurrencyYenIcon },
]

export default function MarketResearchPage() {
  const [activeTab, setActiveTab] = useState('amazon-news')
  const [isLoading, setIsLoading] = useState(false)

  // Amazon News Data (Mock)
  const amazonNews = [
    {
      id: 1,
      title: '【重要】2025年FBA配送代行手数料の改定について',
      category: '手数料',
      date: '2025-01-15',
      summary: '2025年4月1日より、FBA配送代行手数料が改定されます。特に大型商品の手数料が見直され、より柔軟なサイズ区分が導入される予定です。',
      impact: 'HIGH',
      link: '#'
    },
    {
      id: 2,
      title: 'Amazonプライムデー2025のエントリー受付開始',
      category: 'イベント',
      date: '2025-02-01',
      summary: '今年のプライムデーに向けたLightning DealsおよびPrime Exclusive Discountsのエントリー受付が開始されました。締め切りは3月31日までです。',
      impact: 'MEDIUM',
      link: '#'
    },
    {
      id: 3,
      title: '商品紹介コンテンツ(A+)に新モジュール追加',
      category: '機能更新',
      date: '2025-02-10',
      summary: 'プレミアムA+コンテンツに、比較表の新しいデザインと、動画を埋め込めるカルーセルモジュールが追加されました。',
      impact: 'LOW',
      link: '#'
    },
    {
      id: 4,
      title: '「在庫パフォーマンス指標(IPI)」の閾値変更のお知らせ',
      category: '在庫管理',
      date: '2025-02-12',
      summary: '在庫保管制限の基準となるIPIスコアの閾値が400から450に変更されます。スコアが低いセラーは保管制限の対象となる可能性があります。',
      impact: 'HIGH',
      link: '#'
    },
    {
      id: 5,
      title: 'ブランド登録セラー向け：新広告分析ツールの提供開始',
      category: '広告',
      date: '2025-02-14',
      summary: 'Amazon Marketing Cloud (AMC) の簡易版ダッシュボードがセラーセントラルに追加され、購買経路の分析が容易になりました。',
      impact: 'MEDIUM',
      link: '#'
    }
  ]

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

  // Mock Handlers
  const handleCategorySearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setCategoryResult({
        marketSize: 'HIGH',
        competition: 'MEDIUM',
        avgPrice: 3500,
        opportunityScore: 85,
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
    const platformFee = profitForm.price * 0.1
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100">
          市場分析 & 成長戦略
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-1">
          データとSNSトレンドを活用して、勝ち筋を見つけましょう
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 rounded-xl bg-washi-200/50 dark:bg-ink-800/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-white dark:bg-ink-700 text-anet-600 dark:text-anet-400 shadow-sm'
                : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-washi-100 hover:bg-white/50 dark:hover:bg-ink-700/50'
            )}
          >
            <tab.icon className="h-5 w-5" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {/* ==================== Amazon News Tab ==================== */}
        {activeTab === 'amazon-news' && (
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
                    最新ニュース & 重要なお知らせ
                  </h2>
                  <span className="text-sm text-ink-500">最終更新: 2025-02-15</span>
                </div>

                {amazonNews.map((news) => (
                  <div key={news.id} className="card p-6 hover:shadow-md transition-shadow border-l-4 border-l-anet-500">
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
                    <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100 mb-2">
                      <a href={news.link} className="hover:text-anet-600 transition-colors">
                        {news.title}
                      </a>
                    </h3>
                    <p className="text-ink-600 dark:text-ink-300 text-sm leading-relaxed">
                      {news.summary}
                    </p>
                  </div>
                ))}
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
                    <div className="bg-white dark:bg-ink-800 p-3 rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
                      <div className="text-xs text-amber-600 font-bold mb-1">2/10 - 2/17</div>
                      <div className="font-medium text-ink-900 dark:text-washi-100">バレンタイン特集</div>
                    </div>
                    <div className="bg-white dark:bg-ink-800 p-3 rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
                      <div className="text-xs text-amber-600 font-bold mb-1">3/1 - 3/5</div>
                      <div className="font-medium text-ink-900 dark:text-washi-100">Amazon 新生活セール</div>
                    </div>
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
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-600">ファッション</span>
                        <span className="text-green-600 font-bold">↗ +8%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '60%' }}></div>
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
                    placeholder="カテゴリキーワード または ASINを入力 (例: ワイヤレスイヤホン)"
                    className="input pl-10"
                    value={categoryQuery}
                    onChange={(e) => setCategoryQuery(e.target.value)}
                  />
                </div>
                <select className="input w-48">
                  <option value="AMAZON_JP">Amazon.co.jp</option>
                  <option value="RAKUTEN">楽天市場</option>
                </select>
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
                  <h3 className="text-anet-100 font-medium mb-2">市場機会スコア</h3>
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
              <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-6">
                商品パラメータ
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
                      <span>販売手数料 (10%)</span>
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
    </div>
  )
}

