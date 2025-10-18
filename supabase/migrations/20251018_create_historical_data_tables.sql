-- Historical Options Data Storage
-- Stores complete historical options chains for backtesting and RAG

CREATE TABLE IF NOT EXISTS historical_options_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,

  -- Contract details
  expiration_date DATE NOT NULL,
  strike DECIMAL(10, 2) NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),

  -- Pricing
  bid DECIMAL(10, 4),
  ask DECIMAL(10, 4),
  last DECIMAL(10, 4),
  mark DECIMAL(10, 4),

  -- Volume & Interest
  volume INTEGER,
  open_interest INTEGER,
  bid_size INTEGER,
  ask_size INTEGER,

  -- Greeks
  delta DECIMAL(10, 6),
  gamma DECIMAL(10, 6),
  theta DECIMAL(10, 6),
  vega DECIMAL(10, 6),
  rho DECIMAL(10, 6),
  implied_volatility DECIMAL(10, 6),

  -- Metadata
  dte INTEGER GENERATED ALWAYS AS (expiration_date - snapshot_date) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for fast querying
  CONSTRAINT unique_historical_option UNIQUE (symbol, contract_id, snapshot_date)
);

CREATE INDEX idx_historical_options_symbol_date ON historical_options_data(symbol, snapshot_date DESC);
CREATE INDEX idx_historical_options_expiration ON historical_options_data(expiration_date);
CREATE INDEX idx_historical_options_dte ON historical_options_data(dte);
CREATE INDEX idx_historical_options_delta ON historical_options_data(delta) WHERE delta IS NOT NULL;
CREATE INDEX idx_historical_options_strike ON historical_options_data(strike);

COMMENT ON TABLE historical_options_data IS 'Historical options chain data from Alpha Vantage for backtesting and RAG';

-- Historical Stock Price Data
-- Stores daily OHLCV data with adjustments

CREATE TABLE IF NOT EXISTS historical_stock_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  date DATE NOT NULL,

  -- OHLCV
  open DECIMAL(12, 4) NOT NULL,
  high DECIMAL(12, 4) NOT NULL,
  low DECIMAL(12, 4) NOT NULL,
  close DECIMAL(12, 4) NOT NULL,
  volume BIGINT NOT NULL,

  -- Adjusted data
  adjusted_close DECIMAL(12, 4),
  dividend_amount DECIMAL(10, 4) DEFAULT 0,
  split_coefficient DECIMAL(10, 4) DEFAULT 1,

  -- Calculated fields
  daily_return DECIMAL(10, 6),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_historical_stock UNIQUE (symbol, date)
);

CREATE INDEX idx_historical_stock_symbol_date ON historical_stock_data(symbol, date DESC);
CREATE INDEX idx_historical_stock_date ON historical_stock_data(date DESC);

COMMENT ON TABLE historical_stock_data IS 'Historical daily stock price data from Alpha Vantage';

-- Historical Intraday Data
-- Stores intraday price data for timing analysis

CREATE TABLE IF NOT EXISTS historical_intraday_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('1min', '5min', '15min', '30min', '60min')),

  -- OHLCV
  open DECIMAL(12, 4) NOT NULL,
  high DECIMAL(12, 4) NOT NULL,
  low DECIMAL(12, 4) NOT NULL,
  close DECIMAL(12, 4) NOT NULL,
  volume BIGINT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_historical_intraday UNIQUE (symbol, timestamp, interval)
);

CREATE INDEX idx_historical_intraday_symbol_time ON historical_intraday_data(symbol, timestamp DESC);
CREATE INDEX idx_historical_intraday_interval ON historical_intraday_data(interval);

COMMENT ON TABLE historical_intraday_data IS 'Historical intraday price data for entry/exit timing analysis';

-- Backfill Progress Tracking
-- Tracks what data has been collected to avoid re-fetching

CREATE TABLE IF NOT EXISTS historical_data_backfill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('options', 'daily', 'intraday')),

  -- Date range covered
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Progress tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  records_collected INTEGER DEFAULT 0,
  error_message TEXT,

  -- Metadata
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_backfill_task UNIQUE (symbol, data_type, start_date, end_date)
);

CREATE INDEX idx_backfill_progress_symbol ON historical_data_backfill_progress(symbol);
CREATE INDEX idx_backfill_progress_status ON historical_data_backfill_progress(status);

COMMENT ON TABLE historical_data_backfill_progress IS 'Tracks progress of historical data collection';

-- Historical Spread Analysis
-- Pre-computed spread analysis for fast RAG retrieval

CREATE TABLE IF NOT EXISTS historical_spread_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  snapshot_date DATE NOT NULL,

  -- Spread definition
  strategy_type TEXT NOT NULL,
  short_strike DECIMAL(10, 2) NOT NULL,
  long_strike DECIMAL(10, 2) NOT NULL,
  expiration_date DATE NOT NULL,

  -- Spread metrics at entry
  credit_received DECIMAL(10, 4),
  max_profit DECIMAL(10, 4),
  max_loss DECIMAL(10, 4),
  roi DECIMAL(10, 2),
  pop DECIMAL(10, 2),

  -- Greeks at entry
  delta DECIMAL(10, 6),
  theta DECIMAL(10, 6),
  vega DECIMAL(10, 6),
  gamma DECIMAL(10, 6),

  -- Outcome (if we have follow-up data)
  actual_pl DECIMAL(10, 4),
  actual_pl_percent DECIMAL(10, 2),
  exit_date DATE,
  exit_reason TEXT,

  -- IPS score at entry
  ips_score INTEGER,
  ips_breakdown JSONB,

  -- Market context
  underlying_price DECIMAL(12, 4),
  iv_rank DECIMAL(10, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_historical_spread UNIQUE (symbol, snapshot_date, short_strike, long_strike, expiration_date)
);

CREATE INDEX idx_historical_spread_symbol_date ON historical_spread_analysis(symbol, snapshot_date DESC);
CREATE INDEX idx_historical_spread_ips_score ON historical_spread_analysis(ips_score DESC) WHERE ips_score IS NOT NULL;
CREATE INDEX idx_historical_spread_delta ON historical_spread_analysis(delta) WHERE delta BETWEEN 0.10 AND 0.20;
CREATE INDEX idx_historical_spread_outcome ON historical_spread_analysis(actual_pl_percent) WHERE actual_pl_percent IS NOT NULL;

COMMENT ON TABLE historical_spread_analysis IS 'Pre-analyzed historical spreads for RAG and backtesting';

-- Enable RLS (adjust as needed for your security model)
ALTER TABLE historical_options_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_stock_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_intraday_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_data_backfill_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_spread_analysis ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for background jobs)
CREATE POLICY "Service role has full access to historical_options_data"
  ON historical_options_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to historical_stock_data"
  ON historical_stock_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to historical_intraday_data"
  ON historical_intraday_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to backfill_progress"
  ON historical_data_backfill_progress
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to historical_spread_analysis"
  ON historical_spread_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Read access for authenticated users (if you want users to query historical data)
CREATE POLICY "Users can read historical_options_data"
  ON historical_options_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can read historical_stock_data"
  ON historical_stock_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can read historical_spread_analysis"
  ON historical_spread_analysis
  FOR SELECT
  TO authenticated
  USING (true);
