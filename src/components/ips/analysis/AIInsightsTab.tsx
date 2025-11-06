"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Lightbulb, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface AIInsightsTabProps {
  ipsId: string
  ipsName: string
}

export function AIInsightsTab({ ipsId, ipsName }: AIInsightsTabProps) {
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAnalysis = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/ips/${ipsId}/analysis`)
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || errorData.error || 'Failed to load analysis')
      }

      const data = await res.json()
      setAnalysis(data.data)
    } catch (err: any) {
      console.error('Error loading AI analysis:', err)
      setError(err.message || 'Failed to load AI analysis')
      toast.error(err.message || 'Failed to load AI analysis')
    } finally {
      setLoading(false)
    }
  }

  if (!analysis && !loading && !error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">AI Analysis Available</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Generate comprehensive AI-powered insights for {ipsName}
          </p>
          <Button onClick={loadAnalysis}>
            <Lightbulb className="h-4 w-4 mr-2" />
            Generate AI Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Analyzing IPS performance with AI...</p>
          <p className="text-xs text-muted-foreground mt-2">This may take 10-30 seconds</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-lg font-semibold mb-2">Analysis Error</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={loadAnalysis} variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!analysis) return null

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'configuration':
        return <Settings className="h-5 w-5" />
      case 'timing':
        return <TrendingUp className="h-5 w-5" />
      case 'risk':
        return <AlertTriangle className="h-5 w-5" />
      default:
        return <Lightbulb className="h-5 w-5" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200'
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{analysis.analysis.executiveSummary}</p>
          <div className="mt-4 flex items-center justify-between">
            <Button onClick={loadAnalysis} variant="outline" size="sm">
              Refresh Analysis
            </Button>
            <p className="text-xs text-muted-foreground">
              Generated: {new Date(analysis.metadata.generatedAt).toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Win Rate</p>
              <p className="text-2xl font-bold text-green-600">
                {analysis.analysis.metrics.currentWinRate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average ROI</p>
              <p className="text-2xl font-bold">
                {analysis.analysis.metrics.avgROI.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <p className="text-2xl font-bold">
                {analysis.analysis.metrics.totalTrades}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Days Held</p>
              <p className="text-2xl font-bold">
                {analysis.analysis.metrics.avgDaysHeld.toFixed(1)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.analysis.strengths.map((strength: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />
                  <span className="text-sm">{strength}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.analysis.weaknesses.map((weakness: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-red-600 flex-shrink-0" />
                  <span className="text-sm">{weakness}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analysis.analysis.recommendations.map((rec: any, idx: number) => (
              <div key={idx} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(rec.category)}
                    <h4 className="font-semibold">{rec.title}</h4>
                  </div>
                  <Badge className={getPriorityColor(rec.priority)}>
                    {rec.priority.toUpperCase()} PRIORITY
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Category: {rec.category.replace('_', ' ').toUpperCase()}
                </p>
                <p className="text-sm">{rec.description}</p>
                {rec.actionable && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Actionable
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Expected Improvements */}
      {analysis.analysis.expectedImprovement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Expected Improvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.analysis.expectedImprovement.winRateIncrease && (
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate Increase</p>
                  <p className="text-2xl font-bold text-green-600">
                    +{analysis.analysis.expectedImprovement.winRateIncrease.toFixed(1)}%
                  </p>
                </div>
              )}
              {analysis.analysis.expectedImprovement.roiIncrease && (
                <div>
                  <p className="text-sm text-muted-foreground">ROI Increase</p>
                  <p className="text-2xl font-bold text-green-600">
                    +{analysis.analysis.expectedImprovement.roiIncrease.toFixed(2)}%
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

function Settings({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
