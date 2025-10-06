/**
 * Factor-aware query patterns for IPS/PCS trade analysis
 * Per CODEX.md best practices
 */

import { tavilySearch, tavilyExtract, TavilySearchOptions } from "./tavily";

// Trusted financial domains for domain filtering
const TRUSTED_FINANCIAL_DOMAINS = [
  "sec.gov",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "marketwatch.com",
  "seekingalpha.com",
  "finance.yahoo.com",
  "barrons.com",
  "cnbc.com",
  "ft.com",
];

// Rumor/unreliable domains to exclude
const EXCLUDE_DOMAINS = [
  "fool.com",
  "benzinga.com",
];

/**
 * Catalyst Query - Earnings, guidance, product launches
 */
export async function queryCatalysts(symbol: string, daysBack: number = 7) {
  const companyDomain = await getCompanyInvestorDomain(symbol);

  const queries = [
    `${symbol} earnings guidance`,
    `${symbol} earnings date announcement`,
    `${symbol} product launch event`,
  ];

  const options: TavilySearchOptions = {
    topic: "news",
    search_depth: "advanced",
    chunks_per_source: 3,
    max_results: 8,
    days: daysBack,
    include_domains: companyDomain
      ? [...TRUSTED_FINANCIAL_DOMAINS, companyDomain]
      : TRUSTED_FINANCIAL_DOMAINS,
  };

  const results = await Promise.all(
    queries.map(q => tavilySearch(q, options))
  );

  // Flatten and deduplicate by URL
  const allResults = results.flatMap(r => r.results);
  const uniqueResults = Array.from(
    new Map(allResults.map(r => [r.url, r])).values()
  );

  // Filter by score >= 0.6
  return uniqueResults.filter(r => (r.score ?? 0) >= 0.6);
}

/**
 * Downgrade/Price Target Query - Analyst activity
 */
export async function queryAnalystActivity(symbol: string, daysBack: number = 7) {
  const queries = [
    `${symbol} downgrade OR upgrade analyst`,
    `${symbol} price target change`,
    `${symbol} analyst rating`,
  ];

  const options: TavilySearchOptions = {
    topic: "news",
    search_depth: "advanced",
    chunks_per_source: 3,
    max_results: 8,
    days: daysBack,
    include_domains: TRUSTED_FINANCIAL_DOMAINS,
    exclude_domains: EXCLUDE_DOMAINS,
  };

  const results = await Promise.all(
    queries.map(q => tavilySearch(q, options))
  );

  const allResults = results.flatMap(r => r.results);
  const uniqueResults = Array.from(
    new Map(allResults.map(r => [r.url, r])).values()
  );

  return uniqueResults.filter(r => (r.score ?? 0) >= 0.6);
}

/**
 * SEC Regulatory Query - 8-K, 10-Q, 10-K filings
 */
export async function querySECFilings(symbol: string, daysBack: number = 90) {
  const queries = [
    `${symbol} 8-K filing`,
    `${symbol} 10-Q quarterly report`,
    `${symbol} 10-K annual report`,
  ];

  const options: TavilySearchOptions = {
    topic: "news",
    search_depth: "advanced",
    chunks_per_source: 3,
    max_results: 10,
    days: daysBack,
    include_domains: ["sec.gov"],
  };

  const results = await Promise.all(
    queries.map(q => tavilySearch(q, options))
  );

  const allResults = results.flatMap(r => r.results);
  return Array.from(
    new Map(allResults.map(r => [r.url, r])).values()
  );
}

/**
 * Operational Risk Query - Supply chain, margin, competition
 */
export async function queryOperationalRisks(symbol: string, daysBack: number = 30) {
  const queries = [
    `${symbol} supply chain disruption`,
    `${symbol} margin compression pressure`,
    `${symbol} competition competitive threat`,
    `${symbol} regulatory investigation`,
  ];

  const options: TavilySearchOptions = {
    topic: "news",
    search_depth: "advanced",
    chunks_per_source: 3,
    max_results: 8,
    days: daysBack,
    include_domains: TRUSTED_FINANCIAL_DOMAINS,
  };

  const results = await Promise.all(
    queries.map(q => tavilySearch(q, options))
  );

  const allResults = results.flatMap(r => r.results);
  const uniqueResults = Array.from(
    new Map(allResults.map(r => [r.url, r])).values()
  );

  return uniqueResults.filter(r => (r.score ?? 0) >= 0.5);
}

/**
 * Two-step ingest: Search → Filter by score → Extract
 * Returns markdown content for RAG ingestion
 */
