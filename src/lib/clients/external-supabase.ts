// External Supabase Client for Market Intelligence Database
// Connects to separate Supabase instance with pre-embedded news, transcripts, and sentiment data

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Singleton instance to avoid multiple connections
let externalSupabaseInstance: SupabaseClient | null = null;

/**
 * Get the external Supabase client for market intelligence data
 * This connects to a separate database containing:
 * - earnings_transcript_embeddings (632 records)
 * - market_news_embeddings (12,671 articles)
 * - news_embeddings (235,227 general news)
 * - market_news_ticker_sentiment (62,671 sentiment records)
 */
export function getExternalSupabase(): SupabaseClient {
  if (!externalSupabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_AI_AGENT_URL;
    const supabaseKey = process.env.SUPABASE_AI_AGENT_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing external Supabase credentials. Ensure SUPABASE_AI_AGENT_URL and SUPABASE_AI_AGENT_API_KEY are set in .env'
      );
    }

    externalSupabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false, // Server-side, no session persistence needed
      },
      global: {
        headers: {
          'x-client-info': 'tenxiv-market-intelligence',
        },
      },
    });

    console.log('[ExternalSupabase] Connected to market intelligence database');
  }

  return externalSupabaseInstance;
}

/**
 * Health check for external database connection
 */
export async function checkExternalDatabaseHealth(): Promise<{
  connected: boolean;
  error?: string;
  stats?: {
    earnings_transcripts: number;
    market_news: number;
    news_embeddings: number;
    ticker_sentiment: number;
  };
}> {
  try {
    const client = getExternalSupabase();

    // Quick count query to verify connection and get stats (sequential for reliability)
    const transcriptResult = await client
      .from('earnings_transcript_embeddings')
      .select('*', { count: 'exact', head: true });

    if (transcriptResult.error) {
      console.error('[ExternalSupabase] Health check failed:', transcriptResult.error);
      return {
        connected: false,
        error: transcriptResult.error.message || 'Failed to query earnings_transcript_embeddings',
      };
    }

    const marketNewsResult = await client
      .from('market_news_embeddings')
      .select('*', { count: 'exact', head: true });

    if (marketNewsResult.error) {
      console.error('[ExternalSupabase] Health check failed:', marketNewsResult.error);
      return {
        connected: false,
        error: marketNewsResult.error.message || 'Failed to query market_news_embeddings',
      };
    }

    const newsResult = await client
      .from('news_embeddings')
      .select('*', { count: 'exact', head: true });

    if (newsResult.error) {
      console.error('[ExternalSupabase] Health check failed:', newsResult.error);
      return {
        connected: false,
        error: newsResult.error.message || 'Failed to query news_embeddings',
      };
    }

    const sentimentResult = await client
      .from('market_news_ticker_sentiment')
      .select('*', { count: 'exact', head: true });

    if (sentimentResult.error) {
      console.error('[ExternalSupabase] Health check failed:', sentimentResult.error);
      return {
        connected: false,
        error: sentimentResult.error.message || 'Failed to query market_news_ticker_sentiment',
      };
    }

    console.log('[ExternalSupabase] Health check passed');
    return {
      connected: true,
      stats: {
        earnings_transcripts: transcriptResult.count || 0,
        market_news: marketNewsResult.count || 0,
        news_embeddings: newsResult.count || 0,
        ticker_sentiment: sentimentResult.count || 0,
      },
    };
  } catch (error: any) {
    console.error('[ExternalSupabase] Health check exception:', error);
    return {
      connected: false,
      error: error.message || 'Connection failed',
    };
  }
}

/**
 * Reset the external Supabase connection (useful for testing)
 */
export function resetExternalSupabase(): void {
  externalSupabaseInstance = null;
}

// Type definitions for external database tables

export interface EarningsTranscriptEmbedding {
  id: string;
  symbol: string;
  fiscal_date_ending: string;
  quarter: string;
  fiscal_year: number;
  transcript_text: string;
  embedding: number[]; // Vector embedding (1536 dimensions)
  created_at?: string;
}

export interface MarketNewsEmbedding {
  id: string;
  url: string;
  title: string;
  summary: string;
  time_published: string;
  authors: string[];
  source: string;
  source_domain: string;
  banner_image?: string;
  category_within_source?: string;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  topics: Array<{ topic: string; relevance_score: string }>;
  embedding: string; // JSON-encoded vector
  created_at?: string;
}

export interface NewsEmbedding {
  id: string;
  // Schema TBD - will inspect once we query it
  embedding: number[];
  created_at?: string;
}

export interface MarketNewsTickerSentiment {
  id: string;
  article_id: string;
  ticker: string;
  relevance_score: number;
  ticker_sentiment_score: number;
  ticker_sentiment_label: string;
  created_at?: string;
}

// Utility function to parse embedding strings to arrays (market news embeddings are stored as strings)
export function parseEmbedding(embedding: string | number[]): number[] {
  if (Array.isArray(embedding)) {
    return embedding;
  }

  try {
    // Parse string representation of array
    return JSON.parse(embedding);
  } catch (error) {
    console.error('[ExternalSupabase] Failed to parse embedding:', error);
    return [];
  }
}
