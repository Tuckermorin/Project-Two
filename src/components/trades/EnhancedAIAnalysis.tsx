"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Info,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Target,
  Eye,
  Clock,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  Brain,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StructuredRationale {
  summary?: {
    recommendation: string;
    confidence_level: string;
    one_sentence_thesis: string;
    key_strengths: string[];
    key_concerns: string[];
  };
  analysis?: {
    ips_analysis?: {
      overall_score: number;
      passing_factors: Array<{
        factor: string;
        value: any;
        why_positive: string;
      }>;
      failing_factors: Array<{
        factor: string;
        value: any;
        impact: string;
        recommendation: string;
      }>;
    };
    market_context?: {
      sentiment_summary: string;
      news_catalyst_analysis: string[];
      macro_environment: string;
      technical_setup: string;
    };
    historical_insights?: {
      similar_trades_found: boolean;
      pattern_description: string;
      historical_outcome: string;
      lessons_learned: string[];
      confidence_in_pattern: string;
    };
    risk_assessment?: {
      primary_risks: Array<{
        risk: string;
        probability: string;
        impact: string;
        mitigation: string;
      }>;
      worst_case_scenario: string;
      best_case_scenario: string;
      most_likely_outcome: string;
    };
    trade_mechanics?: {
      entry_quality: string;
      greeks_analysis: string;
      liquidity_assessment: string;
      timing_consideration: string;
    };
  };
  decision_logic?: {
    weighted_factors: Array<{
      factor: string;
      weight: number;
      score: number;
      justification: string;
    }>;
    ips_vs_ai_alignment: string;
    why_this_recommendation: string;
    what_would_change_mind: string[];
  };
  forward_looking?: {
    expected_outcome: string;
    key_milestones: string[];
    exit_criteria: {
      profit_target: string;
      stop_loss: string;
      time_based: string;
    };
    monitoring_checklist: string[];
  };
  metadata?: {
    data_quality_score: number;
    sources_used: string[];
    areas_of_uncertainty: string[];
    follow_up_research_needed: string[];
  };
}

interface EnhancedAIAnalysisProps {
  candidate: any;
}

