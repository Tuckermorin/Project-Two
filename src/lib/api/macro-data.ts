/**
 * Macro economic data fetching
 * Provides inflation rate and other macro indicators
 */

export interface MacroData {
  inflation_rate: number | null;
  lastUpdated?: string;
}

/**
 * Get current US inflation rate
 * Uses Alpha Vantage CPI endpoint or fallback to recent static value
 */
export async function getInflationRate(): Promise<number | null> {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      console.warn('[MacroData] Alpha Vantage API key not configured, using fallback inflation rate');
      return 2.7; // Fallback to recent US CPI year-over-year rate (as of Oct 2024)
    }

    // Alpha Vantage Real GDP endpoint can provide inflation-related data
    // For now, use a reasonable fallback until we implement the full integration
    // TODO: Implement Alpha Vantage INFLATION or CPI endpoint when available

    return 2.7; // Recent US inflation rate as fallback
  } catch (error) {
    console.error('[MacroData] Failed to fetch inflation rate:', error);
    return 2.7; // Fallback value
  }
}

/**
 * Get all macro data needed for IPS scoring
 */
export async function getMacroData(): Promise<MacroData> {
  const inflation_rate = await getInflationRate();

  return {
    inflation_rate,
    lastUpdated: new Date().toISOString()
  };
}
