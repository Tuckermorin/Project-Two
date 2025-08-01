import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { cn } from '@/lib/utils'
import './globals.css'
import { Navigation } from '@/components/navigation'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700']
})

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
    <html lang="en" className="dark">
      <body className={cn(roboto.className, 'bg-background text-foreground')}>
        <Navigation />
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}