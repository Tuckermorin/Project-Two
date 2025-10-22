-- Fix IPS Leaderboard View
-- The original view referenced r.ips_name which doesn't exist
-- Should use br.ips_name instead

DROP VIEW IF EXISTS v_ips_leaderboard;

CREATE OR REPLACE VIEW v_ips_leaderboard AS
SELECT
  r.ips_id,
  MAX(br.ips_name) as ips_name,
  COUNT(DISTINCT br.id) as backtest_count,
  AVG(r.win_rate) as avg_win_rate,
  AVG(r.avg_roi) as avg_roi,
  AVG(r.sharpe_ratio) as avg_sharpe,
  AVG(r.total_trades) as avg_trades_analyzed,
  MAX(br.end_date) as last_tested
FROM ips_backtest_results r
JOIN ips_backtest_runs br ON r.run_id = br.id
WHERE br.status = 'completed'
GROUP BY r.ips_id
ORDER BY avg_sharpe DESC NULLS LAST, avg_roi DESC;

COMMENT ON VIEW v_ips_leaderboard IS 'Best performing IPSs ranked by Sharpe ratio and ROI';
