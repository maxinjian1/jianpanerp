'use client'

import Link from 'next/link'
import Image from 'next/image'

export function SiteHeader() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-ink-950/80 backdrop-blur-lg border-b border-washi-200 dark:border-ink-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-3">
            {/* Logo Image */}
            <div className="relative h-8 w-auto aspect-[4/1] min-w-[120px]">
              <Image
                src="/images/anet-logo.png"
                alt="ANET Logo"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
            <span className="hidden sm:block w-px h-6 bg-ink-200 dark:bg-ink-700 mx-1"></span>
            <span className="font-bold text-lg text-ink-900 dark:text-washi-100 hidden sm:block">
              Japan ERP
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-ink-600 dark:text-ink-300 hover:text-anet-500 transition-colors">
              機能
            </Link>
            <Link href="/pricing" className="text-ink-600 dark:text-ink-300 hover:text-anet-500 transition-colors">
              料金
            </Link>
            <Link href="/contact" className="text-ink-600 dark:text-ink-300 hover:text-anet-500 transition-colors">
              お問い合わせ
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-ink-600 dark:text-ink-300 hover:text-anet-500 transition-colors">
              ログイン
            </Link>
            <Link href="/register" className="btn-primary text-sm">
              無料で始める
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

