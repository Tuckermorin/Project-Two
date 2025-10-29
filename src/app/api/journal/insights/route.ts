// API Routes for Journal Insights and AI Analysis
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import OpenAI from 'openai'
import { generateEmbedding } from '@/lib/services/embedding-service'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// ============================================================================
// GET - Get journal insights and patterns
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const sinceDays = parseInt(searchParams.get('sinceDays') || '90')

    console.log(`[Journal Insights] Analyzing patterns for user ${userId} (last ${sinceDays} days)`)

    // Get journal pattern analysis from database function
    const { data: patterns, error: patternsError } = await supabase.rpc(
      'analyze_journal_patterns',
      {
        p_user_id: userId,
        p_since_date: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString(),
      }
    )

    if (patternsError) {
      console.error('[Journal Insights] Error analyzing patterns:', patternsError)
      return NextResponse.json({ error: patternsError.message }, { status: 500 })
    }

    const analysis = patterns?.[0] || {
      total_entries: 0,
      avg_entry_length: 0,
      most_common_mood: null,
      mood_distribution: {},
      most_common_tags: [],
      tag_frequency: {},
      entries_by_week: {},
      consistency_score: 0,
    }

    console.log(`[Journal Insights] Found ${analysis.total_entries} entries`)

    return NextResponse.json({ analysis })
  } catch (error: any) {
    console.error('[Journal Insights] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ============================================================================
// POST - Search similar journal entries (semantic search)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Parse request body
    const body = await request.json()
    const {
      query,
      matchThreshold = 0.75,
      matchCount = 10,
      startDate = null,
      endDate = null,
    } = body

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    console.log(`[Journal Insights] Semantic search for: "${query}"`)

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query)

    // Search for similar entries
    const { data: similarEntries, error } = await supabase.rpc('match_journal_entries', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      p_user_id: userId,
      p_start_date: startDate,
      p_end_date: endDate,
    })

    if (error) {
      console.error('[Journal Insights] Error searching entries:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Journal Insights] Found ${similarEntries?.length || 0} similar entries`)

    return NextResponse.json({ entries: similarEntries || [] })
  } catch (error: any) {
    console.error('[Journal Insights] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
