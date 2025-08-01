"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  BarChart3, 
  FileText, 
  TrendingUp, 
  Eye, 
  BookOpen, 
  History,
  Home
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'IPS Builder', href: '/ips', icon: FileText },
  { name: 'New Trade', href: '/trades', icon: TrendingUp },
  { name: 'Watchlist', href: '/watchlist', icon: Eye },
  { name: 'Journal', href: '/journal', icon: BookOpen },
  { name: 'History', href: '/history', icon: History },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-primary text-primary-foreground shadow-md">
      <div className="container mx-auto flex items-center justify-between h-14 px-4">
        <Link href="/" className="flex items-center font-semibold gap-2">
          <BarChart3 className="h-6 w-6" />
          <span className="hidden sm:inline">TenXiv</span>
        </Link>
        <div className="flex gap-4">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center text-sm font-medium hover:opacity-80',
                  pathname === item.href && 'underline'
                )}
              >
                <Icon className="h-4 w-4 mr-1" />
                <span className="hidden md:inline">{item.name}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}