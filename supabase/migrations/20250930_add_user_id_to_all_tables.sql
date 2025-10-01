-- Add user_id to all tables and set up Row Level Security
-- Run this migration to reset the database and tie all data to users

-- 1. Add user_id to ips table
ALTER TABLE ips ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ips_user_id_idx ON ips(user_id);

-- 2. Add user_id to ips_factors table
ALTER TABLE ips_factors ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ips_factors_user_id_idx ON ips_factors(user_id);

-- 3. Add user_id to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS trades_user_id_idx ON trades(user_id);

-- 4. Add user_id to ips_score_calculations table
ALTER TABLE ips_score_calculations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ips_score_calculations_user_id_idx ON ips_score_calculations(user_id);

-- 5. Add user_id to ai_trade_analyses table
ALTER TABLE ai_trade_analyses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ai_trade_analyses_user_id_idx ON ai_trade_analyses(user_id);

-- Enable Row Level Security on all tables
ALTER TABLE ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_score_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_trade_analyses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can only see their own IPS" ON ips;
DROP POLICY IF EXISTS "Users can only insert their own IPS" ON ips;
DROP POLICY IF EXISTS "Users can only update their own IPS" ON ips;
DROP POLICY IF EXISTS "Users can only delete their own IPS" ON ips;

DROP POLICY IF EXISTS "Users can only see their own IPS factors" ON ips_factors;
DROP POLICY IF EXISTS "Users can only insert their own IPS factors" ON ips_factors;
DROP POLICY IF EXISTS "Users can only update their own IPS factors" ON ips_factors;
DROP POLICY IF EXISTS "Users can only delete their own IPS factors" ON ips_factors;

DROP POLICY IF EXISTS "Users can only see their own trades" ON trades;
DROP POLICY IF EXISTS "Users can only insert their own trades" ON trades;
DROP POLICY IF EXISTS "Users can only update their own trades" ON trades;
DROP POLICY IF EXISTS "Users can only delete their own trades" ON trades;

DROP POLICY IF EXISTS "Users can only see their own score calculations" ON ips_score_calculations;
DROP POLICY IF EXISTS "Users can only insert their own score calculations" ON ips_score_calculations;
DROP POLICY IF EXISTS "Users can only update their own score calculations" ON ips_score_calculations;
DROP POLICY IF EXISTS "Users can only delete their own score calculations" ON ips_score_calculations;

DROP POLICY IF EXISTS "Users can only see their own AI analyses" ON ai_trade_analyses;
DROP POLICY IF EXISTS "Users can only insert their own AI analyses" ON ai_trade_analyses;
DROP POLICY IF EXISTS "Users can only update their own AI analyses" ON ai_trade_analyses;
DROP POLICY IF EXISTS "Users can only delete their own AI analyses" ON ai_trade_analyses;

-- Create RLS policies for ips table
CREATE POLICY "Users can only see their own IPS"
  ON ips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own IPS"
  ON ips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own IPS"
  ON ips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own IPS"
  ON ips FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for ips_factors table
CREATE POLICY "Users can only see their own IPS factors"
  ON ips_factors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own IPS factors"
  ON ips_factors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own IPS factors"
  ON ips_factors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own IPS factors"
  ON ips_factors FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for trades table
CREATE POLICY "Users can only see their own trades"
  ON trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own trades"
  ON trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own trades"
  ON trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own trades"
  ON trades FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for ips_score_calculations table
CREATE POLICY "Users can only see their own score calculations"
  ON ips_score_calculations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own score calculations"
  ON ips_score_calculations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own score calculations"
  ON ips_score_calculations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own score calculations"
  ON ips_score_calculations FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for ai_trade_analyses table
CREATE POLICY "Users can only see their own AI analyses"
  ON ai_trade_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own AI analyses"
  ON ai_trade_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own AI analyses"
  ON ai_trade_analyses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own AI analyses"
  ON ai_trade_analyses FOR DELETE
  USING (auth.uid() = user_id);

-- Clean up old data (OPTIONAL - uncomment if you want to delete all existing data)
-- DELETE FROM ai_trade_analyses;
-- DELETE FROM ips_score_calculations;
-- DELETE FROM trades;
-- DELETE FROM ips_factors;
-- DELETE FROM ips;
-- DELETE FROM watchlist_items;
