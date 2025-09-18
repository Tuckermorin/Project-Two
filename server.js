// Lightweight Express API using Ollama JS library
// Requirements:
// - Connect via Tailscale host `http://golem:11434`
// - Use models: `gpt-oss:120b` or `llama4:maverick`
// - stream: false

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Ollama } = require('ollama');

const PORT = process.env.PORT || 4000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://golem:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama4:maverick';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

const ollama = new Ollama({ host: OLLAMA_HOST });

// -------- Tool Schemas (Alpha Vantage helpers) --------
const avKey = process.env.ALPHA_VANTAGE_API_KEY;
const avBase = 'https://www.alphavantage.co/query';

const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'search_symbols',
      description:
        'Search ticker symbols by keyword using Alpha Vantage SYMBOL_SEARCH. Use to resolve a company name to a tradable symbol.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Company name or ticker query' },
          limit: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description:
        'Get latest quote (price, change, change%) for a symbol using Alpha Vantage GLOBAL_QUOTE.',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string', description: 'Ticker symbol, e.g., AAPL' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overview',
      description:
        'Fetch Company Overview for a symbol from Alpha Vantage (fundamentals like PE, PEG, PS, PB, EV/EBITDA, EPS, margins, growth, ROE/ROA).',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string', description: 'Ticker symbol' } },
        required: ['symbol'],
      },
    },
  },
];

async function avRequest(params) {
  if (!avKey) throw new Error('Missing ALPHA_VANTAGE_API_KEY');
  const url = new URL(avBase);
  url.searchParams.set('apikey', avKey);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Alpha Vantage HTTP ${r.status}`);
  const json = await r.json();
  if (json['Error Message']) throw new Error(json['Error Message']);
  if (json['Note']) throw new Error('Alpha Vantage rate limit');
  return json;
}

async function runTool(name, rawArgs) {
  try {
    switch (name) {
      case 'search_symbols': {
        const q = String(rawArgs?.query || '').trim();
        const limit = Math.max(1, Math.min(25, Number(rawArgs?.limit || 10)));
        const data = await avRequest({ function: 'SYMBOL_SEARCH', keywords: q });
        const matches = Array.isArray(data?.bestMatches) ? data.bestMatches : [];
        return matches
          .slice(0, limit)
          .map((m) => ({ symbol: m['1. symbol'], name: m['2. name'], region: m['4. region'], currency: m['8. currency'] }))
          .filter((x) => x.symbol);
      }
      case 'get_quote': {
        const sym = String(rawArgs?.symbol || '').toUpperCase();
        const data = await avRequest({ function: 'GLOBAL_QUOTE', symbol: sym });
        const q = data?.['Global Quote'] || {};
        return {
          symbol: q['01. symbol'] || sym,
          price: Number(q['05. price'] || 0),
          change: Number(q['09. change'] || 0),
          change_percent: Number(String(q['10. change percent'] || '0%').replace('%', '')),
          volume: Number(q['06. volume'] || 0),
          previous_close: Number(q['08. previous close'] || 0),
          latest_trading_day: q['07. latest trading day'] || null,
        };
      }
      case 'get_overview': {
        const sym = String(rawArgs?.symbol || '').toUpperCase();
        const o = await avRequest({ function: 'OVERVIEW', symbol: sym });
        const num = (s) => (s && s !== 'None' ? Number(s) : null);
        return {
          symbol: sym,
          fundamentals: {
            pe_ratio: num(o.PERatio),
            peg_ratio: num(o.PEGRatio),
            ps_ratio_ttm: num(o.PriceToSalesRatioTTM),
            pb_ratio: num(o.PriceToBookRatio),
            ev_to_ebitda: num(o.EVToEBITDA),
            eps_ttm: num(o.EPS),
            revenue_ttm: num(o.RevenueTTM),
            revenue_per_share_ttm: num(o.RevenuePerShareTTM),
            gross_margin_pct: num(o.GrossMarginTTM),
            operating_margin_pct: num(o.OperatingMarginTTM),
            net_margin_pct: num(o.ProfitMargin),
            roe_pct: num(o.ReturnOnEquityTTM),
            roa_pct: num(o.ReturnOnAssetsTTM),
            revenue_growth_yoy_pct: num(o.QuarterlyRevenueGrowthYOY),
            earnings_growth_yoy_pct: num(o.QuarterlyEarningsGrowthYOY),
            dividend_yield_pct: num(o.DividendYield),
            beta: num(o.Beta),
            market_cap: num(o.MarketCapitalization),
            week52_high: num(o['52WeekHigh']),
            week52_low: num(o['52WeekLow']),
          },
          lastUpdated: new Date().toISOString(),
        };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e?.message || 'Tool call failed' };
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'express-llm', host: OLLAMA_HOST });
});

app.post('/api/llm/analyze', async (req, res) => {
  try {
    const { trade, ipsName, strategyType, score, breakdown, model } = req.body || {};
    if (!trade) return res.status(400).json({ success: false, error: "Missing 'trade' in body" });

    const sys = "You are an expert options/stock trading analyst. Provide a practical, concise assessment and a single numeric score (0-100). Return STRICT JSON only.";
    const user = `Evaluate this trade and return JSON with fields: score, category (Strong|Moderate|Weak), confidence (0..1), summary, rationale_bullets[], math{max_profit,max_loss,rr_ratio,rr_display,breakevens[],collateral_required,pop_proxy,pol_proxy}, market_context{dte,iv,iv_rank}, plan{entry_notes,monitoring_triggers[],exit_plan{profit_target_pct,max_loss_cut_pct_of_max,time_exit_if_no_signal_days,roll_rules}}, suggestions[].
Strategy: ${strategyType || trade.contractType}
IPS: ${ipsName || ''}
Trade: ${JSON.stringify(trade)}`;

    const messages = [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ];

    const chosenModel = (typeof model === 'string' && model.trim()) ? model.trim() : DEFAULT_MODEL;

    // Initial call with tool schemas
    let r = await ollama.chat({ model: chosenModel, messages, stream: false, tools: toolSchemas });

    // Tool calling loop (up to 2 rounds)
    for (let round = 0; round < 2; round++) {
      const toolCalls = r?.message?.tool_calls || r?.tool_calls || [];
      if (!toolCalls || toolCalls.length === 0) break;
      for (const call of toolCalls) {
        const name = call?.function?.name || call?.name;
        const argsStr = call?.function?.arguments || call?.arguments || '{}';
        let args;
        try { args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr; } catch { args = {}; }
        const result = await runTool(String(name || ''), args);
        messages.push({ role: 'tool', name: String(name || ''), content: JSON.stringify(result) });
      }
      r = await ollama.chat({ model: chosenModel, messages, stream: false, tools: toolSchemas });
    }

    const content = r?.message?.content || '';

    // strip code fences if present
    const cleaned = String(content).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch {
      parsed = { score: score ?? 0, summary: content.slice(0, 1000), suggestions: [], confidence: 0.3, category: 'Moderate', full: { raw: content } };
    }

    return res.json({ success: true, data: parsed, model: chosenModel });
  } catch (e) {
    console.error('Express /api/llm/analyze error', e);
    return res.status(500).json({ success: false, error: e?.message || 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Express LLM server on :${PORT} -> ${OLLAMA_HOST}`);
});
