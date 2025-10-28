"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, AlertTriangle, TrendingUp, Award, Lightbulb, BarChart3, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIPostMortemPanelProps {
  tradeId: string
  trade: any
}

export function AIPostMortemPanel({ tradeId, trade }: AIPostMortemPanelProps) {
  const [loading, setLoading] = useState(false)
  const [postmortem, setPostmortem] = useState<any>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadPostMortem()
  }, [tradeId])

  const loadPostMortem = async () => {
    try {
      setLoading(true)

      // Check if postmortem already exists in trade data
      if (trade.postmortem?.postmortem_analysis) {
        setPostmortem(trade.postmortem.postmortem_analysis)
        setLoading(false)
        return
      }

      // Try to fetch from API
      const res = await fetch(`/api/trades/${tradeId}/postmortem`)
      if (res.ok) {
        const data = await res.json()
        setPostmortem(data.data)
      }
    } catch (error) {
      console.error('Failed to load postmortem:', error)
    } finally {
      setLoading(false)
    }
  }

  const generatePostMortem = async () => {
    try {
      setGenerating(true)

      const res = await fetch(`/api/trades/${tradeId}/postmortem`, {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Failed to generate postmortem')
      }

      const data = await res.json()
      setPostmortem(data.data)
    } catch (error) {
      console.error('Failed to generate postmortem:', error)
      alert('Failed to generate AI analysis. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!postmortem) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No AI Analysis Available</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Generate comprehensive AI-powered analysis for this trade
          </p>
          <Button onClick={generatePostMortem} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Analysis...
              </>
            ) : (
              <>
                <Lightbulb className="h-4 w-4 mr-2" />
                Generate AI Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const getAssessmentColor = (assessment: string) => {
    switch (assessment) {
      case 'strong_success':
        return 'bg-green-600'
      case 'success':
        return 'bg-green-500'
      case 'neutral':
        return 'bg-gray-500'
      case 'failure':
        return 'bg-red-500'
      case 'strong_failure':
        return 'bg-red-600'
      default:
        return 'bg-gray-500'
    }
  }

  const getThesisAccuracyColor = (accuracy: string) => {
    switch (accuracy) {
      case 'highly_accurate':
        return 'text-green-600'
      case 'mostly_accurate':
        return 'text-green-500'
      case 'partially_accurate':
        return 'text-yellow-600'
      case 'inaccurate':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Executive Summary
            </CardTitle>
            <Badge className={getAssessmentColor(postmortem.executive_summary?.overall_assessment)}>
              {postmortem.executive_summary?.overall_assessment?.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-lg font-medium">{postmortem.executive_summary?.one_sentence_verdict}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                What Went Right
              </h4>
              <ul className="space-y-1">
                {postmortem.executive_summary?.what_went_right?.map((item: string, index: number) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4" />
                What Went Wrong
              </h4>
              <ul className="space-y-1">
                {postmortem.executive_summary?.what_went_wrong?.map((item: string, index: number) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-red-600 mt-0.5">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Original Thesis Review */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Original Thesis Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <span className="text-sm text-muted-foreground">Original Recommendation: </span>
              <Badge variant="secondary">{postmortem.original_thesis_review?.original_recommendation}</Badge>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Confidence: </span>
              <Badge variant="outline">{postmortem.original_thesis_review?.original_confidence}</Badge>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Thesis Accuracy: </span>
              <span className={cn('font-semibold', getThesisAccuracyColor(postmortem.original_thesis_review?.thesis_accuracy))}>
                {postmortem.original_thesis_review?.thesis_accuracy?.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>

          {postmortem.original_thesis_review?.factors_that_played_out && postmortem.original_thesis_review.factors_that_played_out.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">
                Factors That Played Out
              </h4>
              {postmortem.original_thesis_review.factors_that_played_out.map((factor: any, index: number) => (
                <div key={index} className="p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium mb-1">{factor.factor}</p>
                  <p className="text-xs text-muted-foreground">{factor.how_it_played_out}</p>
                </div>
              ))}
            </div>
          )}

          {postmortem.original_thesis_review?.factors_that_didnt && postmortem.original_thesis_review.factors_that_didnt.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">
                Factors That Didn't Play Out
              </h4>
              {postmortem.original_thesis_review.factors_that_didnt.map((factor: any, index: number) => (
                <div key={index} className="p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium mb-1">{factor.factor}</p>
                  <p className="text-xs text-muted-foreground">{factor.what_actually_happened}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-sm text-muted-foreground">vs Expectations: </span>
            <Badge variant="secondary">{postmortem.performance_analysis?.vs_expectations}</Badge>
          </div>

          {postmortem.performance_analysis?.key_performance_drivers && postmortem.performance_analysis.key_performance_drivers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Key Performance Drivers</h4>
              <ul className="space-y-1">
                {postmortem.performance_analysis.key_performance_drivers.map((driver: string, index: number) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{driver}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {postmortem.performance_analysis?.unexpected_developments && postmortem.performance_analysis.unexpected_developments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Unexpected Developments
              </h4>
              <ul className="space-y-1">
                {postmortem.performance_analysis.unexpected_developments.map((dev: string, index: number) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">!</span>
                    <span>{dev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IPS Factor Retrospective */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            IPS Factor Retrospective
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {postmortem.ips_factor_retrospective?.factors_that_mattered_most && postmortem.ips_factor_retrospective.factors_that_mattered_most.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                Factors That Mattered Most
              </h4>
              {postmortem.ips_factor_retrospective.factors_that_mattered_most.map((factor: any, index: number) => (
                <div key={index} className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium mb-1">{factor.factor}</p>
                  <p className="text-xs text-muted-foreground">{factor.why_it_mattered}</p>
                </div>
              ))}
            </div>
          )}

          {postmortem.ips_factor_retrospective?.missing_factors_identified && postmortem.ips_factor_retrospective.missing_factors_identified.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Missing Factors Identified
              </h4>
              <ul className="space-y-1">
                {postmortem.ips_factor_retrospective.missing_factors_identified.map((factor: string, index: number) => (
                  <li key={index} className="text-sm p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {postmortem.ips_factor_retrospective?.factor_weight_recommendations && postmortem.ips_factor_retrospective.factor_weight_recommendations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Weight Adjustment Recommendations</h4>
              <div className="space-y-2">
                {postmortem.ips_factor_retrospective.factor_weight_recommendations.map((rec: any, index: number) => (
                  <div key={index} className="p-3 bg-muted/50 rounded border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{rec.factor}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{(rec.current_weight * 100).toFixed(0)}%</span>
                        <span>→</span>
                        <span className="font-semibold">{(rec.recommended_weight * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lessons Learned */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Lessons Learned
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {postmortem.lessons_learned?.key_insights && postmortem.lessons_learned.key_insights.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Key Insights</h4>
              <ul className="space-y-2">
                {postmortem.lessons_learned.key_insights.map((insight: string, index: number) => (
                  <li key={index} className="text-sm p-3 bg-primary/5 rounded border border-primary/20">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {postmortem.lessons_learned?.pattern_recognition && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-semibold mb-2">Pattern Recognition</h4>
              <p className="text-sm">{postmortem.lessons_learned.pattern_recognition}</p>
            </div>
          )}

          {postmortem.lessons_learned?.future_recommendations && postmortem.lessons_learned.future_recommendations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Future Recommendations</h4>
              <ul className="space-y-1">
                {postmortem.lessons_learned.future_recommendations.map((rec: string, index: number) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-primary mt-0.5">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decision Quality */}
      {postmortem.decision_quality_vs_outcome && (
        <Card>
          <CardHeader>
            <CardTitle>Decision Quality vs Outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Decision Quality:</span>
              <Badge variant={postmortem.decision_quality_vs_outcome.was_decision_quality_good ? 'default' : 'secondary'}>
                {postmortem.decision_quality_vs_outcome.was_decision_quality_good ? 'Good' : 'Needs Improvement'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Outcome Attribution:</span>
              <Badge variant="outline">
                {postmortem.decision_quality_vs_outcome.was_outcome_lucky_or_skillful?.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Would Make Same Decision Again:</span>
              <Badge variant={postmortem.decision_quality_vs_outcome.would_make_same_decision_again ? 'default' : 'destructive'}>
                {postmortem.decision_quality_vs_outcome.would_make_same_decision_again ? 'Yes' : 'No'}
              </Badge>
            </div>
            {postmortem.decision_quality_vs_outcome.what_would_change && postmortem.decision_quality_vs_outcome.what_would_change.length > 0 && (
              <div className="space-y-1 pt-2">
                <h4 className="text-sm font-semibold">What Would Change:</h4>
                <ul className="space-y-1">
                  {postmortem.decision_quality_vs_outcome.what_would_change.map((change: string, index: number) => (
                    <li key={index} className="text-sm flex items-start gap-2">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Regenerate Button */}
      <div className="flex justify-center pt-4">
        <Button variant="outline" onClick={generatePostMortem} disabled={generating}>
          <RefreshCw className={cn('h-4 w-4 mr-2', generating && 'animate-spin')} />
          Regenerate Analysis
        </Button>
      </div>
    </div>
  )
}
