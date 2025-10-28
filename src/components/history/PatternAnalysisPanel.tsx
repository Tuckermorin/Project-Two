"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Lightbulb,
  TrendingUp,
  Target,
  Calendar,
  BarChart3,
  AlertTriangle,
  Award,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface PatternInsight {
  category: 'delta' | 'iv' | 'dte' | 'sector' | 'timing' | 'ips' | 'risk_management'
  title: string
  description: string
  win_rate?: number
  sample_size: number
  confidence: 'high' | 'medium' | 'low'
  recommendation_type: 'action_required' | 'consider' | 'informational'
  details?: {
    metric?: string
    value?: string | number
    comparison?: string
  }
  filter_params?: any
}

export function PatternAnalysisPanel() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [insights, setInsights] = useState<PatternInsight[]>([])
  const [error, setError] = useState<string | null>(null)
  const [minTrades, setMinTrades] = useState(10)
  const [tradeCount, setTradeCount] = useState(0)

  useEffect(() => {
    loadPatternInsights()
  }, [])

  const loadPatternInsights = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/trades/analysis/patterns')
      if (!res.ok) {
        throw new Error('Failed to load pattern insights')
      }

      const data = await res.json()
      setInsights(data.data?.insights || [])
      setTradeCount(data.data?.total_trades || 0)
    } catch (err: any) {
      console.error('Failed to load pattern insights:', err)
      setError(err.message || 'Failed to load pattern insights')
    } finally {
      setLoading(false)
    }
  }

  const generatePatternInsights = async () => {
    try {
      setGenerating(true)
      setError(null)

      const res = await fetch('/api/trades/analysis/patterns', {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Failed to generate pattern insights')
      }

      const data = await res.json()
      setInsights(data.data?.insights || [])
      setTradeCount(data.data?.total_trades || 0)
    } catch (err: any) {
      console.error('Failed to generate pattern insights:', err)
      setError(err.message || 'Failed to generate pattern insights')
    } finally {
      setGenerating(false)
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'delta':
        return <Target className="h-5 w-5" />
      case 'iv':
        return <TrendingUp className="h-5 w-5" />
      case 'dte':
        return <Calendar className="h-5 w-5" />
      case 'sector':
        return <BarChart3 className="h-5 w-5" />
      case 'ips':
        return <Award className="h-5 w-5" />
      case 'risk_management':
        return <AlertTriangle className="h-5 w-5" />
      default:
        return <Lightbulb className="h-5 w-5" />
    }
  }

  const getRecommendationBadge = (type: string) => {
    switch (type) {
      case 'action_required':
        return <Badge className="bg-red-600">Action Required</Badge>
      case 'consider':
        return <Badge variant="secondary">Consider</Badge>
      default:
        return <Badge variant="outline">Informational</Badge>
    }
  }

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="default">High Confidence</Badge>
      case 'medium':
        return <Badge variant="secondary">Medium Confidence</Badge>
      default:
        return <Badge variant="outline">Low Confidence</Badge>
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-6 w-6" />
            AI Pattern Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (tradeCount < minTrades) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-6 w-6" />
            AI Pattern Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center">
          <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Not Enough Trade History</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You have {tradeCount} closed trade{tradeCount !== 1 ? 's' : ''}. Need at least {minTrades} trades to generate meaningful pattern insights.
          </p>
          <p className="text-xs text-muted-foreground">
            Keep trading and closing positions to unlock AI-powered pattern analysis!
          </p>
        </CardContent>
      </Card>
    )
  }

  const groupedInsights = insights.reduce((acc, insight) => {
    if (!acc[insight.category]) {
      acc[insight.category] = []
    }
    acc[insight.category].push(insight)
    return acc
  }, {} as Record<string, PatternInsight[]>)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-6 w-6" />
              AI Pattern Analysis
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Analyzing {tradeCount} closed trades for actionable patterns
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generatePatternInsights}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Analysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {insights.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No pattern insights available yet</p>
            <Button onClick={generatePatternInsights} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Generate Insights
                </>
              )}
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All Insights ({insights.length})</TabsTrigger>
              <TabsTrigger value="action">
                Action Required ({insights.filter(i => i.recommendation_type === 'action_required').length})
              </TabsTrigger>
              {Object.keys(groupedInsights).map((category) => (
                <TabsTrigger key={category} value={category}>
                  {category.replace(/_/g, ' ').toUpperCase()} ({groupedInsights[category].length})
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {insights.map((insight, index) => (
                <PatternInsightCard key={index} insight={insight} />
              ))}
            </TabsContent>

            <TabsContent value="action" className="space-y-4">
              {insights
                .filter(i => i.recommendation_type === 'action_required')
                .map((insight, index) => (
                  <PatternInsightCard key={index} insight={insight} />
                ))}
            </TabsContent>

            {Object.keys(groupedInsights).map((category) => (
              <TabsContent key={category} value={category} className="space-y-4">
                {groupedInsights[category].map((insight, index) => (
                  <PatternInsightCard key={index} insight={insight} />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

function PatternInsightCard({ insight }: { insight: PatternInsight }) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'delta':
        return <Target className="h-5 w-5" />
      case 'iv':
        return <TrendingUp className="h-5 w-5" />
      case 'dte':
        return <Calendar className="h-5 w-5" />
      case 'sector':
        return <BarChart3 className="h-5 w-5" />
      case 'ips':
        return <Award className="h-5 w-5" />
      case 'risk_management':
        return <AlertTriangle className="h-5 w-5" />
      default:
        return <Lightbulb className="h-5 w-5" />
    }
  }

  const getRecommendationBadge = (type: string) => {
    switch (type) {
      case 'action_required':
        return <Badge className="bg-red-600">Action Required</Badge>
      case 'consider':
        return <Badge className="bg-yellow-600">Consider</Badge>
      default:
        return <Badge variant="outline">Informational</Badge>
    }
  }

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="default">High Confidence</Badge>
      case 'medium':
        return <Badge variant="secondary">Medium Confidence</Badge>
      default:
        return <Badge variant="outline">Low Confidence</Badge>
    }
  }

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'action_required':
        return 'border-red-200 dark:border-red-800'
      case 'consider':
        return 'border-yellow-200 dark:border-yellow-800'
      default:
        return 'border-gray-200 dark:border-gray-800'
    }
  }

  const getBgColor = (type: string) => {
    switch (type) {
      case 'action_required':
        return 'bg-red-50 dark:bg-red-950/20'
      case 'consider':
        return 'bg-yellow-50 dark:bg-yellow-950/20'
      default:
        return 'bg-gray-50 dark:bg-gray-950/20'
    }
  }

  return (
    <div className={cn('p-4 rounded-lg border-2', getBorderColor(insight.recommendation_type), getBgColor(insight.recommendation_type))}>
      <div className="flex items-start gap-4">
        <div className="mt-1">
          {getCategoryIcon(insight.category)}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className="font-semibold text-lg mb-1">{insight.title}</h4>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {insight.category.replace(/_/g, ' ').toUpperCase()}
                </Badge>
                {getRecommendationBadge(insight.recommendation_type)}
                {getConfidenceBadge(insight.confidence)}
              </div>
            </div>
          </div>

          <p className="text-sm mb-3">{insight.description}</p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            {insight.win_rate !== undefined && (
              <div>
                <span>Win Rate: </span>
                <span className={cn(
                  'font-semibold',
                  insight.win_rate >= 70 ? 'text-green-600' :
                  insight.win_rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                )}>
                  {insight.win_rate.toFixed(1)}%
                </span>
              </div>
            )}
            <div>
              <span>Sample Size: </span>
              <span className="font-semibold">{insight.sample_size} trades</span>
            </div>
            {insight.details?.metric && (
              <div>
                <span>{insight.details.metric}: </span>
                <span className="font-semibold">{insight.details.value}</span>
              </div>
            )}
          </div>

          {insight.details?.comparison && (
            <div className="p-2 bg-white dark:bg-gray-900 rounded border text-xs mb-3">
              {insight.details.comparison}
            </div>
          )}

          {insight.filter_params && (
            <div className="flex justify-end">
              <Link href={`/history?${new URLSearchParams(insight.filter_params).toString()}`}>
                <Button variant="ghost" size="sm" className="text-xs">
                  View Related Trades
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
