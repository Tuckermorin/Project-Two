-- Migration: Create Trading Journal Entries Table
-- Purpose: Store user journal entries with embeddings for semantic similarity search
-- Enables AI to analyze patterns in trader thoughts, emotions, and insights over time

-- ============================================================================
-- Main Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Journal Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  week_of DATE, -- Optional: Week starting date (Monday) for weekly reflections

  -- Tags & Categorization (for future filtering)
  tags TEXT[], -- e.g., ['mindset', 'strategy', 'risk-management']
  mood TEXT, -- e.g., 'confident', 'anxious', 'neutral', 'frustrated', 'excited'

  -- Embedding Data
  content_embedding vector(1536), -- OpenAI text-embedding-3-small for semantic similarity

  -- Related Trades (optional linkage)
  related_trade_ids UUID[], -- Array of trade IDs mentioned or relevant to this entry

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT journal_entries_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT journal_entries_content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Vector similarity search index (HNSW for fast approximate search)
CREATE INDEX idx_journal_entries_embedding
  ON public.journal_entries
  USING hnsw (content_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Regular indexes for filtering
CREATE INDEX idx_journal_entries_user_id
  ON public.journal_entries(user_id);

CREATE INDEX idx_journal_entries_created_at
  ON public.journal_entries(created_at DESC);

CREATE INDEX idx_journal_entries_week_of
  ON public.journal_entries(week_of DESC)
  WHERE week_of IS NOT NULL;

-- GIN index for tags array
CREATE INDEX idx_journal_entries_tags
  ON public.journal_entries USING GIN(tags);

-- Index for mood filtering
CREATE INDEX idx_journal_entries_mood
  ON public.journal_entries(mood)
  WHERE mood IS NOT NULL;

-- GIN index for related trade IDs
CREATE INDEX idx_journal_entries_related_trades
  ON public.journal_entries USING GIN(related_trade_ids);

-- ============================================================================
-- Functions
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_journal_entry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_updated
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION update_journal_entry_timestamp();

-- Function to find similar journal entries
CREATE OR REPLACE FUNCTION match_journal_entries(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  p_user_id UUID DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  week_of DATE,
  tags TEXT[],
  mood TEXT,
  similarity float,
  created_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.id,
    je.title,
    je.content,
    je.week_of,
    je.tags,
    je.mood,
    1 - (je.content_embedding <=> query_embedding) AS similarity,
    je.created_at
  FROM journal_entries je
  WHERE
    -- Similarity threshold
    je.content_embedding IS NOT NULL
    AND 1 - (je.content_embedding <=> query_embedding) > match_threshold
    -- Optional user filter
    AND (p_user_id IS NULL OR je.user_id = p_user_id)
    -- Optional date range filter
    AND (p_start_date IS NULL OR je.created_at >= p_start_date)
    AND (p_end_date IS NULL OR je.created_at <= p_end_date)
  ORDER BY je.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to analyze journal patterns over time
CREATE OR REPLACE FUNCTION analyze_journal_patterns(
  p_user_id UUID,
  p_since_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '90 days'
)
RETURNS TABLE (
  total_entries BIGINT,
  avg_entry_length NUMERIC,
  most_common_mood TEXT,
  mood_distribution JSONB,
  most_common_tags TEXT[],
  tag_frequency JSONB,
  entries_by_week JSONB,
  consistency_score NUMERIC -- How consistently user journals (0-100)
) LANGUAGE plpgsql AS $$
DECLARE
  weeks_in_range INT;
  actual_weeks_with_entries INT;
BEGIN
  -- Calculate consistency
  weeks_in_range := CEIL(EXTRACT(EPOCH FROM (NOW() - p_since_date)) / (7 * 24 * 60 * 60));

  SELECT COUNT(DISTINCT DATE_TRUNC('week', created_at))
  INTO actual_weeks_with_entries
  FROM journal_entries
  WHERE user_id = p_user_id
    AND created_at >= p_since_date;

  RETURN QUERY
  WITH entry_stats AS (
    SELECT
      je.id,
      je.mood,
      je.tags,
      LENGTH(je.content) as content_length,
      DATE_TRUNC('week', je.created_at) as week_start
    FROM journal_entries je
    WHERE je.user_id = p_user_id
      AND je.created_at >= p_since_date
  ),
  mood_stats AS (
    SELECT
      mood,
      COUNT(*) as count
    FROM entry_stats
    WHERE mood IS NOT NULL
    GROUP BY mood
    ORDER BY count DESC
  ),
  tag_stats AS (
    SELECT
      UNNEST(tags) as tag,
      COUNT(*) as count
    FROM entry_stats
    WHERE tags IS NOT NULL AND ARRAY_LENGTH(tags, 1) > 0
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT
    COUNT(*)::BIGINT as total_entries,
    ROUND(AVG(content_length), 0) as avg_entry_length,
    (SELECT mood FROM mood_stats LIMIT 1) as most_common_mood,
    (
      SELECT JSONB_OBJECT_AGG(mood, count)
      FROM mood_stats
    ) as mood_distribution,
    ARRAY(SELECT tag FROM tag_stats) as most_common_tags,
    (
      SELECT JSONB_OBJECT_AGG(tag, count)
      FROM tag_stats
    ) as tag_frequency,
    (
      SELECT JSONB_OBJECT_AGG(
        TO_CHAR(week_start, 'YYYY-MM-DD'),
        entry_count
      )
      FROM (
        SELECT week_start, COUNT(*) as entry_count
        FROM entry_stats
        GROUP BY week_start
        ORDER BY week_start DESC
      ) week_counts
    ) as entries_by_week,
    ROUND(
      CASE
        WHEN weeks_in_range > 0
        THEN (actual_weeks_with_entries::NUMERIC / weeks_in_range::NUMERIC) * 100
        ELSE 0
      END,
      1
    ) as consistency_score
  FROM entry_stats;
END;
$$;

-- Function to get AI summarization context
-- This prepares data for future AI summarization feature
CREATE OR REPLACE FUNCTION get_journal_summary_context(
  p_user_id UUID,
  p_since_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  p_max_entries INT DEFAULT 20
)
RETURNS TABLE (
  entry_id UUID,
  title TEXT,
  content TEXT,
  week_of DATE,
  mood TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.id,
    je.title,
    je.content,
    je.week_of,
    je.mood,
    je.tags,
    je.created_at
  FROM journal_entries je
  WHERE je.user_id = p_user_id
    AND je.created_at >= p_since_date
  ORDER BY je.created_at DESC
  LIMIT p_max_entries;
END;
$$;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Users can only see their own journal entries
CREATE POLICY journal_entries_select_policy
  ON public.journal_entries
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own journal entries
CREATE POLICY journal_entries_insert_policy
  ON public.journal_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own journal entries
CREATE POLICY journal_entries_update_policy
  ON public.journal_entries
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own journal entries
CREATE POLICY journal_entries_delete_policy
  ON public.journal_entries
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Views for Analysis
-- ============================================================================

-- View: Recent Journal Entries with Stats
CREATE OR REPLACE VIEW v_journal_entries_recent AS
SELECT
  je.id,
  je.user_id,
  je.title,
  je.content,
  je.week_of,
  je.tags,
  je.mood,
  je.created_at,
  je.updated_at,
  LENGTH(je.content) as content_length,
  ARRAY_LENGTH(je.related_trade_ids, 1) as related_trades_count,
  CASE
    WHEN je.content_embedding IS NOT NULL THEN true
    ELSE false
  END as has_embedding
FROM journal_entries je
WHERE je.created_at >= NOW() - INTERVAL '90 days'
ORDER BY je.created_at DESC;

-- View: Journal Writing Streak
CREATE OR REPLACE VIEW v_journal_writing_streak AS
WITH weekly_entries AS (
  SELECT
    user_id,
    DATE_TRUNC('week', created_at) as week_start,
    COUNT(*) as entries_count
  FROM journal_entries
  GROUP BY user_id, DATE_TRUNC('week', created_at)
)
SELECT
  user_id,
  COUNT(*) as weeks_with_entries,
  MAX(entries_count) as max_entries_per_week,
  AVG(entries_count)::NUMERIC(10,1) as avg_entries_per_week,
  MAX(week_start) as last_journal_week
FROM weekly_entries
GROUP BY user_id;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.journal_entries IS
  'Stores trading journal entries with vector embeddings for semantic similarity search and AI analysis';

COMMENT ON COLUMN public.journal_entries.content_embedding IS
  'OpenAI text-embedding-3-small vector (1536 dimensions) for similarity search';

COMMENT ON COLUMN public.journal_entries.title IS
  'Journal entry title or summary';

COMMENT ON COLUMN public.journal_entries.content IS
  'Full journal entry content - thoughts, observations, learnings, emotions';

COMMENT ON COLUMN public.journal_entries.week_of IS
  'Optional week starting date (Monday) for weekly reflection entries';

COMMENT ON COLUMN public.journal_entries.tags IS
  'Array of tags for categorization: mindset, strategy, risk-management, etc.';

COMMENT ON COLUMN public.journal_entries.mood IS
  'Emotional state when writing: confident, anxious, neutral, frustrated, excited, etc.';

COMMENT ON COLUMN public.journal_entries.related_trade_ids IS
  'Array of trade IDs that are mentioned or relevant to this journal entry';

COMMENT ON FUNCTION match_journal_entries IS
  'Find similar journal entries using vector similarity search with optional filters';

COMMENT ON FUNCTION analyze_journal_patterns IS
  'Analyze journaling patterns and provide insights into consistency, mood trends, and topics';

COMMENT ON FUNCTION get_journal_summary_context IS
  'Prepare journal entries for AI summarization - returns recent entries for analysis';

COMMENT ON VIEW v_journal_entries_recent IS
  'Recent journal entries (90 days) with computed stats';

COMMENT ON VIEW v_journal_writing_streak IS
  'User journaling consistency and streaks';
