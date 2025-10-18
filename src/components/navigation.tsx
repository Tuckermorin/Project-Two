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
  Home,
  UserCircle,
  LogOut,
  Sun,
  Moon,
  Target
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { useTheme } from '@/hooks/use-theme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'IPS Builder', href: '/ips', icon: FileText },
  { name: 'Trades', href: '/trades', icon: TrendingUp },
  { name: 'Watchlist', href: '/watchlist', icon: Eye },
  { name: 'Journal', href: '/journal', icon: BookOpen },
  { name: 'Audit', href: '/audit', icon: Target },
  { name: 'History', href: '/history', icon: History },
]

export function Navigation() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { isDarkMode, toggleTheme } = useTheme()

  // Hide navigation on auth pages
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  if (isAuthPage) {
    return null
  }

  return (
    <nav className="mb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="flex justify-between h-16 items-center"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: '20px',
            border: '1px solid var(--glass-border)',
            padding: '0 20px',
            marginTop: '20px'
          }}
        >
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <BarChart3 className="h-8 w-8" style={{ color: 'var(--gradient-primary-start)' }} />
              <span className="ml-2 text-xl font-bold gradient-text-primary">TenXiv</span>
            </div>
            {/* Only show navigation links when user is authenticated */}
            {user && (
              <div className="hidden sm:ml-4 sm:flex sm:space-x-0.5">
                {navigation.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'inline-flex items-center px-2.5 py-2 text-xs font-medium rounded-lg transition-all',
                        pathname === item.href
                          ? 'bg-[var(--glass-bg-hover)] border-b-2 border-[var(--gradient-primary-start)]'
                          : 'hover:bg-[var(--glass-bg)]'
                      )}
                      style={{
                        color: pathname === item.href ? 'var(--text-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="inline-flex items-center justify-center p-2 rounded-lg transition-all"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)'
              }}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-1.5 px-2.5 text-xs">
                    <UserCircle className="h-4 w-4" />
                    <span className="max-w-[120px] truncate">{user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-card">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="cursor-pointer">
                      <UserCircle className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer" style={{ color: 'var(--text-negative)' }}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg)',
                    color: 'var(--text-primary)'
                  }}
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all gradient-bg-primary shadow-md hover:shadow-lg"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
