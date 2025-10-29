-- Migration: Recreate v_journal_entries_recent view
-- Date: 2025-10-29
-- Reason: View was dropped during embedding dimension migration

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

COMMENT ON VIEW v_journal_entries_recent IS
  'Recent journal entries (90 days) with computed stats - includes 2000-dimension embeddings';
