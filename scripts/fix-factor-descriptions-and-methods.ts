import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Add descriptions and fix collection methods
const updates = [
  // Options Greeks - Update to API with descriptions (correct IDs with opt- prefix)
  { id: 'opt-delta', description: 'Rate of change of option price with respect to underlying price', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-gamma', description: 'Rate of change of delta with respect to underlying price', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-theta', description: 'Rate of option value decay over time (time decay)', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-vega', description: 'Sensitivity of option price to changes in implied volatility', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-rho', description: 'Sensitivity of option price to changes in interest rates', collection_method: 'api', source: 'alpha_vantage_options' },

  // Options Metrics - Update to API with descriptions (correct IDs with opt- prefix)
  { id: 'opt-iv', description: 'Expected volatility of underlying asset implied by option prices', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-intrinsic-value', description: 'Difference between strike price and underlying price (if in the money)', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-open-interest', description: 'Total number of outstanding option contracts', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-volume', description: 'Number of option contracts traded during the session', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-time-value', description: 'Extrinsic value of option beyond intrinsic value', collection_method: 'api', source: 'alpha_vantage_options' },
  { id: 'opt-put-call-ratio', description: 'Ratio of put volume to call volume, indicator of market sentiment', collection_method: 'api', source: 'alpha_vantage_options' },

  // Note: IV Percentile and IV Rank in Options Metrics - update descriptions
  { id: 'opt-iv-percentile', description: 'Current IV percentile vs 1-year IV history (0-100)' },
  { id: 'opt-iv-rank', description: 'IV Rank: (Current IV - 52W Low IV) / (52W High IV - 52W Low IV) * 100' },

  // Efficiency - Already API, add descriptions
  { id: 'return-on-assets', description: 'Net income divided by total assets (TTM)' },
  { id: 'return-on-equity', description: 'Net income divided by shareholders equity (TTM)' },

  // Valuation - Update to API with descriptions
  { id: 'pe-ratio', description: 'Price to Earnings ratio - market price per share divided by EPS', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'peg-ratio', description: 'P/E ratio divided by earnings growth rate', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'book-value', description: 'Net asset value per share (Total Assets - Total Liabilities) / Shares', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'market-cap', description: 'Total market value of company (Share Price × Shares Outstanding)', collection_method: 'api', source: 'alpha_vantage' },

  // Dividends
  { id: 'dividend-yield', description: 'Annual dividends per share divided by stock price', collection_method: 'api', source: 'alpha_vantage' },

  // Earnings
  { id: 'eps', description: 'Earnings Per Share - net income divided by outstanding shares', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'diluted-eps', description: 'Diluted Earnings Per Share including all convertible securities (TTM)', collection_method: 'api', source: 'alpha_vantage' },

  // Growth
  { id: 'quarterly-earnings-growth', description: 'Year-over-year quarterly earnings growth rate', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'quarterly-revenue-growth', description: 'Year-over-year quarterly revenue growth rate', collection_method: 'api', source: 'alpha_vantage' },

  // Financial Performance
  { id: 'revenue', description: 'Total revenue for trailing twelve months', collection_method: 'api', source: 'alpha_vantage' },

  // Profitability
  { id: 'gross-profit', description: 'Revenue minus cost of goods sold (TTM)', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'operating-margin', description: 'Operating income divided by revenue (TTM)', collection_method: 'api', source: 'alpha_vantage' },
  { id: 'profit-margin', description: 'Net income divided by revenue', collection_method: 'api', source: 'alpha_vantage' },

  // Technical
  { id: '50-day-ma', description: '50-day Simple Moving Average of closing prices', collection_method: 'api', source: 'alpha_vantage' },
  { id: '200-day-ma', description: '200-day Simple Moving Average of closing prices', collection_method: 'api', source: 'alpha_vantage' },

  // Price Levels
  { id: '52-week-high', description: 'Highest price in the past 52 weeks', collection_method: 'api', source: 'alpha_vantage' },
  { id: '52-week-low', description: 'Lowest price in the past 52 weeks', collection_method: 'api', source: 'alpha_vantage' },

  // Volatility
  { id: 'beta', description: 'Measure of stock volatility relative to the overall market', collection_method: 'api', source: 'alpha_vantage' },

  // Management & Governance - Manual factors, add descriptions
  { id: 'management-quality', description: 'Overall quality and competence of management team (1-5 rating)' },
  { id: 'market-leadership', description: 'Company\'s position as market leader in its industry (1-5 rating)' },

  // Financial Health
  { id: 'earnings-quality', description: 'Quality and sustainability of reported earnings (1-5 rating)' },

  // Business Model & Industry - Manual factors, add descriptions
  { id: 'economic-moat', description: 'Competitive advantages that protect against competition (1-5 rating)' },
  { id: 'competitive-position', description: 'Company\'s competitive position within its industry (1-5 rating)' },
  { id: 'brand-strength', description: 'Strength and recognition of company brand (1-5 rating)' },
  { id: 'innovation-rd', description: 'Investment in and effectiveness of R&D efforts (1-5 rating)' },
  { id: 'customer-satisfaction', description: 'Customer satisfaction and loyalty metrics (1-5 rating)' },
  { id: 'regulatory-environment', description: 'Impact of regulatory environment on business (1-5 rating)' },
  { id: 'esg-factors', description: 'Environmental, Social, and Governance performance (1-5 rating)' },

  // Risk
  { id: 'geographic-diversification', description: 'Diversification of revenue across geographic regions (1-5 rating)' },

  // Operational
  { id: 'supply-chain-resilience', description: 'Resilience and reliability of supply chain (1-5 rating)' },

  // Analyst Ratings
  { id: 'analyst-target-price', description: 'Average price target from analyst estimates', collection_method: 'api', source: 'alpha_vantage' },
];

async function updateFactors() {
  console.log('Updating factor descriptions and collection methods...\n');

  for (const update of updates) {
    const { id, ...fields } = update;

    const { data, error } = await supabase
      .from('factor_definitions')
      .update(fields)
      .eq('id', id);

    if (error) {
      console.error(`❌ Error updating ${id}:`, error.message);
    } else {
      console.log(`✓ Updated ${id}`);
    }
  }

  console.log(`\n✅ Updated ${updates.length} factors with descriptions and collection methods!`);
}

updateFactors().catch(console.error);
