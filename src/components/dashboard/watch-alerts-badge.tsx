// src/components/dashboard/watch-alerts-badge.tsx
"use client"

import { Badge } from '@/components/ui/badge'
import { Eye, AlertTriangle } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { WatchAlert } from '@/lib/utils/watch-criteria-evaluator'

interface WatchAlertsBadgeProps {
  alerts: WatchAlert[]
  size?: 'sm' | 'md' | 'lg'
}

export function WatchAlertsBadge({ alerts, size = 'md' }: WatchAlertsBadgeProps) {
  const triggeredAlerts = alerts.filter(a => a.triggered)

  if (triggeredAlerts.length === 0) {
    return null
  }

  const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
  const badgeSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="destructive"
          className={`cursor-pointer hover:bg-red-700 ${badgeSize}`}
        >
          <AlertTriangle className={`${iconSize} mr-1`} />
          {triggeredAlerts.length} Alert{triggeredAlerts.length > 1 ? 's' : ''}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Eye className="h-4 w-4" />
            Watch Criteria Alerts
          </div>
          <div className="space-y-2">
            {triggeredAlerts.map((alert, idx) => (
              <div
                key={alert.ruleId}
                className="border-l-4 border-red-500 bg-red-50 p-3 rounded"
              >
                <div className="text-sm font-medium text-red-900">
                  {alert.description}
                </div>
                <div className="text-xs text-red-700 mt-1">
                  Current: {formatValue(alert.currentValue, alert.type)} |
                  Threshold: {formatValue(alert.threshold, alert.type)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatValue(value: number, type: string): string {
  if (type === 'percentage') {
    return `${value.toFixed(2)}%`
  }
  if (type === 'price') {
    return `$${value.toFixed(2)}`
  }
  return value.toFixed(2)
}
