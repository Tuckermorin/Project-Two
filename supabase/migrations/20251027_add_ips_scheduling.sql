-- Add Agent Job Scheduling to IPS Configurations
-- Created: 2025-10-27
-- Purpose: Allow IPS configurations to trigger automatic agent runs on a schedule

-- ============================================================================
-- 1. Add scheduling columns to ips_configurations
-- ============================================================================

ALTER TABLE ips_configurations
ADD COLUMN IF NOT EXISTS scheduling_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS schedule_cron TEXT, -- Cron expression (e.g., "0 9 * * 1-5" for weekdays at 9am)
ADD COLUMN IF NOT EXISTS schedule_times TEXT[], -- Array of times in HH:MM format (e.g., ["09:00", "16:00"])
ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS schedule_watchlist_symbols TEXT[], -- Symbols to analyze on scheduled runs
ADD COLUMN IF NOT EXISTS schedule_last_run TIMESTAMPTZ, -- Last time this IPS ran on schedule
ADD COLUMN IF NOT EXISTS schedule_next_run TIMESTAMPTZ; -- Next scheduled run time

-- ============================================================================
-- 2. Add indexes for efficient scheduling queries
-- ============================================================================

-- Index for finding IPSs that need to run
CREATE INDEX IF NOT EXISTS ips_scheduling_enabled_next_run_idx
  ON ips_configurations(scheduling_enabled, schedule_next_run)
  WHERE scheduling_enabled = TRUE;

-- ============================================================================
-- 3. Helper function to get schedulable IPSs
-- ============================================================================

CREATE OR REPLACE FUNCTION get_due_scheduled_ips()
RETURNS TABLE (
  ips_id UUID,
  ips_name TEXT,
  user_id UUID,
  symbols TEXT[],
  schedule_times TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    id as ips_id,
    name as ips_name,
    ips_configurations.user_id,
    schedule_watchlist_symbols as symbols,
    ips_configurations.schedule_times
  FROM ips_configurations
  WHERE scheduling_enabled = TRUE
    AND schedule_next_run IS NOT NULL
    AND schedule_next_run <= NOW()
  ORDER BY schedule_next_run ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Helper function to calculate next run time
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_next_run_time(
  p_schedule_times TEXT[],
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_now_local TIME;
  v_schedule_time TIME;
  v_next_run TIMESTAMPTZ;
  v_today_date DATE;
BEGIN
  -- Get current time in the specified timezone
  v_now := NOW() AT TIME ZONE p_timezone;
  v_now_local := v_now::TIME;
  v_today_date := v_now::DATE;

  -- If no schedule times, return null
  IF p_schedule_times IS NULL OR array_length(p_schedule_times, 1) = 0 THEN
    RETURN NULL;
  END IF;

  -- Find the next schedule time today
  FOR i IN 1..array_length(p_schedule_times, 1) LOOP
    v_schedule_time := p_schedule_times[i]::TIME;

    -- If this time hasn't passed today, use it
    IF v_schedule_time > v_now_local THEN
      v_next_run := (v_today_date + v_schedule_time) AT TIME ZONE p_timezone;
      RETURN v_next_run;
    END IF;
  END LOOP;

  -- All times have passed today, use first time tomorrow
  v_schedule_time := p_schedule_times[1]::TIME;
  v_next_run := ((v_today_date + INTERVAL '1 day') + v_schedule_time) AT TIME ZONE p_timezone;

  RETURN v_next_run;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Trigger to update next_run when schedule changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ips_next_run()
RETURNS TRIGGER AS $$
BEGIN
  -- If scheduling is enabled and schedule_times exist, calculate next run
  IF NEW.scheduling_enabled = TRUE AND NEW.schedule_times IS NOT NULL THEN
    NEW.schedule_next_run := calculate_next_run_time(
      NEW.schedule_times,
      COALESCE(NEW.schedule_timezone, 'America/New_York')
    );
  ELSE
    NEW.schedule_next_run := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_update_ips_next_run ON ips_configurations;

-- Create trigger
CREATE TRIGGER trigger_update_ips_next_run
  BEFORE INSERT OR UPDATE OF scheduling_enabled, schedule_times, schedule_timezone
  ON ips_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_ips_next_run();

-- ============================================================================
-- 6. Function to mark IPS as run and calculate next run time
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_ips_as_run(p_ips_id UUID)
RETURNS VOID AS $$
DECLARE
  v_schedule_times TEXT[];
  v_schedule_timezone TEXT;
BEGIN
  -- Get current schedule settings
  SELECT schedule_times, schedule_timezone
  INTO v_schedule_times, v_schedule_timezone
  FROM ips_configurations
  WHERE id = p_ips_id;

  -- Update last run and calculate next run
  UPDATE ips_configurations
  SET
    schedule_last_run = NOW(),
    schedule_next_run = calculate_next_run_time(v_schedule_times, v_schedule_timezone)
  WHERE id = p_ips_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN ips_configurations.scheduling_enabled IS
  'Whether automated agent runs are enabled for this IPS';

COMMENT ON COLUMN ips_configurations.schedule_times IS
  'Array of times in HH:MM format when agent should run (e.g., ["09:00", "16:00"])';

COMMENT ON COLUMN ips_configurations.schedule_timezone IS
  'Timezone for schedule times (e.g., America/New_York, America/Chicago)';

COMMENT ON COLUMN ips_configurations.schedule_watchlist_symbols IS
  'Symbols to analyze on scheduled runs. If null, uses user''s watchlist.';

COMMENT ON COLUMN ips_configurations.schedule_next_run IS
  'Calculated next run time based on schedule_times. Updated automatically.';

-- ============================================================================
-- 8. Example usage for testing
-- ============================================================================

-- Enable scheduling for an IPS to run weekdays at 9:00 AM and 4:00 PM ET
-- UPDATE ips_configurations
-- SET
--   scheduling_enabled = TRUE,
--   schedule_times = ARRAY['09:00', '16:00'],
--   schedule_timezone = 'America/New_York',
--   schedule_watchlist_symbols = ARRAY['AAPL', 'MSFT', 'GOOGL']
-- WHERE id = 'your-ips-id';

-- Get all IPSs that are due to run
-- SELECT * FROM get_due_scheduled_ips();

-- Mark an IPS as run (updates last_run and calculates next_run)
-- SELECT mark_ips_as_run('your-ips-id');
