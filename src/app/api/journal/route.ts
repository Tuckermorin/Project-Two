// API Routes for Journal Entries
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { generateEmbedding } from '@/lib/services/embedding-service'

// ============================================================================
// GET - Fetch journal entries
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
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const weekOf = searchParams.get('weekOf') // Optional filter by week

    // Build query
    let query = supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply week filter if provided
    if (weekOf) {
      query = query.eq('week_of', weekOf)
    }

    const { data: entries, error } = await query

    if (error) {
      console.error('[Journal API] Error fetching entries:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entries })
  } catch (error: any) {
    console.error('[Journal API] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ============================================================================
// POST - Create new journal entry
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
      title,
      content,
      weekOf,
      tags = [],
      mood = null,
      relatedTradeIds = [],
    } = body

    // Validate required fields
    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      )
    }

    if (title.trim().length === 0 || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title and content cannot be empty' },
        { status: 400 }
      )
    }

    console.log(`[Journal API] Creating entry for user ${userId}`)

    // Generate embedding for content
    let embedding: number[] | null = null
    try {
      // Combine title and content for embedding
      const textToEmbed = `${title}\n\n${content}`
      embedding = await generateEmbedding(textToEmbed)
      console.log(`[Journal API] Generated embedding (${embedding.length} dimensions)`)
    } catch (embeddingError: any) {
      console.error('[Journal API] Failed to generate embedding:', embeddingError)
      // Continue without embedding - we can generate it later
    }

    // Insert journal entry
    const { data: entry, error } = await supabase
      .from('journal_entries')
      .insert({
        user_id: userId,
        title,
        content,
        week_of: weekOf || null,
        tags: tags.length > 0 ? tags : null,
        mood: mood,
        related_trade_ids: relatedTradeIds.length > 0 ? relatedTradeIds : null,
        content_embedding: embedding,
      })
      .select()
      .single()

    if (error) {
      console.error('[Journal API] Error creating entry:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Journal API] ✓ Created entry ${entry.id}`)

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error: any) {
    console.error('[Journal API] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ============================================================================
// PATCH - Update existing journal entry
// ============================================================================

export async function PATCH(request: NextRequest) {
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
    const { id, title, content, weekOf, tags, mood, relatedTradeIds } = body

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 })
    }

    // Validate that entry belongs to user
    const { data: existingEntry, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (fetchError || !existingEntry) {
      return NextResponse.json(
        { error: 'Entry not found or unauthorized' },
        { status: 404 }
      )
    }

    console.log(`[Journal API] Updating entry ${id} for user ${userId}`)

    // Build update object
    const updates: any = {}

    if (title !== undefined) {
      if (title.trim().length === 0) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
      }
      updates.title = title
    }

    if (content !== undefined) {
      if (content.trim().length === 0) {
        return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 })
      }
      updates.content = content
    }

    if (weekOf !== undefined) {
      updates.week_of = weekOf
    }

    if (tags !== undefined) {
      updates.tags = tags.length > 0 ? tags : null
    }

    if (mood !== undefined) {
      updates.mood = mood
    }

    if (relatedTradeIds !== undefined) {
      updates.related_trade_ids = relatedTradeIds.length > 0 ? relatedTradeIds : null
    }

    // If title or content changed, regenerate embedding
    if (title !== undefined || content !== undefined) {
      try {
        // Fetch current entry to get title/content
        const { data: currentEntry } = await supabase
          .from('journal_entries')
          .select('title, content')
          .eq('id', id)
          .single()

        const finalTitle = title !== undefined ? title : currentEntry?.title || ''
        const finalContent = content !== undefined ? content : currentEntry?.content || ''

        const textToEmbed = `${finalTitle}\n\n${finalContent}`
        const embedding = await generateEmbedding(textToEmbed)
        updates.content_embedding = embedding
        console.log(`[Journal API] Regenerated embedding (${embedding.length} dimensions)`)
      } catch (embeddingError: any) {
        console.error('[Journal API] Failed to regenerate embedding:', embeddingError)
        // Continue without updating embedding
      }
    }

    // Perform update
    const { data: updatedEntry, error: updateError } = await supabase
      .from('journal_entries')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (updateError) {
      console.error('[Journal API] Error updating entry:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[Journal API] ✓ Updated entry ${id}`)

    return NextResponse.json({ entry: updatedEntry })
  } catch (error: any) {
    console.error('[Journal API] PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ============================================================================
// DELETE - Delete journal entry
// ============================================================================

export async function DELETE(request: NextRequest) {
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

    // Get entry ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 })
    }

    console.log(`[Journal API] Deleting entry ${id} for user ${userId}`)

    // Delete entry (RLS will ensure user owns it)
    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('[Journal API] Error deleting entry:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Journal API] ✓ Deleted entry ${id}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Journal API] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
