'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Cog6ToothIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  TruckIcon,
  CreditCardIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const tabs = [
  { id: 'general', name: '基本設定', icon: BuildingOfficeIcon },
  { id: 'integrations', name: '連携設定', icon: GlobeAltIcon },
  { id: 'logistics', name: '物流設定', icon: TruckIcon },
  { id: 'team', name: 'チーム管理', icon: UserGroupIcon },
  { id: 'billing', name: '請求・プラン', icon: CreditCardIcon },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [isLoading, setIsLoading] = useState(false)

  // Mock Data States
  const [generalSettings, setGeneralSettings] = useState({
    companyName: '株式会社サンプル',
    representative: '山田 太郎',
    zipCode: '150-0001',
    address: '東京都渋谷区道玄坂1-2-3',
    phone: '03-1234-5678',
    invoiceNumber: 'T1234567890123',
    timezone: 'Asia/Tokyo',
    language: 'ja',
  })

  const [amazonSettings, setAmazonSettings] = useState({
    enabled: true,
    sellerId: 'A123456789BCDE',
    marketplaceId: 'A1VC38T7YXB528', // Amazon JP
    refreshToken: '********************',
  })

  const [rakutenSettings, setRakutenSettings] = useState({
    enabled: false,
    serviceSecret: '',
    licenseKey: '',
  })

  const [logisticsSettings, setLogisticsSettings] = useState({
    defaultCarrier: 'SAGAWA',
    autoRouting: true,
    timeSlotPriority: 'YAMATO', // 時間指定がある場合はヤマト優先
  })

  const handleSave = async () => {
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      toast.success('設定を保存しました')
    }, 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-washi-100 flex items-center gap-2">
          <Cog6ToothIcon className="w-7 h-7 text-anet-500" />
          設定
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-1">
          テナント全体の設定と外部サービス連携の管理
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 shrink-0">
          <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-anet-50 dark:bg-anet-900/20 text-anet-600 dark:text-anet-400'
                    : 'text-ink-600 dark:text-ink-400 hover:bg-washi-100 dark:hover:bg-ink-800'
                )}
              >
                <tab.icon className={clsx('w-5 h-5', activeTab === tab.id ? 'text-anet-500' : 'text-ink-400')} />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* ==================== General Settings ==================== */}
            {activeTab === 'general' && (
              <div className="card p-6 space-y-6">
                <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100 border-b border-washi-200 dark:border-ink-700 pb-4">
                  会社情報・基本設定
                </h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      会社名 / 屋号
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={generalSettings.companyName}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, companyName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      代表者名
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={generalSettings.representative}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, representative: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      適格請求書発行事業者登録番号 (インボイス制度)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="T1234567890123"
                      value={generalSettings.invoiceNumber}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, invoiceNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      電話番号
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={generalSettings.phone}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, phone: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      住所
                    </label>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        className="input w-32"
                        placeholder="〒"
                        value={generalSettings.zipCode}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, zipCode: e.target.value })}
                      />
                      <input
                        type="text"
                        className="input flex-1"
                        placeholder="住所"
                        value={generalSettings.address}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, address: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-washi-200 dark:border-ink-700 flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="btn-primary min-w-[120px]"
                  >
                    {isLoading ? '保存中...' : '変更を保存'}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== Integrations Settings ==================== */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                {/* Amazon */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-xl">
                        A
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100">Amazon SP-API連携</h3>
                        <p className="text-sm text-ink-500">注文・在庫の自動同期</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={amazonSettings.enabled}
                        onChange={(e) => setAmazonSettings({ ...amazonSettings, enabled: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-anet-300 dark:peer-focus:ring-anet-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-anet-500"></div>
                    </label>
                  </div>

                  {amazonSettings.enabled && (
                    <div className="space-y-4 border-t border-washi-200 dark:border-ink-700 pt-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                            出品者ID (Seller ID)
                          </label>
                          <input
                            type="text"
                            className="input"
                            value={amazonSettings.sellerId}
                            onChange={(e) => setAmazonSettings({ ...amazonSettings, sellerId: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                            リフレッシュトークン
                          </label>
                          <input
                            type="password"
                            className="input"
                            value={amazonSettings.refreshToken}
                            onChange={(e) => setAmazonSettings({ ...amazonSettings, refreshToken: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-matcha-600 bg-matcha-50 dark:bg-matcha-900/20 p-3 rounded-lg">
                        <CheckCircleIcon className="w-5 h-5" />
                        接続確認済み (最終同期: 2024-01-15 14:30)
                      </div>
                    </div>
                  )}
                </div>

                {/* Rakuten */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-xl">
                        R
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100">楽天市場 RMS連携</h3>
                        <p className="text-sm text-ink-500">注文・在庫の自動同期</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={rakutenSettings.enabled}
                        onChange={(e) => setRakutenSettings({ ...rakutenSettings, enabled: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-anet-300 dark:peer-focus:ring-anet-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-anet-500"></div>
                    </label>
                  </div>

                  {rakutenSettings.enabled && (
                    <div className="space-y-4 border-t border-washi-200 dark:border-ink-700 pt-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                            サービスシークレット
                          </label>
                          <input
                            type="password"
                            className="input"
                            value={rakutenSettings.serviceSecret}
                            onChange={(e) => setRakutenSettings({ ...rakutenSettings, serviceSecret: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                            ライセンスキー
                          </label>
                          <input
                            type="password"
                            className="input"
                            value={rakutenSettings.licenseKey}
                            onChange={(e) => setRakutenSettings({ ...rakutenSettings, licenseKey: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="btn-primary min-w-[120px]"
                  >
                    {isLoading ? '保存中...' : '設定を保存'}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== Logistics Settings ==================== */}
            {activeTab === 'logistics' && (
              <div className="card p-6 space-y-6">
                <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100 border-b border-washi-200 dark:border-ink-700 pb-4">
                  物流・配送ルール
                </h3>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      デフォルト配送業者
                    </label>
                    <select
                      className="input"
                      value={logisticsSettings.defaultCarrier}
                      onChange={(e) => setLogisticsSettings({ ...logisticsSettings, defaultCarrier: e.target.value })}
                    >
                      <option value="SAGAWA">佐川急便 (飛脚宅配便)</option>
                      <option value="YAMATO">ヤマト運輸 (宅急便)</option>
                      <option value="JAPAN_POST">日本郵便 (ゆうパック)</option>
                      <option value="FUKUYAMA">福山通運</option>
                    </select>
                    <p className="mt-1 text-xs text-ink-500">
                      ※ 自動ルーティングが無効な場合、この業者が選択されます
                    </p>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-xl">
                    <input
                      type="checkbox"
                      id="autoRouting"
                      className="mt-1 w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                      checked={logisticsSettings.autoRouting}
                      onChange={(e) => setLogisticsSettings({ ...logisticsSettings, autoRouting: e.target.checked })}
                    />
                    <div>
                      <label htmlFor="autoRouting" className="font-bold text-ink-900 dark:text-washi-100">
                        AI自動ルーティングを有効にする
                      </label>
                      <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
                        サイズ、重量、配送地域、時間指定の有無に基づいて、最もコスト効率の良い配送業者を自動的に選択します。
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                      時間帯指定がある場合の優先業者
                    </label>
                    <select
                      className="input"
                      value={logisticsSettings.timeSlotPriority}
                      onChange={(e) => setLogisticsSettings({ ...logisticsSettings, timeSlotPriority: e.target.value })}
                    >
                      <option value="YAMATO">ヤマト運輸 (推奨: 時間帯精度高)</option>
                      <option value="SAGAWA">佐川急便</option>
                      <option value="JAPAN_POST">日本郵便</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-washi-200 dark:border-ink-700 flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="btn-primary min-w-[120px]"
                  >
                    {isLoading ? '保存中...' : 'ルールを保存'}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== Team Settings ==================== */}
            {activeTab === 'team' && (
              <div className="card overflow-hidden">
                <div className="p-6 border-b border-washi-200 dark:border-ink-700 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-ink-900 dark:text-washi-100">
                    チームメンバー
                  </h3>
                  <button className="btn-secondary text-sm py-2 px-4">
                    メンバーを招待
                  </button>
                </div>
                
                <table className="w-full text-left">
                  <thead className="bg-washi-50 dark:bg-ink-800 border-b border-washi-200 dark:border-ink-700">
                    <tr>
                      <th className="px-6 py-4 text-sm font-medium text-ink-500">名前</th>
                      <th className="px-6 py-4 text-sm font-medium text-ink-500">メールアドレス</th>
                      <th className="px-6 py-4 text-sm font-medium text-ink-500">権限</th>
                      <th className="px-6 py-4 text-sm font-medium text-ink-500">ステータス</th>
                      <th className="px-6 py-4 text-sm font-medium text-ink-500 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
                    <tr>
                      <td className="px-6 py-4 font-medium">田中 太郎 (あなた)</td>
                      <td className="px-6 py-4 text-ink-600">tanaka@example.com</td>
                      <td className="px-6 py-4"><span className="badge bg-purple-100 text-purple-700">管理者</span></td>
                      <td className="px-6 py-4"><span className="badge badge-success">有効</span></td>
                      <td className="px-6 py-4 text-right text-ink-400">-</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium">鈴木 一郎</td>
                      <td className="px-6 py-4 text-ink-600">suzuki@example.com</td>
                      <td className="px-6 py-4"><span className="badge bg-blue-100 text-blue-700">マネージャー</span></td>
                      <td className="px-6 py-4"><span className="badge badge-success">有効</span></td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-anet-500 hover:text-anet-600 text-sm">編集</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ==================== Billing Settings ==================== */}
            {activeTab === 'billing' && (
              <div className="space-y-6">
                <div className="card p-6 bg-gradient-to-br from-anet-50 to-anet-100 dark:from-anet-900/20 dark:to-anet-900/10 border-anet-200 dark:border-anet-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100">現在のプラン: STARTER</h3>
                      <p className="text-ink-600 dark:text-ink-300 mt-1">
                        月額 ¥29,800 (税抜)
                      </p>
                      <div className="mt-4 flex items-center gap-2 text-sm text-ink-500">
                        <CheckCircleIcon className="w-4 h-4 text-matcha-500" />
                        次回の請求日: 2024年2月1日
                      </div>
                    </div>
                    <button className="btn-primary text-sm">プラン変更</button>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="font-bold text-lg text-ink-900 dark:text-washi-100 mb-4">
                    請求履歴
                  </h3>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-washi-200 dark:border-ink-700">
                        <th className="py-3 text-sm text-ink-500">日付</th>
                        <th className="py-3 text-sm text-ink-500">内容</th>
                        <th className="py-3 text-sm text-ink-500">金額</th>
                        <th className="py-3 text-sm text-ink-500">ステータス</th>
                        <th className="py-3 text-sm text-ink-500 text-right">領収書</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-washi-100 dark:divide-ink-700">
                      <tr>
                        <td className="py-3">2024/01/01</td>
                        <td className="py-3">STARTER Plan (1月分)</td>
                        <td className="py-3">¥32,780</td>
                        <td className="py-3"><span className="badge badge-success">支払済</span></td>
                        <td className="py-3 text-right text-anet-500 cursor-pointer">PDF</td>
                      </tr>
                      <tr>
                        <td className="py-3">2023/12/01</td>
                        <td className="py-3">STARTER Plan (12月分)</td>
                        <td className="py-3">¥32,780</td>
                        <td className="py-3"><span className="badge badge-success">支払済</span></td>
                        <td className="py-3 text-right text-anet-500 cursor-pointer">PDF</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

