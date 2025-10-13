import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const descriptions = [
  // Alpha Vantage factors (av- prefix)
  { id: 'av-market-cap', description: 'Total market value of company (Share Price × Shares Outstanding)' },
  { id: 'av-pe-ratio', description: 'Price to Earnings ratio - market price per share divided by EPS' },
  { id: 'av-peg-ratio', description: 'P/E ratio divided by earnings growth rate' },
  { id: 'av-book-value', description: 'Net asset value per share (Total Assets - Total Liabilities) / Shares' },
  { id: 'av-dividend-yield', description: 'Annual dividends per share divided by stock price' },
  { id: 'av-eps', description: 'Earnings Per Share - net income divided by outstanding shares' },
  { id: 'av-beta', description: 'Measure of stock volatility relative to the overall market' },
  { id: 'av-52-week-high', description: 'Highest price in the past 52 weeks' },
  { id: 'av-52-week-low', description: 'Lowest price in the past 52 weeks' },
  { id: 'av-50-day-ma', description: '50-day Simple Moving Average of closing prices' },
  { id: 'av-200-day-ma', description: '200-day Simple Moving Average of closing prices' },
  { id: 'av-profit-margin', description: 'Net income divided by revenue' },
  { id: 'av-operating-margin', description: 'Operating income divided by revenue (TTM)' },
  { id: 'av-return-on-assets', description: 'Net income divided by total assets (TTM)' },
  { id: 'av-return-on-equity', description: 'Net income divided by shareholders equity (TTM)' },
  { id: 'av-revenue-ttm', description: 'Total revenue for trailing twelve months' },
  { id: 'av-gross-profit-ttm', description: 'Revenue minus cost of goods sold (TTM)' },
  { id: 'av-diluted-eps-ttm', description: 'Diluted Earnings Per Share including all convertible securities (TTM)' },
  { id: 'av-earnings-growth-ttm', description: 'Year-over-year earnings growth rate (TTM)' },
  { id: 'av-revenue-growth-ttm', description: 'Year-over-year revenue growth rate (TTM)' },
  { id: 'av-analyst-target', description: 'Average price target from analyst estimates' },

  // Qualitative factors (qual- prefix)
  { id: 'qual-market-leadership', description: 'Company\'s position as market leader in its industry (1-5 rating)' },
  { id: 'qual-management-quality', description: 'Overall quality and competence of management team (1-5 rating)' },
  { id: 'qual-economic-moat', description: 'Competitive advantages that protect against competition (1-5 rating)' },
  { id: 'qual-competitive-position', description: 'Company\'s competitive position within its industry (1-5 rating)' },
  { id: 'qual-brand-strength', description: 'Strength and recognition of company brand (1-5 rating)' },
  { id: 'qual-innovation-rd', description: 'Investment in and effectiveness of R&D efforts (1-5 rating)' },
  { id: 'qual-regulatory-environment', description: 'Impact of regulatory environment on business (1-5 rating)' },
  { id: 'qual-esg-factors', description: 'Environmental, Social, and Governance performance (1-5 rating)' },
  { id: 'qual-customer-satisfaction', description: 'Customer satisfaction and loyalty metrics (1-5 rating)' },
  { id: 'qual-supply-chain', description: 'Resilience and reliability of supply chain (1-5 rating)' },
  { id: 'qual-geographic-diversification', description: 'Diversification of revenue across geographic regions (1-5 rating)' },
  { id: 'qual-earnings-quality', description: 'Quality and sustainability of reported earnings (1-5 rating)' },
];

async function addDescriptions() {
  console.log('Adding descriptions to all factors...\n');

  for (const { id, description } of descriptions) {
    const { error } = await supabase
      .from('factor_definitions')
      .update({ description })
      .eq('id', id);

    if (error) {
      console.error(`❌ Error updating ${id}:`, error.message);
    } else {
      console.log(`✓ Added description to ${id}`);
    }
  }

  console.log(`\n✅ All ${descriptions.length} descriptions added!`);
}

addDescriptions();
