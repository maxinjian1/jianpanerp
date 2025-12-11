'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    companyName: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('パスワードが一致しません')
      return
    }

    if (!formData.agreeTerms) {
      toast.error('利用規約に同意してください')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName: formData.companyName,
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('tenantId', data.user.tenantId)
        toast.success('アカウントを作成しました')
        // Force reload to ensure all components pick up the new tenantId
        window.location.href = '/dashboard'
      } else {
        const errorData = await response.json()
        toast.error(errorData.message || '登録に失敗しました')
      }
    } catch (error) {
      toast.error('サーバーエラーが発生しました')
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
              新規アカウント登録（14日間無料）
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                会社名
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="株式会社サンプル"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                担当者名
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="山田 太郎"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

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
                minLength={8}
                className="input"
                autoComplete="new-password"
                placeholder="8文字以上"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">
                パスワード（確認）
              </label>
              <input
                type="password"
                required
                className="input"
                placeholder="パスワードを再入力"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                required
                id="terms"
                className="mt-1 w-4 h-4 rounded border-ink-300 text-anet-500 focus:ring-anet-500"
                checked={formData.agreeTerms}
                onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
              />
              <label htmlFor="terms" className="text-sm text-ink-600 dark:text-ink-400">
                <Link href="/terms" className="text-anet-500 hover:text-anet-600">利用規約</Link>
                と
                <Link href="/privacy" className="text-anet-500 hover:text-anet-600">プライバシーポリシー</Link>
                に同意します
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'アカウントを作成'
              )}
            </button>
          </form>

          {/* Login link */}
          <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
            すでにアカウントをお持ちですか?{' '}
            <Link href="/login" className="text-anet-500 hover:text-anet-600 font-medium">
              ログイン
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

