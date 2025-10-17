// src/components/ips/ips-dte-config.tsx
"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Calendar, AlertCircle, Info } from 'lucide-react'

export interface DTEConfig {
  min_dte: number
  max_dte: number
}

interface IPSDTEConfigProps {
  minDTE?: number
  maxDTE?: number
  onChange: (config: DTEConfig) => void
}

export function IPSDTEConfig({
  minDTE: initialMinDTE,
  maxDTE: initialMaxDTE,
  onChange
}: IPSDTEConfigProps) {
  const [minDTE, setMinDTE] = useState<number | ''>(initialMinDTE ?? '')
  const [maxDTE, setMaxDTE] = useState<number | ''>(initialMaxDTE ?? '')

  // Update state when props change (for editing existing IPS)
  useEffect(() => {
    if (initialMinDTE !== undefined) {
      setMinDTE(initialMinDTE)
    }
  }, [initialMinDTE])

  useEffect(() => {
    if (initialMaxDTE !== undefined) {
      setMaxDTE(initialMaxDTE)
    }
  }, [initialMaxDTE])

  // Notify parent of changes (no validation here, validation happens at submit)
  useEffect(() => {
    // Only notify if both values are numbers and valid
    const minNum = typeof minDTE === 'number' ? minDTE : parseInt(String(minDTE))
    const maxNum = typeof maxDTE === 'number' ? maxDTE : parseInt(String(maxDTE))

    if (!isNaN(minNum) && !isNaN(maxNum) && minNum >= 1 && maxNum >= minNum && maxNum <= 365) {
      onChange({ min_dte: minNum, max_dte: maxNum })
    }
  }, [minDTE, maxDTE])

  const handleMinChange = (value: string) => {
    if (value === '') {
      setMinDTE('')
    } else {
      const num = parseInt(value)
      if (!isNaN(num)) {
        setMinDTE(num)
      }
    }
  }

  const handleMaxChange = (value: string) => {
    if (value === '') {
      setMaxDTE('')
    } else {
      const num = parseInt(value)
      if (!isNaN(num)) {
        setMaxDTE(num)
      }
    }
  }

  // Validation helpers for display only
  const getValidationError = () => {
    // Don't show errors if fields are empty
    if (minDTE === '' || maxDTE === '') {
      return null
    }

    const minNum = typeof minDTE === 'number' ? minDTE : parseInt(String(minDTE))
    const maxNum = typeof maxDTE === 'number' ? maxDTE : parseInt(String(maxDTE))

    if (minNum < 1) {
      return 'Minimum DTE must be at least 1 day'
    }
    if (maxNum < minNum) {
      return 'Maximum DTE must be greater than or equal to Minimum DTE'
    }
    if (maxNum > 365) {
      return 'Maximum DTE cannot exceed 365 days'
    }
    return null
  }

  const error = getValidationError()

  const getPresetLabel = () => {
    if (minDTE === '' || maxDTE === '') return 'Not configured'
    const minNum = typeof minDTE === 'number' ? minDTE : parseInt(String(minDTE))
    const maxNum = typeof maxDTE === 'number' ? maxDTE : parseInt(String(maxDTE))
    if (minNum >= 7 && maxNum <= 14) return 'Weekly Options'
    if (minNum >= 30 && maxNum <= 45) return 'Monthly Options'
    if (minNum >= 14 && maxNum <= 30) return 'Mid-Range'
    return 'Custom Range'
  }

  const getDisplayRange = () => {
    if (minDTE === '' && maxDTE === '') return 'not set'
    if (minDTE === '') return `? - ${maxDTE}`
    if (maxDTE === '') return `${minDTE} - ?`
    return `${minDTE}-${maxDTE}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Days to Expiration (DTE) Window
        </CardTitle>
        <CardDescription>
          Define the acceptable range of days until option expiration. Only options within this window will be considered for trading.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            This is a <strong>hard requirement</strong> - the AI will only consider options contracts expiring within your specified DTE window.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="min-dte" className="text-base font-semibold">
              Minimum DTE
            </Label>
            <Input
              id="min-dte"
              type="number"
              value={minDTE}
              onChange={(e) => handleMinChange(e.target.value)}
              placeholder="e.g., 7"
              className=""
            />
            <p className="text-sm text-gray-500">
              Minimum days until expiration
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-dte" className="text-base font-semibold">
              Maximum DTE
            </Label>
            <Input
              id="max-dte"
              type="number"
              value={maxDTE}
              onChange={(e) => handleMaxChange(e.target.value)}
              placeholder="e.g., 45"
              className=""
            />
            <p className="text-sm text-gray-500">
              Maximum days until expiration
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="space-y-2">
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                Current Configuration: {getPresetLabel()}
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Options expiring in {getDisplayRange()} days will be considered
              </p>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1 mt-2">
                <p><strong>Common Presets:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Weekly: 7-14 days (higher theta decay, more frequent management)</li>
                  <li>Mid-Range: 14-30 days (balanced approach)</li>
                  <li>Monthly: 30-45 days (standard 30-45 DTE strategy)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
