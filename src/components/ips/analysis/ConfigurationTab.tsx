"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings, Calendar, Target, TrendingUp } from 'lucide-react'

interface ConfigurationTabProps {
  ipsData: {
    id: string
    name: string
    description?: string
    min_dte?: number
    max_dte?: number
    strategies: string[]
    factors: any[]
    exit_strategies?: any
    ai_weight?: number
  }
}

export function ConfigurationTab({ ipsData }: ConfigurationTabProps) {
  const enabledFactors = ipsData.factors.filter(f => f.enabled !== false)

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="text-lg font-semibold">{ipsData.name}</p>
          </div>
          {ipsData.description && (
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-base">{ipsData.description}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Trading Strategies</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {ipsData.strategies.map((strategy, idx) => (
                  <Badge key={idx} variant="secondary">
                    {strategy.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">AI Weight</p>
              <p className="text-lg font-semibold">{ipsData.ai_weight || 20}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Days to Expiration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Days to Expiration Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Minimum Days to Expiration</p>
              <p className="text-2xl font-bold">{ipsData.min_dte || 'Not set'} days</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Maximum Days to Expiration</p>
              <p className="text-2xl font-bold">{ipsData.max_dte || 'Not set'} days</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Factors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Trading Factors ({enabledFactors.length} enabled)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {enabledFactors.map((factor, idx) => (
              <div
                key={idx}
                className="p-4 bg-muted/50 rounded-lg border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-semibold">{factor.factor_name || factor.name || 'Unnamed Factor'}</p>
                      <Badge variant="outline" className="text-xs">
                        Weight: {factor.weight}
                      </Badge>
                    </div>
                    {factor.target_value !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        Target: {factor.target_operator || ''} {factor.target_value}
                      </p>
                    )}
                    {factor.preference_direction && (
                      <p className="text-sm text-muted-foreground">
                        Preference: {factor.preference_direction}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exit Strategies */}
      {ipsData.exit_strategies && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Exit Strategies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ipsData.exit_strategies.profit && (
                <div>
                  <p className="font-semibold text-green-600">Profit Target</p>
                  <p className="text-sm">
                    {ipsData.exit_strategies.profit.enabled
                      ? `Exit at ${ipsData.exit_strategies.profit.target || '50'}% profit`
                      : 'Disabled'}
                  </p>
                </div>
              )}
              {ipsData.exit_strategies.loss && (
                <div>
                  <p className="font-semibold text-red-600">Stop Loss</p>
                  <p className="text-sm">
                    {ipsData.exit_strategies.loss.enabled
                      ? `Exit at ${ipsData.exit_strategies.loss.target || '200'}% loss`
                      : 'Disabled'}
                  </p>
                </div>
              )}
              {ipsData.exit_strategies.time && (
                <div>
                  <p className="font-semibold text-blue-600">Time-based</p>
                  <p className="text-sm">
                    {ipsData.exit_strategies.time.enabled
                      ? `Exit at ${ipsData.exit_strategies.time.dte || '7'} Days to Expiration`
                      : 'Disabled'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
