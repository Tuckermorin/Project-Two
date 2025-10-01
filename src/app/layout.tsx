import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navigation } from '@/components/navigation'
import { MarketDataProvider } from '@/components/data/MarketDataProvider'
import { AuthProvider } from '@/components/auth/auth-provider'
import { Toaster } from "@/components/ui/sonner"

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
    <html lang="en">
      <body className={inter.className}>
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