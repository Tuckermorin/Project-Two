"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Newspaper,
  Users,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  Target,
  Award,
  Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FactorScorecard } from '@/components/trades/factor-scorecard';

interface NewsSentiment {
  sentiment_label: string;
  average_score: number | null;
  positive: number;
  negative: number;
  neutral: number;
  count: number;
  avg_relevance: number | null;
  topic_sentiment?: Record<string, number>;
  raw_articles?: Array<{
    title: string;
    url: string;
    time_published?: string;
  }>;
}

interface InsiderActivity {
  transaction_count: number;
  acquisition_count: number;
  disposal_count: number;
  net_shares: number;
  net_value: number;
  buy_ratio: number;
  activity_trend: number;
  transactions?: Array<{
    executive_name: string;
    executive_title: string;
    acquisition_or_disposal: 'A' | 'D';
    shares: number;
    share_price: number;
    transaction_date: string;
  }>;
}

interface TradeDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: any;
  onAddToProspective?: (candidate: any, numContracts: number) => Promise<void>;
}

/**
 * Detailed trade view modal with Alpha Intelligence data and IPS factors
 */
export function TradeDetailsModal({
  open,
  onOpenChange,
  candidate,
  onAddToProspective
}: TradeDetailsModalProps) {
  const [numberOfContracts, setNumberOfContracts] = useState("1");
  const [addingToProspective, setAddingToProspective] = useState(false);

  const newsSentiment = candidate.general_data?.av_news_sentiment || candidate.metadata?.av_news_sentiment;
  const insiderActivity = candidate.general_data?.insider_activity || candidate.metadata?.insider_activity;

  const score = candidate.ips_score || candidate.composite_score || candidate.score || 0;

  // Calculate DTE
  const getDTE = () => {
    if (!candidate.contract_legs || candidate.contract_legs.length === 0) return null;
    const expiry = candidate.contract_legs[0].expiry;
    const expiryDate = new Date(expiry);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const dte = getDTE();

  const handleAddToProspective = async () => {
    if (!onAddToProspective || !numberOfContracts || parseInt(numberOfContracts) < 1) return;

    setAddingToProspective(true);
    try {
      await onAddToProspective(candidate, parseInt(numberOfContracts));
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding to prospective:', error);
    } finally {
      setAddingToProspective(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <span>{candidate.symbol}</span>
            <Badge variant="secondary" className="text-lg font-bold">
              {score.toFixed(0)}% IPS Fit
            </Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {candidate.strategy.replace(/_/g, ' ')}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="px-6 py-4 space-y-6">
            {/* Trade Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="w-5 h-5" />
                  Trade Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {candidate.entry_mid !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Entry Price</p>
                      <p className="text-lg font-semibold">${candidate.entry_mid.toFixed(2)}</p>
                    </div>
                  )}
                  {candidate.max_profit !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Max Profit</p>
                      <p className="text-lg font-semibold text-green-600">
                        ${candidate.max_profit.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {candidate.max_loss !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Max Loss</p>
                      <p className="text-lg font-semibold text-red-600">
                        ${Math.abs(candidate.max_loss).toFixed(2)}
                      </p>
                    </div>
                  )}
                  {dte !== null && (
                    <div>
                      <p className="text-xs text-muted-foreground">DTE</p>
                      <p className="text-lg font-semibold">{dte} days</p>
                    </div>
                  )}
                </div>

                {/* Contract Legs */}
                {candidate.contract_legs && candidate.contract_legs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Contract Structure</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {candidate.contract_legs.map((leg: any, idx: number) => (
                        <div
                          key={idx}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded border',
                            leg.type === 'SELL'
                              ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                              : 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                          )}
                        >
                          <Badge variant={leg.type === 'SELL' ? 'destructive' : 'default'}>
                            {leg.type}
                          </Badge>
                          <span className="text-sm font-medium">
                            {leg.right === 'P' ? 'Put' : 'Call'} ${leg.strike}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(leg.expiry).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Intelligence Adjustments */}
                {candidate.intelligence_adjustments && candidate.intelligence_adjustments !== 'none' && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                      Intelligence Adjustments
                    </p>
                    <p className="text-sm">{candidate.intelligence_adjustments}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* News Sentiment Card */}
            {newsSentiment && newsSentiment.count > 0 && (
              <Card className="border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Newspaper className="w-5 h-5 text-blue-600" />
                    News Sentiment Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall Sentiment */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                    <div className="flex items-center gap-3">
                      {newsSentiment.sentiment_label === 'bullish' || newsSentiment.sentiment_label === 'somewhat-bullish' ? (
                        <TrendingUp className="w-8 h-8 text-green-600" />
                      ) : newsSentiment.sentiment_label === 'bearish' || newsSentiment.sentiment_label === 'somewhat-bearish' ? (
                        <TrendingDown className="w-8 h-8 text-red-600" />
                      ) : (
                        <Minus className="w-8 h-8 text-gray-600" />
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Overall Sentiment</p>
                        <p className="text-xl font-bold capitalize">{newsSentiment.sentiment_label}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Score</p>
                      <p className="text-2xl font-bold">
                        {newsSentiment.average_score !== null ? newsSentiment.average_score.toFixed(2) : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Article Breakdown */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-700 dark:text-green-300 font-semibold mb-1">Positive</p>
                      <p className="text-2xl font-bold text-green-600">{newsSentiment.positive}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-800">
                      <p className="text-xs text-gray-700 dark:text-gray-300 font-semibold mb-1">Neutral</p>
                      <p className="text-2xl font-bold text-gray-600">{newsSentiment.neutral}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 dark:text-red-300 font-semibold mb-1">Negative</p>
                      <p className="text-2xl font-bold text-red-600">{newsSentiment.negative}</p>
                    </div>
                  </div>

                  {/* Relevance */}
                  {newsSentiment.avg_relevance !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Avg Relevance to {candidate.symbol}</span>
                      <Badge variant="secondary" className="font-mono">
                        {newsSentiment.avg_relevance.toFixed(2)}
                      </Badge>
                    </div>
                  )}

                  {/* Topic Sentiment */}
                  {newsSentiment.topic_sentiment && Object.keys(newsSentiment.topic_sentiment).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">Topic-Specific Sentiment</p>
                      <div className="space-y-2">
                        {Object.entries(newsSentiment.topic_sentiment).slice(0, 5).map(([topic, score]) => (
                          <div key={topic} className="flex items-center justify-between">
                            <span className="text-sm">{topic}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full transition-all',
                                    (score as number) > 0.3 ? 'bg-green-500' :
                                    (score as number) < -0.3 ? 'bg-red-500' :
                                    'bg-gray-400'
                                  )}
                                  style={{ width: `${Math.abs((score as number)) * 100}%` }}
                                />
                              </div>
                              <span className={cn(
                                'text-sm font-mono w-12 text-right',
                                (score as number) > 0.3 ? 'text-green-600' :
                                (score as number) < -0.3 ? 'text-red-600' :
                                'text-gray-600'
                              )}>
                                {(score as number).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Insider Activity Card */}
            {insiderActivity && insiderActivity.transaction_count > 0 && (
              <Card className="border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="w-5 h-5 text-purple-600" />
                    Insider Transaction Activity (90 days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Buy/Sell Ratio */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                    <div className="flex items-center gap-3">
                      {insiderActivity.buy_ratio > 1.5 ? (
                        <TrendingUp className="w-8 h-8 text-green-600" />
                      ) : insiderActivity.buy_ratio < 0.5 ? (
                        <TrendingDown className="w-8 h-8 text-red-600" />
                      ) : (
                        <Minus className="w-8 h-8 text-gray-600" />
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Buy/Sell Ratio</p>
                        <p className="text-xl font-bold">
                          {insiderActivity.buy_ratio > 2.0 ? 'Strong Buying' :
                           insiderActivity.buy_ratio > 1.0 ? 'Moderate Buying' :
                           insiderActivity.buy_ratio > 0.5 ? 'Balanced' :
                           'Selling'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Ratio</p>
                      <p className="text-2xl font-bold">{insiderActivity.buy_ratio.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Transaction Breakdown */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-700 dark:text-green-300 font-semibold mb-1">Acquisitions</p>
                      <p className="text-2xl font-bold text-green-600">{insiderActivity.acquisition_count}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 dark:text-red-300 font-semibold mb-1">Disposals</p>
                      <p className="text-2xl font-bold text-red-600">{insiderActivity.disposal_count}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold mb-1">Total</p>
                      <p className="text-2xl font-bold text-blue-600">{insiderActivity.transaction_count}</p>
                    </div>
                  </div>

                  {/* Net Activity */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Net Shares</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-mono',
                          insiderActivity.net_shares > 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {insiderActivity.net_shares > 0 ? '+' : ''}{insiderActivity.net_shares.toLocaleString()}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Net Value</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-mono',
                          insiderActivity.net_value > 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {insiderActivity.net_value > 0 ? '+' : ''}${insiderActivity.net_value.toLocaleString()}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Activity Trend</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-mono',
                          insiderActivity.activity_trend > 0.5 ? 'text-green-600' :
                          insiderActivity.activity_trend < -0.5 ? 'text-red-600' :
                          'text-gray-600'
                        )}
                      >
                        {insiderActivity.activity_trend > 0.5 ? '📈 Bullish' :
                         insiderActivity.activity_trend < -0.5 ? '📉 Bearish' :
                         '➡️ Stable'}
                      </Badge>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  {insiderActivity.transactions && insiderActivity.transactions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">Recent Transactions</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {insiderActivity.transactions.slice(0, 5).map((trans, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded border text-xs"
                          >
                            <div className="flex-1">
                              <p className="font-semibold">{trans.executive_name}</p>
                              <p className="text-muted-foreground">{trans.executive_title}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={trans.acquisition_or_disposal === 'A' ? 'default' : 'destructive'}>
                                {trans.acquisition_or_disposal === 'A' ? 'BUY' : 'SELL'}
                              </Badge>
                              <span className="font-mono">{Number(trans.shares).toLocaleString()}</span>
                              <span className="text-muted-foreground">@</span>
                              <span className="font-mono">${Number(trans.share_price).toFixed(2)}</span>
                            </div>
                            <span className="text-muted-foreground text-[10px] ml-2">
                              {new Date(trans.transaction_date).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Enhanced IPS Factor Scorecard */}
            {(candidate.ips_factor_details || candidate.detailed_analysis?.ips_factor_details) && (
              <FactorScorecard
                ipsFactorDetails={candidate.ips_factor_details || candidate.detailed_analysis?.ips_factor_details}
                compact={false}
              />
            )}

            {/* Fallback: Old IPS Factors */}
            {!candidate.ips_factor_details && !candidate.detailed_analysis?.ips_factor_details &&
             candidate.detailed_analysis?.ips_factors && candidate.detailed_analysis.ips_factors.length > 0 && (
              <Card className="border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Award className="w-5 h-5 text-blue-600" />
                    IPS Factor Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Factor Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-700 dark:text-green-300 font-semibold mb-1">Passed</p>
                      <p className="text-2xl font-bold text-green-600">
                        {candidate.detailed_analysis.ips_factors.filter((f: any) => f.status === 'pass').length}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 font-semibold mb-1">Warning</p>
                      <p className="text-2xl font-bold text-yellow-600">
                        {candidate.detailed_analysis.ips_factors.filter((f: any) => f.status === 'warning').length}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 dark:text-red-300 font-semibold mb-1">Failed</p>
                      <p className="text-2xl font-bold text-red-600">
                        {candidate.detailed_analysis.ips_factors.filter((f: any) => f.status === 'fail').length}
                      </p>
                    </div>
                  </div>

                  {/* Overall Score */}
                  {candidate.score !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Overall IPS Score</span>
                      <Badge variant="secondary" className="font-mono">
                        {candidate.score}%
                      </Badge>
                    </div>
                  )}

                  {/* Individual Factors */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Factor Details</p>
                    <div className="space-y-2">
                      {candidate.detailed_analysis.ips_factors.map((factor: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {factor.status === 'pass' ? (
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : factor.status === 'fail' ? (
                              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                            )}
                            <span className="text-sm">{factor.display_name || factor.factor_name || factor.name || 'Unknown Factor'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {factor.target && <span>Target: {factor.target}</span>}
                            {factor.actual && <span className="font-mono">{factor.actual}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Rationale */}
            {candidate.rationale && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Info className="w-5 h-5" />
                    AI Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{candidate.rationale}</p>
                </CardContent>
              </Card>
            )}

            {/* Trade Entry Details */}
            {onAddToProspective && (
              <Card className="bg-gray-50 dark:bg-gray-800">
                <CardHeader>
                  <CardTitle className="text-base">Trade Entry Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contracts-input" className="text-sm font-medium">
                      Number of Contracts
                    </Label>
                    <Input
                      id="contracts-input"
                      type="number"
                      min="1"
                      value={numberOfContracts}
                      onChange={(e) => setNumberOfContracts(e.target.value)}
                      placeholder="1"
                      className="max-w-xs"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All other metrics are automatically extracted from the options chain
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Footer with Actions */}
        {onAddToProspective && (
          <DialogFooter className="px-6 py-4 border-t">
            <div className="flex gap-3 w-full">
              <Button
                className="flex-1"
                onClick={handleAddToProspective}
                disabled={addingToProspective || !numberOfContracts || parseInt(numberOfContracts) < 1}
              >
                {addingToProspective ? (
                  <>
                    <span className="animate-spin mr-2">⚙️</span>
                    Adding...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Add to Prospective Trades
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addingToProspective}>
                Close
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
