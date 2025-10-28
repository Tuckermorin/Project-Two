-- Fix RLS policies for backtest tables
-- These tables need policies to allow authenticated users to insert/read their own data

-- Enable RLS on all backtest tables
ALTER TABLE ips_backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_backtest_trade_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_sentiment_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can insert their own backtest runs" ON ips_backtest_runs;
DROP POLICY IF EXISTS "Users can view their own backtest runs" ON ips_backtest_runs;
DROP POLICY IF EXISTS "Users can update their own backtest runs" ON ips_backtest_runs;

DROP POLICY IF EXISTS "Users can insert their own backtest results" ON ips_backtest_results;
DROP POLICY IF EXISTS "Users can view their own backtest results" ON ips_backtest_results;

DROP POLICY IF EXISTS "Users can insert their own backtest trade matches" ON ips_backtest_trade_matches;
DROP POLICY IF EXISTS "Users can view their own backtest trade matches" ON ips_backtest_trade_matches;

DROP POLICY IF EXISTS "Anyone can read sentiment cache" ON historical_sentiment_cache;
DROP POLICY IF EXISTS "Anyone can insert sentiment cache" ON historical_sentiment_cache;

-- Backtest Runs Policies
CREATE POLICY "Users can insert their own backtest runs"
  ON ips_backtest_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own backtest runs"
  ON ips_backtest_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own backtest runs"
  ON ips_backtest_runs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Backtest Results Policies
CREATE POLICY "Users can insert their own backtest results"
  ON ips_backtest_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ips_backtest_runs
      WHERE id = run_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own backtest results"
  ON ips_backtest_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ips_backtest_runs
      WHERE id = run_id AND user_id = auth.uid()
    )
  );

-- Backtest Trade Matches Policies
CREATE POLICY "Users can insert their own backtest trade matches"
  ON ips_backtest_trade_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ips_backtest_runs
      WHERE id = run_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own backtest trade matches"
  ON ips_backtest_trade_matches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ips_backtest_runs
      WHERE id = run_id AND user_id = auth.uid()
    )
  );

-- Historical Sentiment Cache Policies (shared across all users)
CREATE POLICY "Anyone can read sentiment cache"
  ON historical_sentiment_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert sentiment cache"
  ON historical_sentiment_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update sentiment cache"
  ON historical_sentiment_cache
  FOR UPDATE
  TO authenticated
  USING (true);

COMMENT ON POLICY "Anyone can read sentiment cache" ON historical_sentiment_cache
  IS 'Sentiment data is shared across users to reduce API calls';
COMMENT ON POLICY "Anyone can insert sentiment cache" ON historical_sentiment_cache
  IS 'Any user can cache sentiment data for reuse';
