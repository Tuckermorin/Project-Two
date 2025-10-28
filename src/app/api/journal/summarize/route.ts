// API Route for AI Journal Summarization
// This endpoint will analyze journal history and provide AI-generated insights
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// ============================================================================
// POST - Generate AI summary of journal entries
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
    const { sinceDays = 30, maxEntries = 20 } = body

    console.log(`[Journal Summarize] Generating AI summary for user ${userId}`)

    // Get recent journal entries for context
    const { data: entries, error: entriesError } = await supabase.rpc(
      'get_journal_summary_context',
      {
        p_user_id: userId,
        p_since_date: new Date(
          Date.now() - sinceDays * 24 * 60 * 60 * 1000
        ).toISOString(),
        p_max_entries: maxEntries,
      }
    )

    if (entriesError) {
      console.error('[Journal Summarize] Error fetching entries:', entriesError)
      return NextResponse.json({ error: entriesError.message }, { status: 500 })
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json(
        {
          summary: {
            hasData: false,
            message: 'No journal entries found for the specified time period.',
          },
        },
        { status: 200 }
      )
    }

    console.log(`[Journal Summarize] Analyzing ${entries.length} entries`)

    // Check if OpenAI is configured
    if (!openai) {
      console.log('[Journal Summarize] OpenAI not configured, returning placeholder')
      return NextResponse.json({
        summary: {
          hasData: true,
          entryCount: entries.length,
          message:
            'AI summarization is not yet configured. This feature will analyze your journal entries to identify patterns in your trading psychology, recurring themes, and areas for improvement.',
          placeholder: true,
        },
      })
    }

    // Get pattern analysis
    const { data: patterns } = await supabase.rpc('analyze_journal_patterns', {
      p_user_id: userId,
      p_since_date: new Date(
        Date.now() - sinceDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    })

    const analysis = patterns?.[0] || {}

    // Build context for AI
    const entriesContext = entries
      .map((entry: any) => {
        return `Date: ${new Date(entry.created_at).toLocaleDateString()}
Title: ${entry.title}
${entry.mood ? `Mood: ${entry.mood}` : ''}
${entry.tags && entry.tags.length > 0 ? `Tags: ${entry.tags.join(', ')}` : ''}
Content: ${entry.content}

---`
      })
      .join('\n\n')

    // Prepare AI prompt
    const prompt = `You are a trading psychology analyst reviewing a trader's journal entries. Analyze the following journal entries and provide insights:

**Statistics:**
- Total Entries: ${analysis.total_entries || entries.length}
- Average Entry Length: ${analysis.avg_entry_length || 'N/A'} characters
- Most Common Mood: ${analysis.most_common_mood || 'N/A'}
- Consistency Score: ${analysis.consistency_score || 'N/A'}%

**Journal Entries:**

${entriesContext}

**Analysis Instructions:**

Provide a comprehensive analysis covering:

1. **Key Themes**: What recurring topics or concerns appear in the journal?
2. **Emotional Patterns**: What emotional patterns do you observe? Are there specific triggers?
3. **Trading Psychology**: What insights can you derive about the trader's mindset and decision-making?
4. **Strengths**: What positive patterns or strengths are evident?
5. **Areas for Improvement**: What challenges or areas for growth do you identify?
6. **Recommendations**: What specific, actionable recommendations would you make?

Format your response as a structured JSON object with keys: themes, emotionalPatterns, tradingPsychology, strengths, areasForImprovement, recommendations. Each should be an array of strings.`

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert trading psychology analyst. Provide insightful, actionable feedback based on journal entries.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      })

      const aiAnalysis = JSON.parse(
        completion.choices[0].message.content || '{}'
      )

      console.log('[Journal Summarize] ✓ Generated AI summary')

      return NextResponse.json({
        summary: {
          hasData: true,
          entryCount: entries.length,
          sinceDays,
          ...aiAnalysis,
          statistics: {
            totalEntries: analysis.total_entries,
            avgEntryLength: analysis.avg_entry_length,
            mostCommonMood: analysis.most_common_mood,
            consistencyScore: analysis.consistency_score,
            moodDistribution: analysis.mood_distribution,
            topTags: analysis.most_common_tags,
          },
        },
      })
    } catch (aiError: any) {
      console.error('[Journal Summarize] AI generation error:', aiError)
      return NextResponse.json(
        {
          summary: {
            hasData: true,
            entryCount: entries.length,
            message:
              'Failed to generate AI summary. Please try again later.',
            error: aiError.message,
          },
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[Journal Summarize] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
