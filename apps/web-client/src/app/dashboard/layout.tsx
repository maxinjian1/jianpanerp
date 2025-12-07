'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HomeIcon,
  ShoppingCartIcon,
  CubeIcon,
  TruckIcon,
  ChartBarIcon,
  SparklesIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const navigation = [
  { name: 'ダッシュボード', href: '/dashboard', icon: HomeIcon },
  { name: '受注管理', href: '/dashboard/orders', icon: ShoppingCartIcon },
  { name: '商品管理', href: '/dashboard/products', icon: CubeIcon },
  { name: '市場分析', href: '/dashboard/market-research', icon: ChartBarIcon },
  { name: '在庫管理', href: '/dashboard/inventory', icon: CubeIcon },
  { name: '物流・出荷', href: '/dashboard/logistics', icon: TruckIcon },
  { name: 'AI分析', href: '/dashboard/ai', icon: SparklesIcon },
  { name: 'レポート', href: '/dashboard/reports', icon: ChartBarIcon },
  { name: '設定', href: '/dashboard/settings', icon: Cog6ToothIcon },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-washi-50 dark:bg-ink-950">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink-900/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-72 bg-white dark:bg-ink-900 border-r border-washi-200 dark:border-ink-700 transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-washi-200 dark:border-ink-700">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-anet-400 to-anet-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">雲</span>
            </div>
            <span className="font-bold text-xl text-ink-900 dark:text-washi-100">
              Japan ERP
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-washi-100 dark:hover:bg-ink-800"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-anet-50 dark:bg-anet-900/20 text-anet-600 dark:text-anet-400'
                    : 'text-ink-600 dark:text-ink-400 hover:bg-washi-100 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-washi-100'
                )}
              >
                <item.icon className={clsx('w-5 h-5', isActive && 'text-anet-500')} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Upgrade banner */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="bg-gradient-to-br from-anet-500 to-anet-600 rounded-2xl p-4 text-white">
            <h4 className="font-bold mb-1">プランをアップグレード</h4>
            <p className="text-sm text-anet-100 mb-3">
              AIの全機能を解放しましょう
            </p>
            <button className="w-full bg-white text-anet-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-anet-50 transition-colors">
              プラン詳細
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top header */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-ink-900/80 backdrop-blur-lg border-b border-washi-200 dark:border-ink-700">
          <div className="h-full px-4 flex items-center justify-between gap-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-washi-100 dark:hover:bg-ink-800"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            {/* Search */}
            <div className="flex-1 max-w-xl">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
                <input
                  type="text"
                  placeholder="注文番号、SKU、顧客名で検索..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-washi-100 dark:bg-ink-800 border border-transparent focus:border-anet-400 focus:bg-white dark:focus:bg-ink-900 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Notifications */}
              <button className="relative p-2 rounded-xl hover:bg-washi-100 dark:hover:bg-ink-800 transition-colors">
                <BellIcon className="w-6 h-6 text-ink-600 dark:text-ink-400" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-anet-500 rounded-full" />
              </button>

              {/* User menu */}
              <div className="flex items-center gap-3 pl-3 border-l border-washi-200 dark:border-ink-700">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-matcha-400 to-matcha-600 flex items-center justify-center">
                  <span className="text-white font-bold">田</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-ink-900 dark:text-washi-100">田中太郎</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">管理者</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}

