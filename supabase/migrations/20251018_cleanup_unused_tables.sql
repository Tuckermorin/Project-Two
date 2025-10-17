-- Migration: Cleanup unused database tables
-- Created: 2025-10-18
-- Description: Remove tables with no data and no active code references

-- =============================================================================
-- DROP: trade_outcomes
-- Reason: Redundant with trades table (which already tracks status, P&L, entry/exit)
-- =============================================================================

-- Drop the table (CASCADE to drop foreign key constraints)
DROP TABLE IF EXISTS trade_outcomes CASCADE;

-- =============================================================================
-- DROP: macro_series
-- Reason: No code references, no clear use case, 0 rows
-- =============================================================================

DROP TABLE IF EXISTS macro_series CASCADE;

-- =============================================================================
-- DROP: datausa_series
-- Reason: No code references, no clear use case, 0 rows
-- =============================================================================

DROP TABLE IF EXISTS datausa_series CASCADE;

-- =============================================================================
-- DROP: journal_entries
-- Reason: No code references, no active journaling feature, 0 rows
-- =============================================================================

DROP TABLE IF EXISTS journal_entries CASCADE;

-- =============================================================================
-- SUMMARY
-- =============================================================================
-- Dropped 4 tables:
-- 1. trade_outcomes - Redundant with trades table
-- 2. macro_series - No code references, unclear use case
-- 3. datausa_series - No code references, unclear use case
-- 4. journal_entries - No code references, feature not implemented
--
-- Kept empty tables:
-- 1. agent_runs - Used by agent infrastructure (will populate on runs)
-- 2. trade_snapshot_embeddings - RAG system (will populate from snapshots)
-- 3. insider_transactions - Alpha Intelligence feature (will populate from API)
-- 4. news_sentiment_history - Alpha Intelligence feature (will populate from API)
