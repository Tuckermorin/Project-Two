import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navigation } from '@/components/navigation'
import { MarketDataProvider } from '@/components/data/MarketDataProvider'
import { Toaster } from "@/components/ui/sonner"
import { SupabaseProvider } from '@/components/providers/supabase-provider'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TenXiv - Paper Trading Tracker',
  description: 'Track your paper trades with IPS integration',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider initialSession={session}>
          <MarketDataProvider>
            <Navigation />
            {children}
            <Toaster />
          </MarketDataProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
