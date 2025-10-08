/**
 * Apewisdom API Types
 * Types for Reddit/social sentiment analysis via Apewisdom
 * API Docs: https://apewisdom.io/api/
 */

export interface ApewisdomTicker {
  ticker: string;
  name: string;
  mentions: number | string; // API sometimes returns string
  upvotes: number | string; // API sometimes returns string
  rank: number;
  rank_24h_ago: number;
  mentions_24h_ago: number | string; // API sometimes returns string
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  sentiment_score: number; // 0-100
}

export interface ApewisdomResponse {
  results: ApewisdomTicker[];
  count: number; // Total results
  pages: number; // Total pages
  current_page: number; // Current page number
}

export interface RedditSentiment {
  symbol: string;
  timestamp: Date;
  sentiment_score: number; // -1 (bearish) to +1 (bullish)
  mention_count: number;
  trending_rank: number | null; // 1-100, null if not trending
  mention_velocity: number; // % change in mentions (24h)
  upvotes: number; // Total upvotes from aggregated posts
  confidence: 'low' | 'medium' | 'high'; // Based on sample size
}

export interface RedditSearchParams {
  symbol: string;
  filter?: '1h' | '24h' | '7d' | '30d'; // Default: '24h'
}
