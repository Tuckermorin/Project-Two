import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { getMarketDataService } from '@/lib/services/market-data-service';
import type { OptionsRequestContext } from '@/lib/types/market-data';
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';
import { tavilySearch } from '@/lib/clients/tavily';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const ipsId = searchParams.get('ipsId');

    console.log('Factors API called with:', { symbol, ipsId });

    if (!symbol) {
      return NextResponse.json({
        error: 'Missing required parameter: symbol'
      }, { status: 400 });
    }

    if (!ipsId || ipsId === 'temp') {
      console.log('No valid IPS ID provided');
      return NextResponse.json({
        success: false,
        error: 'No valid IPS ID provided',
        data: {
          factors: {},
          apiStatus: 'disconnected',
          timestamp: new Date().toISOString()
        }
      });
    }

    // RLS automatically enforces user ownership
    const { data: ips, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ips) {
      console.error('IPS configuration not found or unauthorized:', ipsError);
      return NextResponse.json({
        error: 'IPS configuration not found or unauthorized',
        message: ipsError?.message || 'IPS does not exist or you do not have access'
      }, { status: 404 });
    }

    // Get IPS factors from database (only enabled)
    const { data: ipsFactors, error: factorsError } = await supabase
      .from('ips_factors')
      .select(`
        factor_id,
        factor_name,
        weight,
        target_value,
        target_operator,
        target_value_max,
        preference_direction,
        collection_method
      `)
      .eq('ips_id', ipsId)
      .eq('enabled', true);

    if (factorsError) {
      console.error('Failed to fetch IPS factors:', factorsError);
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    console.log(`Found ${ipsFactors?.length || 0} total factors for IPS`);

    // Filter for API factors only using collection_method
    const apiFactors = (ipsFactors || []).filter((f: any) => (f.collection_method || 'manual') === 'api');

    console.log(`Found ${apiFactors.length} API factors:`, apiFactors.map((f: any) => f.factor_name));

    if (apiFactors.length === 0) {
      console.log('No API factors configured for this IPS, returning empty factors');
      return NextResponse.json({
        success: true,
        data: {
          factors: {},
          apiStatus: 'connected',
          timestamp: new Date().toISOString(),
          message: 'No API factors configured for this IPS'
        }
      });
    }

    // Fetch real market data
    const marketDataService = getMarketDataService();
    const stockData = await marketDataService.getUnifiedStockData(symbol, true);

    // Fetch technical indicators in parallel
    const avClient = getAlphaVantageClient();
    const [sma200Data, sma50Data, momData] = await Promise.all([
      avClient.getSMA(symbol, 'daily', 200, 'close').catch(() => null),
      avClient.getSMA(symbol, 'daily', 50, 'close').catch(() => null),
      avClient.getMOM(symbol, 'daily', 10, 'close').catch(() => null),
    ]);

    // Fetch IV Rank and IV Percentile from vol_regime_daily table
    let ivData = null;
    try {
      const { data, error } = await supabase
        .from('vol_regime_daily')
        .select('iv_rank, iv_percentile')
        .eq('symbol', symbol)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        ivData = data;
      }
    } catch (error) {
      console.warn(`Failed to fetch IV data for ${symbol}:`, error);
    }

    // Fetch news sentiment
    let newsResults: any[] = [];
    try {
      const newsSearch = await tavilySearch(
        `${symbol} stock news earnings`,
        { time_range: "week", max_results: 5 }
      );
      newsResults = newsSearch.results || [];
    } catch (error) {
      console.warn(`Failed to fetch news for ${symbol}:`, error);
    }

    type OptionLeg = OptionsRequestContext['legs'][number];

    const optionFactorNames = new Set<string>([
      'Implied Volatility',
      'Delta',
      'Gamma',
      'Theta',
      'Vega',
      'Rho',
      'Option Volume',
      'Open Interest',
      'Bid-Ask Spread',
      'Time Value',
      'Intrinsic Value'
    ]);

    const optionsParam = searchParams.get('options');
    let optionsContext: OptionsRequestContext | undefined;
    if (optionsParam) {
      try {
        optionsContext = JSON.parse(optionsParam) as OptionsRequestContext;
      } catch (err) {
        console.warn('Invalid options context payload', err);
      }
    }

    const needsOptionData = apiFactors.some((factor: any) => optionFactorNames.has(factor.factor_name));
    const optionLegs: OptionLeg[] = needsOptionData && Array.isArray(optionsContext?.legs)
      ? (optionsContext!.legs as OptionLeg[]).filter((leg) =>
          leg &&
          (leg.type === 'call' || leg.type === 'put') &&
          typeof leg.strike === 'number' &&
          !Number.isNaN(leg.strike)
        )
      : [];

    const optionDataByKey = new Map<string, any>();
    const optionLegMeta: Array<{ leg: OptionLeg; key: string; expiration: string; data?: any }> = [];

    const buildLegKey = (leg: OptionLeg, expiration: string) => {
      const base = leg.id ? String(leg.id) : `${leg.type}_${leg.strike}`;
      return `${base}_${expiration}`;
    };

    if (needsOptionData && optionLegs.length > 0) {
      for (const leg of optionLegs) {
        const expirationForLeg = leg.expiration || optionsContext?.expiration;
        if (!expirationForLeg) {
          continue;
        }

        const key = buildLegKey(leg, expirationForLeg);
        try {
          const optionData = await marketDataService.getOptionsData(
            symbol,
            leg.strike,
            expirationForLeg,
            leg.type,
          );
          if (optionData) {
            optionDataByKey.set(key, optionData);
            optionLegMeta.push({ leg, key, expiration: expirationForLeg, data: optionData });
          }
        } catch (err) {
          console.warn('Failed to load option leg data', leg, err);
        }
      }
    }

    const selectOptionData = (preferredType?: 'call' | 'put') => {
      if (optionLegMeta.length === 0) {
        console.log('No option leg metadata available');
        return undefined;
      }
      const available = optionLegMeta.filter((entry) => entry.data);
      if (available.length === 0) {
        console.log('No option data available in leg metadata');
        return undefined;
      }

      const primaryMatch = available.find((entry) => entry.leg.primary && (!preferredType || entry.leg.type === preferredType));
      if (primaryMatch) {
        console.log('Using primary leg for option data:', primaryMatch.leg);
        return primaryMatch.data;
      }

      if (preferredType) {
        const typeMatch = available.find((entry) => entry.leg.type === preferredType);
        if (typeMatch) {
          console.log('Using type-matched leg for option data:', typeMatch.leg);
          return typeMatch.data;
        }
      }

      const shortMatch = available.find((entry) => entry.leg.role === 'short');
      if (shortMatch) {
        console.log('Using short leg for option data:', shortMatch.leg);
        return shortMatch.data;
      }

      console.log('Using first available leg for option data:', available[0].leg);
      return available[0].data;
    };

    const toNumber = (input: number | null | undefined): number | undefined =>
      typeof input === 'number' && Number.isFinite(input) ? input : undefined;
    // Map API factors to actual data and save to database
    const factorResults: Record<string, any> = {};
    const failedFactors: string[] = [];

    for (const ipsFactor of apiFactors) {
      const factorName = ipsFactor.factor_name;
      const isOptionsFactor = optionFactorNames.has(factorName);
      
      try {
        let value: number | undefined;
        let confidence = 0.95;
        const factorSource = isOptionsFactor ? 'alpha_vantage_options' : 'alpha_vantage';
        
        switch (factorName) {
          case 'P/E Ratio':
            // Calculate P/E if not directly available
            value = stockData.fundamentals?.eps && stockData.currentPrice 
              ? stockData.currentPrice / stockData.fundamentals.eps 
              : undefined;
            break;
          case 'Beta':
            value = stockData.beta;
            break;
          case 'Market Capitalization':
            value = stockData.marketCap;
            break;
          case 'Quarterly Revenue Growth YoY':
            value = stockData.fundamentals?.revenueGrowth;
            break;
          case 'Return on Equity TTM':
            value = stockData.fundamentals?.roe;
            break;
          case 'Return on Assets TTM':
            value = stockData.fundamentals?.roa;
            break;
          case 'Dividend Yield':
            value = stockData.fundamentals?.dividendYield;
            break;
          case 'Earnings per Share':
            value = stockData.fundamentals?.eps;
            break;
          case 'Revenue per Share TTM':
            value = (stockData.fundamentals as any)?.revenuePerShareTTM;
            break;
          case '52 Week High':
          case '52-Week High':
            value = stockData.week52High;
            break;
          case '52 Week Low':
          case '52-Week Low':
            value = stockData.week52Low;
            break;
          case 'Volume':
            value = stockData.volume;
            break;
          case 'Profit Margin':
            value = stockData.fundamentals?.netMargin;
            break;
          case 'Operating Margin TTM':
            value = stockData.fundamentals?.operatingMargin;
            break;
          case 'Gross Profit TTM':
            value = stockData.fundamentals?.grossMargin;
            break;
          case 'Implied Volatility': {
            const optionData = selectOptionData();
            const iv = optionData?.greeks?.impliedVolatility;
            value = typeof iv === 'number' ? iv * 100 : undefined;
            break;
          }
          case 'Delta': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.greeks?.delta);
            break;
          }
          case 'Gamma': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.greeks?.gamma);
            break;
          }
          case 'Theta': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.greeks?.theta);
            break;
          }
          case 'Vega': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.greeks?.vega);
            break;
          }
          case 'Rho': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.greeks?.rho);
            break;
          }
          case 'Option Volume': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.volume);
            break;
          }
          case 'Open Interest': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.openInterest);
            break;
          }
          case 'Bid-Ask Spread': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.bidAskSpread);
            break;
          }
          case 'Time Value': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.timeValue);
            break;
          }
          case 'Intrinsic Value': {
            const optionData = selectOptionData();
            value = toNumber(optionData?.intrinsicValue);
            break;
          }
          case '52W Range Position': {
            const high = stockData.week52High;
            const low = stockData.week52Low;
            const currentPrice = stockData.currentPrice;
            if (high && low && currentPrice && high > low) {
              value = (currentPrice - low) / (high - low);
            }
            break;
          }
          case 'Distance from 52W High': {
            const high = stockData.week52High;
            const currentPrice = stockData.currentPrice;
            if (high && currentPrice && high > 0) {
              value = ((high - currentPrice) / high) * 100;
            }
            break;
          }
          case '200 Day Moving Average': {
            const sma200 = sma200Data;
            const currentPrice = stockData.currentPrice;
            if (sma200 && currentPrice && sma200 > 0) {
              value = currentPrice / sma200;
            }
            break;
          }
          case '50 Day Moving Average': {
            const sma50 = sma50Data;
            const currentPrice = stockData.currentPrice;
            if (sma50 && currentPrice && sma50 > 0) {
              value = currentPrice / sma50;
            }
            break;
          }
          case 'Momentum': {
            value = momData !== null && momData !== undefined ? momData : undefined;
            break;
          }
          case 'Market Cap Category': {
            const marketCap = stockData.marketCap;
            if (marketCap && marketCap > 0) {
              // 1=Micro (<$300M), 2=Small ($300M-$2B), 3=Mid ($2B-$10B), 4=Large ($10B-$200B), 5=Mega (>$200B)
              let category = 1;
              if (marketCap >= 200_000_000_000) category = 5;
              else if (marketCap >= 10_000_000_000) category = 4;
              else if (marketCap >= 2_000_000_000) category = 3;
              else if (marketCap >= 300_000_000) category = 2;
              value = category;
            }
            break;
          }
          case 'Analyst Rating Average': {
            const targetPrice = (stockData.fundamentals as any)?.analystTargetPrice;
            const currentPrice = stockData.currentPrice;
            if (targetPrice && currentPrice && currentPrice > 0) {
              value = ((targetPrice - currentPrice) / currentPrice) * 100;
            }
            break;
          }
          case 'IV Rank': {
            value = ivData?.iv_rank || undefined;
            break;
          }
          case 'IV Percentile': {
            value = ivData?.iv_percentile || undefined;
            break;
          }
          case 'News Sentiment Score': {
            if (newsResults.length > 0) {
              const avgSentiment = newsResults.reduce((sum: number, n: any) => {
                const snippet = (n.snippet || '').toLowerCase();
                let score = 0;
                if (snippet.match(/\b(strong|growth|upgrade|beat|positive|rally)\b/)) score += 1;
                if (snippet.match(/\b(weak|decline|downgrade|miss|negative|drop)\b/)) score -= 1;
                return sum + score;
              }, 0) / newsResults.length;
              value = avgSentiment;
            }
            break;
          }
          case 'News Volume': {
            value = newsResults.length;
            break;
          }
          case 'Social Media Sentiment': {
            // Not available - return undefined to mark as failed
            value = undefined;
            break;
          }
          default:
            console.warn(`Unmapped factor: ${factorName}`);
            failedFactors.push(factorName);
            continue;
        }

        if (value !== undefined && value !== null && !isNaN(value)) {
          // Return factor value (no need to save to database for display purposes)
          factorResults[factorName] = {
            value,
            source: factorSource,
            confidence,
            weight: ipsFactor.weight,
            lastUpdated: new Date().toISOString()
          };
        } else {
          failedFactors.push(factorName);
        }
      } catch (error) {
        console.error(`Error processing factor ${factorName}:`, error);
        failedFactors.push(factorName);
      }
    }

    const apiStatus = failedFactors.length === 0 ? 'connected' : 
                     Object.keys(factorResults).length === 0 ? 'disconnected' : 'partial';

    return NextResponse.json({
      success: Object.keys(factorResults).length > 0,
      data: {
        factors: factorResults,
        apiStatus,
        failedFactors: failedFactors.length > 0 ? failedFactors : undefined,
        timestamp: new Date().toISOString(),
        message: failedFactors.length > 0 ? 
          `Partial success: ${failedFactors.length} factors failed to load` : 
          'All factors loaded successfully'
      }
    });

  } catch (error) {
    console.error('Error fetching factors:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch factors',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tradeId, factorName, value, source, symbol } = body;

    if (!factorName || value === undefined || !symbol) {
      return NextResponse.json({
        error: 'Missing required fields: factorName, value, symbol'
      }, { status: 400 });
    }

    // Save factor override to database
    const { error: insertError } = await supabase
      .from('factor_values')
      .upsert({
        symbol,
        factor_name: factorName,
        value,
        source: source || 'manual_override',
        confidence: 0.7, // Lower confidence for manual overrides
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'symbol,factor_name'
      });

    if (insertError) {
      throw new Error(`Failed to save factor: ${insertError.message}`);
    }

    // If tradeId provided, also save to trade_factors
    if (tradeId) {
      const { error: tradeFactorError } = await supabase
        .from('trade_factors')
        .upsert({
          trade_id: tradeId,
          factor_name: factorName,
          factor_value: value,
          source: source || 'manual_override',
          confidence: 0.7,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'trade_id,factor_name'
        });

      if (tradeFactorError) {
        console.error('Failed to save trade factor:', tradeFactorError);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Factor saved successfully'
    });

  } catch (error) {
    console.error('Error saving factor:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to save factor', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}