export async function twoStepIngest(
  symbol: string,
  daysBack: number = 7,
  scoreThreshold: number = 0.6
) {
  console.log(`[Two-Step Ingest] Starting for ${symbol} (${daysBack} days back)`);

  // Step 1: Batch all sub-queries concurrently
  const [catalysts, analysts, sec, risks] = await Promise.all([
    queryCatalysts(symbol, daysBack),
    queryAnalystActivity(symbol, daysBack),
    querySECFilings(symbol, daysBack),
    queryOperationalRisks(symbol, daysBack),
  ]);

  // Combine and deduplicate
  const allResults = [...catalysts, ...analysts, ...sec, ...risks];
  const uniqueResults = Array.from(
    new Map(allResults.map(r => [r.url, r])).values()
  );

  // Filter by score and trusted domains
  const filteredResults = uniqueResults.filter(r => (r.score ?? 0) >= scoreThreshold);

  console.log(`[Two-Step Ingest] Found ${filteredResults.length} high-quality URLs for ${symbol}`);

  if (filteredResults.length === 0) {
    return {
      symbol,
      documents: [],
      metadata: {
        totalUrls: 0,
        extractedUrls: 0,
        failedUrls: 0,
      },
    };
  }

  // Step 2: Extract content from filtered URLs
  // Use advanced depth for SEC and investor pages
  const secUrls = filteredResults
    .filter(r => r.url.includes("sec.gov") || r.url.includes("investor."))
    .map(r => r.url);

  const otherUrls = filteredResults
    .filter(r => !secUrls.includes(r.url))
    .map(r => r.url);

  const extractPromises = [];

  if (secUrls.length > 0) {
    extractPromises.push(
      tavilyExtract({
        urls: secUrls,
        extract_depth: "advanced",
        format: "markdown",
        include_images: false,
      })
    );
  }

  if (otherUrls.length > 0) {
    extractPromises.push(
      tavilyExtract({
        urls: otherUrls,
        extract_depth: "basic",
        format: "markdown",
        include_images: false,
      })
    );
  }

  const extractResults = await Promise.all(extractPromises);
  const allExtracts = extractResults.flatMap(r => r.results);

  // Build documents with metadata
  const documents = allExtracts
    .filter((e: any) => e.success)
    .map((e: any) => {
      const originalResult = filteredResults.find(r => r.url === e.url);
      return {
        url: e.url,
        content: e.raw_content || e.content,
        metadata: {
          symbol,
          publishedDate: originalResult?.publishedAt || null,
          score: originalResult?.score || 0,
          title: originalResult?.title || "",
          snippet: originalResult?.snippet || "",
          domain: new URL(e.url).hostname,
          extractedAt: new Date().toISOString(),
        },
      };
    });

  console.log(`[Two-Step Ingest] Extracted ${documents.length}/${filteredResults.length} URLs successfully`);

  return {
    symbol,
    documents,
    metadata: {
      totalUrls: filteredResults.length,
      extractedUrls: documents.length,
      failedUrls: filteredResults.length - documents.length,
    },
  };
}

/**
 * Helper: Get company investor relations domain
 * Tries to find the investor.{company}.com domain
 */
async function getCompanyInvestorDomain(symbol: string): Promise<string | null> {
  try {
    const query = `${symbol} investor relations site`;
    const result = await tavilySearch(query, {
      max_results: 3,
      search_depth: "basic",
    });

    // Look for investor.* domains
    for (const r of result.results) {
      const match = r.url.match(/investor\.[a-z0-9-]+\.(com|net|org)/i);
      if (match) {
        return match[0];
      }
    }

    return null;
  } catch (error) {
    console.error(`[getCompanyInvestorDomain] Error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Compute news volume z-score
 * Used for "Untradeable if spike > X" guardrail
 */
export function computeNewsVolumeZScore(
  recentArticleCount: number,
  historicalMean: number,
  historicalStdDev: number
): number {
  if (historicalStdDev === 0) return 0;
  return (recentArticleCount - historicalMean) / historicalStdDev;
}

/**
 * Export all factor queries as a batch
 */
export async function queryAllFactors(symbol: string, daysBack: number = 7) {
  console.log(`[Query All Factors] Starting batch queries for ${symbol}`);

  const [catalysts, analysts, sec, risks] = await Promise.all([
    queryCatalysts(symbol, daysBack),
    queryAnalystActivity(symbol, daysBack),
    querySECFilings(symbol, 90), // SEC filings look back 90 days
    queryOperationalRisks(symbol, 30), // Operational risks look back 30 days
  ]);

  return {
    symbol,
    catalysts,
    analysts,
    sec,
    risks,
    totalArticles: catalysts.length + analysts.length + sec.length + risks.length,
  };
}
