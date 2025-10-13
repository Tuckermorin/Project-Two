-- Migration: Add Insider Transactions Table
-- Created: 2025-10-10
-- Description: Stores insider transaction data from Alpha Vantage INSIDER_TRANSACTIONS API

-- Create insider_transactions table
CREATE TABLE IF NOT EXISTS insider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  transaction_date DATE NOT NULL,

  -- Executive information
  executive_name TEXT NOT NULL,
  executive_title TEXT,

  -- Transaction details
  security_type TEXT,  -- Common Stock, Stock Option Grant, etc.
  acquisition_or_disposal TEXT,  -- A (acquisition) or D (disposal)
  shares NUMERIC,
  share_price NUMERIC,
  transaction_value NUMERIC,  -- calculated: shares * share_price

  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure we don't duplicate transactions
  UNIQUE(symbol, transaction_date, executive_name, security_type, acquisition_or_disposal, shares)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_insider_trans_symbol_date ON insider_transactions(symbol, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_insider_trans_symbol ON insider_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_insider_trans_date ON insider_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_insider_trans_type ON insider_transactions(acquisition_or_disposal);

-- Add RLS policies
ALTER TABLE insider_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read
CREATE POLICY "Allow authenticated read access to insider_transactions"
  ON insider_transactions
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to insert/update
CREATE POLICY "Allow service role full access to insider_transactions"
  ON insider_transactions
  FOR ALL
  TO service_role
  USING (true);

-- Create aggregated view for easier analysis
CREATE OR REPLACE VIEW insider_activity_summary AS
SELECT
  symbol,
  DATE_TRUNC('month', transaction_date) as month,

  -- Acquisition metrics
  COUNT(*) FILTER (WHERE acquisition_or_disposal = 'A') as acquisition_count,
  COALESCE(SUM(shares) FILTER (WHERE acquisition_or_disposal = 'A'), 0) as shares_acquired,
  COALESCE(SUM(transaction_value) FILTER (WHERE acquisition_or_disposal = 'A'), 0) as value_acquired,

  -- Disposal metrics
  COUNT(*) FILTER (WHERE acquisition_or_disposal = 'D') as disposal_count,
  COALESCE(SUM(shares) FILTER (WHERE acquisition_or_disposal = 'D'), 0) as shares_disposed,
  COALESCE(SUM(transaction_value) FILTER (WHERE acquisition_or_disposal = 'D'), 0) as value_disposed,

  -- Net metrics
  COALESCE(SUM(shares) FILTER (WHERE acquisition_or_disposal = 'A'), 0) -
    COALESCE(SUM(shares) FILTER (WHERE acquisition_or_disposal = 'D'), 0) as net_shares,
  COALESCE(SUM(transaction_value) FILTER (WHERE acquisition_or_disposal = 'A'), 0) -
    COALESCE(SUM(transaction_value) FILTER (WHERE acquisition_or_disposal = 'D'), 0) as net_value,

  -- Ratios
  CASE
    WHEN COUNT(*) FILTER (WHERE acquisition_or_disposal = 'D') = 0 THEN 1.0
    WHEN COUNT(*) FILTER (WHERE acquisition_or_disposal = 'A') = 0 THEN 0.0
    ELSE COUNT(*) FILTER (WHERE acquisition_or_disposal = 'A')::NUMERIC /
         NULLIF(COUNT(*) FILTER (WHERE acquisition_or_disposal = 'D'), 0)
  END as buy_sell_ratio,

  MAX(transaction_date) as latest_transaction_date
FROM insider_transactions
GROUP BY symbol, DATE_TRUNC('month', transaction_date);

-- Add helpful comments
COMMENT ON TABLE insider_transactions IS 'Insider transaction data from Alpha Vantage INSIDER_TRANSACTIONS API';
COMMENT ON COLUMN insider_transactions.acquisition_or_disposal IS 'A = Acquisition (buy), D = Disposal (sell)';
COMMENT ON COLUMN insider_transactions.transaction_value IS 'Calculated as shares * share_price';
COMMENT ON VIEW insider_activity_summary IS 'Monthly aggregated insider activity summary per symbol';
