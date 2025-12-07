'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // TODO: Implement actual API call
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('tenantId', data.user.tenantId)
        toast.success('ログインしました')
        router.push('/dashboard')
      } else {
        toast.error('メールアドレスまたはパスワードが正しくありません')
      }
    } catch (error) {
      toast.error('ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen pattern-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="card p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-anet-400 to-anet-600 flex items-center justify-center">
                <span className="text-white font-bold text-xl">雲</span>
              </div>
              <span className="font-bold text-2xl text-ink-900 dark:text-washi-100">
                Japan ERP
              </span>
            </Link>
            <p className="mt-4 text-ink-500 dark:text-ink-400">
              アカウントにログイン
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                メールアドレス
              </label>
              <input
                type="email"
                required
                className="input"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                パスワード
              </label>
              <input
                type="password"
                required
                className="input"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                />
                <span className="text-sm text-ink-600 dark:text-ink-400">
                  ログイン状態を保持
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-anet-500 hover:text-anet-600"
              >
                パスワードを忘れた?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'ログイン'
              )}
            </button>
          </form>

          {/* Register link */}
          <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
            アカウントをお持ちでないですか?{' '}
            <Link href="/register" className="text-anet-500 hover:text-anet-600 font-medium">
              無料で登録
            </Link>
          </p>
        </div>

        {/* Demo credentials */}
        <div className="mt-6 card p-4 bg-matcha-50 dark:bg-matcha-900/20 border-matcha-200 dark:border-matcha-800">
          <p className="text-sm text-matcha-700 dark:text-matcha-400 text-center">
            <strong>デモ用アカウント:</strong>
            <br />
            demo@japan-erp.com / demo1234
          </p>
        </div>
      </motion.div>
    </div>
  )
}

