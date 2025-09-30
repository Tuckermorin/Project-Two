import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMarketDataService } from '@/lib/services/market-data-service';
import type { OptionsRequestContext } from '@/lib/types/market-data';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const ipsId = searchParams.get('ipsId');
    
    if (!symbol) {
      return NextResponse.json({ 
        error: 'Missing required parameter: symbol' 
      }, { status: 400 });
    }

    if (!ipsId || ipsId === 'temp') {
      return NextResponse.json({
        success: false,
        data: {
          factors: {},
          apiStatus: 'disconnected',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Get IPS configuration from database (correct table)
    const { data: ips, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ips) {
      return NextResponse.json({ 
        error: 'IPS configuration not found' 
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
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    // Filter for API factors only using collection_method
    const apiFactors = (ipsFactors || []).filter((f: any) => (f.collection_method || 'manual') === 'api');

    if (apiFactors.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          factors: {},
          apiStatus: 'connected',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Fetch real market data
    const marketDataService = getMarketDataService();
    const stockData = await marketDataService.getUnifiedStockData(symbol, true);
    
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
      if (optionLegMeta.length === 0) return undefined;
      const available = optionLegMeta.filter((entry) => entry.data);
      if (available.length === 0) return undefined;

      const primaryMatch = available.find((entry) => entry.leg.primary && (!preferredType || entry.leg.type === preferredType));
      if (primaryMatch) return primaryMatch.data;

      if (preferredType) {
        const typeMatch = available.find((entry) => entry.leg.type === preferredType);
        if (typeMatch) return typeMatch.data;
      }

      const shortMatch = available.find((entry) => entry.leg.role === 'short');
      if (shortMatch) return shortMatch.data;

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
          default:
            console.warn(`Unmapped factor: ${factorName}`);
            failedFactors.push(factorName);
            continue;
        }

        if (value !== undefined && value !== null && !isNaN(value)) {
          // Save to factor_values table
          const { error: insertError } = await supabase
            .from('factor_values')
            .upsert({
              symbol,
              factor_name: factorName,
              value,
              source: factorSource,
              confidence,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'symbol,factor_name'
            });

          if (insertError) {
            console.error(`Failed to save factor ${factorName}:`, insertError);
          }

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

    // Log API sync status
    await supabase
      .from('api_sync_log')
      .insert({
        data_type: 'stock_factors',
        symbol,
        status: failedFactors.length === 0 ? 'success' : 
                Object.keys(factorResults).length === 0 ? 'error' : 'partial',
        records_processed: Object.keys(factorResults).length,
        error_message: failedFactors.length > 0 ? `Failed factors: ${failedFactors.join(', ')}` : null,
        created_at: new Date().toISOString()
      });

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
    
    // Fix the searchParams reference
    const { searchParams } = new URL(request.url);
    
    // Log the error
    await supabase
      .from('api_sync_log')
      .insert({
        data_type: 'stock_factors',
        symbol: searchParams.get('symbol'),
        status: 'error',
        records_processed: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        created_at: new Date().toISOString()
      });
    
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







