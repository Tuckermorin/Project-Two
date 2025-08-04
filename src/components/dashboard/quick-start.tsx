import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FileText, Eye, TrendingUp } from 'lucide-react'

interface QuickStartProps {
  hasIPS: boolean
  watchlistCount: number
  tradeCount: number
}

export function QuickStart({ 
  hasIPS = false, 
  watchlistCount = 0, 
  tradeCount = 0 
}: QuickStartProps) {
  const steps = [
    {
      title: "1. Create Your IPS",
      description: "Set up your Investment Policy Statement with trading criteria",
      href: "/ips",
      icon: FileText,
      completed: hasIPS,
      buttonText: hasIPS ? "Edit IPS" : "Create IPS"
    },
    {
      title: "2. Build Watchlist",
      description: "Add stocks you want to monitor for trading opportunities",
      href: "/watchlist",
      icon: Eye,
      completed: watchlistCount > 0,
      buttonText: watchlistCount > 0 ? `View ${watchlistCount} stocks` : "Add Stocks"
    },
    {
      title: "3. Start Trading",
      description: "Enter trades and get IPS scoring feedback",
      href: "/trades",
      icon: TrendingUp,
      completed: tradeCount > 0,
      buttonText: tradeCount > 0 ? `View ${tradeCount} trades` : "Enter Trade"
    }
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Start</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="text-center p-4 border rounded-lg">
                <div className="flex justify-center mb-3">
                  <Icon className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{step.description}</p>
                <div className="space-y-2">
                  <Badge variant={step.completed ? "default" : "secondary"}>
                    {step.completed ? "Completed" : "Pending"}
                  </Badge>
                  <div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={step.href}>{step.buttonText}</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        
        {/* Quick Action Buttons */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex gap-3 justify-center">
            <Button asChild size="sm">
              <Link href="/trades">
                <TrendingUp className="h-4 w-4 mr-2" />
                Add New Trade
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/trades">
                <TrendingUp className="h-4 w-4 mr-2" />
                Trading
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}