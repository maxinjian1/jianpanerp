'use client'

import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

interface FeatureLayoutProps {
  title: string
  subtitle: string
  description: string
  icon: React.ElementType
  color: string
  features: string[]
  children?: React.ReactNode
}

export function FeatureLayout({
  title,
  subtitle,
  description,
  icon: Icon,
  color,
  features,
  children
}: FeatureLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-ink-950">
      <SiteHeader />
      
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="max-w-7xl mx-auto mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br ${color} mb-8 shadow-xl`}>
              <Icon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-ink-900 dark:text-washi-100 mb-6">
              {title}
            </h1>
            <p className="text-xl text-anet-600 dark:text-anet-400 font-medium mb-6">
              {subtitle}
            </p>
            <p className="text-lg text-ink-600 dark:text-ink-300 leading-relaxed">
              {description}
            </p>
          </motion.div>
        </div>

        {/* Content Section */}
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            {/* Left: Features List */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-ink-900 dark:text-washi-100 mb-6">
                主な機能
              </h2>
              <ul className="space-y-4">
                {features.map((item, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 p-4 rounded-xl bg-washi-50 dark:bg-ink-900 border border-washi-200 dark:border-ink-800"
                  >
                    <CheckCircleIcon className="w-6 h-6 text-matcha-500 flex-shrink-0 mt-0.5" />
                    <span className="text-ink-700 dark:text-ink-200 font-medium">
                      {item}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            {/* Right: Interactive Preview / Visual */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-anet-500/20 to-anet-600/20 rounded-3xl blur-3xl" />
              <div className="relative bg-white dark:bg-ink-900 rounded-3xl border border-washi-200 dark:border-ink-800 shadow-2xl overflow-hidden p-6 min-h-[400px] flex items-center justify-center">
                 {children || (
                   <div className="text-center text-ink-400">
                     <Icon className="w-24 h-24 mx-auto mb-4 opacity-20" />
                     <p>Feature Preview</p>
                   </div>
                 )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-4xl mx-auto text-center mt-20">
          <div className="bg-gradient-to-r from-ink-900 to-ink-800 dark:from-washi-100 dark:to-washi-200 rounded-3xl p-12 shadow-2xl">
            <h2 className="text-3xl font-bold text-white dark:text-ink-900 mb-6">
              ビジネスを加速させましょう
            </h2>
            <p className="text-ink-300 dark:text-ink-600 mb-8 text-lg">
              14日間の無料トライアルで、{title}の効果を実感してください。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="btn-primary text-lg px-8 py-4">
                無料で試す
              </Link>
              <Link href="/contact" className="btn-outline border-white text-white hover:bg-white hover:text-ink-900 dark:border-ink-900 dark:text-ink-900 dark:hover:bg-ink-900 dark:hover:text-white text-lg px-8 py-4">
                お問い合わせ
              </Link>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}