export function EnhancedAIAnalysis({ candidate }: EnhancedAIAnalysisProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    analysis: false,
    decision: false,
    forward: false,
  });

  // Try to extract structured rationale from various possible locations
  const getStructuredRationale = (): StructuredRationale | null => {
    // Try evaluation_context first (if saved in ai_trade_evaluations)
    if (candidate.evaluation_context?.structured_rationale) {
      const rationale = candidate.evaluation_context.structured_rationale;
      return typeof rationale === 'string' ? JSON.parse(rationale) : rationale;
    }

    // Try direct structured_rationale field
    if (candidate.structured_rationale) {
      const rationale = candidate.structured_rationale;
      return typeof rationale === 'string' ? JSON.parse(rationale) : rationale;
    }

    // Try to parse from rationale text if it looks like JSON
    if (candidate.rationale && candidate.rationale.trim().startsWith('{')) {
      try {
        return JSON.parse(candidate.rationale);
      } catch (e) {
        // Not JSON, will fall back to text display
      }
    }

    return null;
  };

  const structuredRationale = getStructuredRationale();

  // If no structured rationale, show basic text analysis
  if (!structuredRationale || !structuredRationale.summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="w-5 h-5" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">
            {candidate.rationale || 'No detailed analysis available'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec.toLowerCase()) {
      case 'strong_buy': return 'bg-green-600';
      case 'buy': return 'bg-green-500';
      case 'neutral': return 'bg-yellow-500';
      case 'avoid': return 'bg-orange-500';
      case 'strong_avoid': return 'bg-red-600';
      default: return 'bg-gray-500';
    }
  };

  const getConfidenceColor = (conf: string) => {
    switch (conf.toLowerCase()) {
      case 'very_high': return 'text-green-600';
      case 'high': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-orange-500';
      case 'very_low': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Executive Summary Card */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="cursor-pointer" onClick={() => toggleSection('summary')}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="w-5 h-5 text-primary" />
              AI Executive Summary
            </CardTitle>
            {expandedSections.summary ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </CardHeader>
        {expandedSections.summary && (
          <CardContent className="space-y-4">
            {/* Recommendation & Confidence */}
            <div className="flex items-center gap-3">
              <Badge className={cn('text-base px-4 py-1', getRecommendationColor(structuredRationale.summary.recommendation))}>
                {structuredRationale.summary.recommendation.replace('_', ' ').toUpperCase()}
              </Badge>
              <span className={cn('text-sm font-semibold', getConfidenceColor(structuredRationale.summary.confidence_level))}>
                {structuredRationale.summary.confidence_level.replace('_', ' ').toUpperCase()} Confidence
              </span>
            </div>

            {/* One-Sentence Thesis */}
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm font-medium italic leading-relaxed">
                "{structuredRationale.summary.one_sentence_thesis}"
              </p>
            </div>

            {/* Strengths & Concerns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  Key Strengths
                </div>
                <ul className="space-y-1.5">
                  {structuredRationale.summary.key_strengths.map((strength, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-green-600 dark:text-green-400 mt-0.5">•</span>
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Concerns */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="w-4 h-4" />
                  Key Concerns
                </div>
                <ul className="space-y-1.5">
                  {structuredRationale.summary.key_concerns.map((concern, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-orange-600 dark:text-orange-400 mt-0.5">•</span>
                      <span>{concern}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Detailed Analysis Tabs */}
      {structuredRationale.analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detailed Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="market" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="market">Market</TabsTrigger>
                <TabsTrigger value="historical">Historical</TabsTrigger>
                <TabsTrigger value="risk">Risk</TabsTrigger>
                <TabsTrigger value="mechanics">Mechanics</TabsTrigger>
              </TabsList>

              {/* Market Context Tab */}
              {structuredRationale.analysis.market_context && (
                <TabsContent value="market" className="space-y-4 mt-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Sentiment Summary</p>
                      <p className="text-sm">{structuredRationale.analysis.market_context.sentiment_summary}</p>
                    </div>

                    {structuredRationale.analysis.market_context.news_catalyst_analysis?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">News Catalysts</p>
                        <ul className="space-y-1">
                          {structuredRationale.analysis.market_context.news_catalyst_analysis.map((catalyst, idx) => (
                            <li key={idx} className="text-sm flex items-start gap-2">
                              <span className="text-primary mt-0.5">•</span>
                              <span>{catalyst}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Technical Setup</p>
                      <p className="text-sm">{structuredRationale.analysis.market_context.technical_setup}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Macro Environment</p>
                      <p className="text-sm">{structuredRationale.analysis.market_context.macro_environment}</p>
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* Historical Insights Tab */}
              {structuredRationale.analysis.historical_insights && (
                <TabsContent value="historical" className="space-y-4 mt-4">
                  {structuredRationale.analysis.historical_insights.similar_trades_found ? (
                    <div className="space-y-3">
                      <Badge variant="secondary" className="mb-2">
                        {structuredRationale.analysis.historical_insights.confidence_in_pattern.toUpperCase()} Pattern Match
                      </Badge>

                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Pattern Description</p>
                        <p className="text-sm">{structuredRationale.analysis.historical_insights.pattern_description}</p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Historical Outcome</p>
                        <p className="text-sm">{structuredRationale.analysis.historical_insights.historical_outcome}</p>
                      </div>

                      {structuredRationale.analysis.historical_insights.lessons_learned?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Lessons Learned</p>
                          <ul className="space-y-1">
                            {structuredRationale.analysis.historical_insights.lessons_learned.map((lesson, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <span className="text-primary mt-0.5">•</span>
                                <span>{lesson}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Historical Trades Summary */}
                      {candidate.historical_performance?.recent_trades && candidate.historical_performance.recent_trades.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Recent Trades ({candidate.historical_performance.total_trades} total, {candidate.historical_performance.win_rate.toFixed(0)}% win rate)
                          </p>
                          <div className="space-y-2">
                            {candidate.historical_performance.recent_trades.slice(0, 5).map((trade: any) => {
                              const isWin = trade.realized_pl_percent > 0;
                              const tradeDate = new Date(trade.created_at).toLocaleDateString();

                              return (
                                <Dialog key={trade.id}>
                                  <DialogTrigger asChild>
                                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border border-border">
                                      <div className="flex items-center gap-2">
                                        {isWin ? (
                                          <TrendingUp className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <TrendingDown className="h-4 w-4 text-red-500" />
                                        )}
                                        <div>
                                          <p className="text-sm font-medium">{trade.strategy_type.replace(/_/g, ' ')}</p>
                                          <p className="text-xs text-muted-foreground">{tradeDate}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant={isWin ? "default" : "destructive"} className="text-xs">
                                          {isWin ? '+' : ''}{trade.realized_pl_percent.toFixed(2)}%
                                        </Badge>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </div>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Trade Details</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-3">
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground">Strategy</p>
                                        <p className="text-sm">{trade.strategy_type.replace(/_/g, ' ')}</p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground">Opened</p>
                                          <p className="text-sm">{new Date(trade.created_at).toLocaleString()}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground">Closed</p>
                                          <p className="text-sm">{new Date(trade.closed_at).toLocaleString()}</p>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground">P/L</p>
                                          <p className={cn("text-sm font-semibold", isWin ? "text-green-600" : "text-red-600")}>
                                            ${trade.realized_pl.toFixed(2)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground">P/L %</p>
                                          <p className={cn("text-sm font-semibold", isWin ? "text-green-600" : "text-red-600")}>
                                            {isWin ? '+' : ''}{trade.realized_pl_percent.toFixed(2)}%
                                          </p>
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground">Trade ID</p>
                                        <p className="text-xs text-muted-foreground font-mono">{trade.id}</p>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              );
                            })}
                          </div>
                          {candidate.historical_performance.total_trades > 5 && (
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                              Showing 5 of {candidate.historical_performance.total_trades} trades
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No similar historical trades found for pattern matching.</p>
                  )}
                </TabsContent>
              )}

              {/* Risk Assessment Tab */}
              {structuredRationale.analysis.risk_assessment && (
                <TabsContent value="risk" className="space-y-4 mt-4">
                  {/* Scenarios */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Best Case</p>
                      <p className="text-xs">{structuredRationale.analysis.risk_assessment.best_case_scenario}</p>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Most Likely</p>
                      <p className="text-xs">{structuredRationale.analysis.risk_assessment.most_likely_outcome}</p>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Worst Case</p>
                      <p className="text-xs">{structuredRationale.analysis.risk_assessment.worst_case_scenario}</p>
                    </div>
                  </div>

                  {/* Primary Risks */}
                  {structuredRationale.analysis.risk_assessment.primary_risks?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Primary Risks</p>
                      <div className="space-y-2">
                        {structuredRationale.analysis.risk_assessment.primary_risks.map((risk, idx) => (
                          <div key={idx} className="p-3 border rounded-lg space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{risk.risk}</p>
                              <div className="flex gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {risk.probability} prob
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {risk.impact} impact
                                </Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">Mitigation:</span> {risk.mitigation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              )}

              {/* Trade Mechanics Tab */}
              {structuredRationale.analysis.trade_mechanics && (
                <TabsContent value="mechanics" className="space-y-3 mt-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Entry Quality</p>
                    <p className="text-sm">{structuredRationale.analysis.trade_mechanics.entry_quality}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Greeks Analysis</p>
                    <p className="text-sm">{structuredRationale.analysis.trade_mechanics.greeks_analysis}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Liquidity</p>
                    <p className="text-sm">{structuredRationale.analysis.trade_mechanics.liquidity_assessment}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Timing</p>
                    <p className="text-sm">{structuredRationale.analysis.trade_mechanics.timing_consideration}</p>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Decision Logic */}
      {structuredRationale.decision_logic && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => toggleSection('decision')}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="w-5 h-5" />
                Decision Logic
              </CardTitle>
              {expandedSections.decision ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </CardHeader>
          {expandedSections.decision && (
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Why This Recommendation:</p>
                <p className="text-sm leading-relaxed">{structuredRationale.decision_logic.why_this_recommendation}</p>
              </div>

              {structuredRationale.decision_logic.what_would_change_mind?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">What Would Change This Decision:</p>
                  <ul className="space-y-1">
                    {structuredRationale.decision_logic.what_would_change_mind.map((item, idx) => (
                      <li key={idx} className="text-sm flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Forward Looking */}
      {structuredRationale.forward_looking && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => toggleSection('forward')}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="w-5 h-5" />
                Forward Looking
              </CardTitle>
              {expandedSections.forward ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </CardHeader>
          {expandedSections.forward && (
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Expected Outcome:</p>
                <p className="text-sm">{structuredRationale.forward_looking.expected_outcome}</p>
              </div>

              {/* Exit Criteria */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 border rounded">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Profit Target</p>
                  <p className="text-xs">{structuredRationale.forward_looking.exit_criteria.profit_target}</p>
                </div>
                <div className="p-2 border rounded">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Stop Loss</p>
                  <p className="text-xs">{structuredRationale.forward_looking.exit_criteria.stop_loss}</p>
                </div>
                <div className="p-2 border rounded">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Time Based</p>
                  <p className="text-xs">{structuredRationale.forward_looking.exit_criteria.time_based}</p>
                </div>
              </div>

              {/* Monitoring Checklist */}
              {structuredRationale.forward_looking.monitoring_checklist?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Monitoring Checklist:</p>
                  <ul className="space-y-1">
                    {structuredRationale.forward_looking.monitoring_checklist.map((item, idx) => (
                      <li key={idx} className="text-sm flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
