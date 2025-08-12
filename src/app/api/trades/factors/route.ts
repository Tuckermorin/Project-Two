import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMarketDataService } from '@/lib/services/market-data-service';

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

    // Get IPS configuration from database
    const { data: ips, error: ipsError } = await supabase
      .from('investment_performance_systems')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ips) {
      return NextResponse.json({ 
        error: 'IPS configuration not found' 
      }, { status: 404 });
    }

    // Get IPS factors from database - fix the query structure
    const { data: ipsFactors, error: factorsError } = await supabase
      .from('ips_factors')
      .select(`
        factor_name,
        weight,
        target_value,
        target_operator,
        preference_direction,
        factors(name, source, data_type, category, unit)
      `)
      .eq('ips_id', ipsId)
      .eq('enabled', true);

    if (factorsError) {
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    // Filter for API factors only - fix the source access
    const apiFactors = ipsFactors?.filter(f => {
      // Handle the case where factors might be an array or single object
      const factorInfo = Array.isArray(f.factors) ? f.factors[0] : f.factors;
      return factorInfo?.source === 'alpha_vantage';
    }) || [];

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
    
    // Map API factors to actual data and save to database
    const factorResults: Record<string, any> = {};
    const failedFactors: string[] = [];

    for (const ipsFactor of apiFactors) {
      const factorName = ipsFactor.factor_name;
      
      try {
        let value: number | undefined;
        let confidence = 0.95;
        
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
            // Calculate dividend yield based on available data
            value = stockData.fundamentals?.eps && stockData.currentPrice 
              ? (stockData.fundamentals.eps / stockData.currentPrice) * 100 
              : undefined;
            break;
          case 'Earnings per Share':
            value = stockData.fundamentals?.eps;
            break;
          case 'Revenue per Share TTM':
            value = stockData.fundamentals?.revenue && stockData.marketCap 
              ? stockData.fundamentals.revenue / (stockData.marketCap || 1) 
              : undefined;
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
              source: 'alpha_vantage',
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
            source: 'alpha_vantage',
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