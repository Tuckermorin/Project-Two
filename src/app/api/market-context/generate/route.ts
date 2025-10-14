// src/app/api/market-context/generate/route.ts
// API endpoint to manually trigger daily market context generation

import { NextRequest, NextResponse } from 'next/server';
import { getDailyMarketContextService } from '@/lib/services/daily-market-context-service';

export async function POST(request: NextRequest) {
  try {
    const marketContextService = getDailyMarketContextService();

    // Optional: specify date in request body
    let asOfDate = new Date().toISOString().split('T')[0];
    try {
      const body = await request.json();
      if (body.asOfDate) {
        asOfDate = body.asOfDate;
      }
    } catch {
      // Use today's date
    }

    console.log(`[Market Context API] Generating context for ${asOfDate}`);

    const context = await marketContextService.generateDailyContext(asOfDate);

    if (!context) {
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to generate market context (context already exists or no articles found)',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Market context generated successfully',
      data: {
        as_of_date: context.as_of_date,
        summary_preview: context.summary.substring(0, 200) + '...',
        key_themes: context.key_themes,
        sentiment: context.overall_market_sentiment,
        sentiment_score: context.sentiment_score,
        source_count: context.source_count,
        processing_time: context.processing_time_seconds,
      },
    });
  } catch (error) {
    console.error('[Market Context API] Failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate market context',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const marketContextService = getDailyMarketContextService();

    // Get query parameters
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7');
    const query = url.searchParams.get('query');

    // If query provided, do similarity search
    if (query) {
      const results = await marketContextService.searchSimilarContext(query, 5);
      return NextResponse.json({
        success: true,
        query,
        results: results.map(r => ({
          as_of_date: r.as_of_date,
          summary_preview: r.summary.substring(0, 200) + '...',
          key_themes: r.key_themes,
          sentiment: r.overall_market_sentiment,
          sentiment_score: r.sentiment_score,
        })),
      });
    }

    // Otherwise, get recent context
    const contexts = await marketContextService.getRecentContext(days);

    return NextResponse.json({
      success: true,
      count: contexts.length,
      contexts: contexts.map(c => ({
        as_of_date: c.as_of_date,
        summary_preview: c.summary.substring(0, 200) + '...',
        key_themes: c.key_themes,
        sentiment: c.overall_market_sentiment,
        sentiment_score: c.sentiment_score,
        source_count: c.source_count,
      })),
    });
  } catch (error) {
    console.error('[Market Context API] Failed to fetch contexts:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch market contexts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
