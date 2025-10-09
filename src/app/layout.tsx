import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navigation } from '@/components/navigation'
import { MarketDataProvider } from '@/components/data/MarketDataProvider'
import { AuthProvider } from '@/components/auth/auth-provider'
import { Toaster } from "@/components/ui/sonner"
import { ThemeScript } from '@/components/theme-script'

// Initialize scheduler on server startup
import '@/lib/init-scheduler'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TenXiv - Paper Trading Tracker',
  description: 'Track your paper trades with IPS integration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <MarketDataProvider>
            <Navigation />
            {children}
            <Toaster />
          </MarketDataProvider>
        </AuthProvider>
      </body>
    </html>
  )
}