import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-jp',
})

export const metadata: Metadata = {
  title: 'Japan Omni-EC ERP | AI駆動型ECプラットフォーム',
  description: '次世代のAI駆動型SaaS ERPで、マルチチャネル受注管理、スマート倉庫管理、B2B/B2C物流を統合',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="font-sans antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1a1b1e',
              color: '#fff',
              borderRadius: '12px',
            },
          }}
        />
      </body>
    </html>
  )
}

