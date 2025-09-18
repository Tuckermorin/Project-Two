# Tenxiv — AI-Enhanced Trade Analysis

Focused trade journaling with IPS‑weighted scoring and an Express API that integrates with Ollama for structured, JSON-first A.I. reasoning.

What's new:
- Alpha Vantage ticker search in the New Trade form (typeahead powered by SYMBOL_SEARCH).
- API factor auto‑fetch once a symbol is chosen.
- Ollama tool‑calling for market lookups during AI analysis.

## UI Snapshots
The A.I. is used once a trade is entered and scored based off an Investment Policy.

![Running analysis](public/screenshots/Scored_Trade_Running_Analysis.png)

Once the "Run A.I. Analysis is clicked it will make a call to the A.I. (Ollama or GPT).
![Scored trade](public/screenshots/Scored_Trade.png)

The output is a simplifed analysis. The system prompt is instructed to keep it short, but it provides a more extensive version that can be selected.
![Simplified analysis](public/screenshots/Ai_Analysis_Simplified.png)

This is a screenshot of what a detailed analysis looks like.
![Detailed analysis](public/screenshots/Ai_Analysis_Detailed.png)

## Walkthrough
<video src="/screenshots/Tenxiv_AI_Walkthrough_V1.mp4" controls playsinline muted style="max-width:100%;height:auto;"></video>
 
If the embed doesn’t load, download/watch:
`public/screenshots/Tenxiv_AI_Walkthrough_V1.mp4`

## Trade Scoring Flow

- Create IPS: define factors and weights (`POST /api/ips`).
- Load factors for a symbol: `GET /api/trades/factors?symbol=SYM&ipsId=...`.
- Compute IPS score: `POST /api/trades/score` with `ipsId` and `factorValues`.
- Create trade: `POST /api/trades` with `userId`, `ipsId`, `tradeData`, and optional `ipsScore/scoreId`.
- Manage lifecycle: `GET /api/trades`, `PATCH /api/trades`, `DELETE /api/trades`.

## API Endpoints (LLM + IPS/Trades)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Express: health check for LLM server. |
| POST | `/api/llm/analyze` | Express: analyze a trade via Ollama (JSON result). |
| POST | `/api/ips` | Create an IPS with factor rows (ids or names resolved). |
| GET | `/api/ips` | List IPS configurations (with factor counts). |
| PUT | `/api/ips` | Update an IPS and replace factors. |
| GET | `/api/ips/[id]` | Retrieve a single IPS with factors. |
| GET | `/api/ips/[id]/factors` | UI‑ready factor shape for a specific IPS. |
| GET | `/api/trades` | List trades (filter by `userId`, `status`, or `id`). |
| POST | `/api/trades` | Create a prospective trade and persist metrics. |
| PATCH | `/api/trades` | Bulk update trade status; stamps `entry_date` on `active`. |
| DELETE | `/api/trades` | Bulk delete trades. |
| POST | `/api/trades/score` | Compute IPS weighted score from factor values. |
| GET | `/api/trades/factors` | Fetch factor values for a symbol under an IPS. |
| POST | `/api/trades/factors` | Save/override a single factor value. |

## Environment

- `ALPHA_VANTAGE_API_KEY` required for quotes, fundamentals and search.
- Optional: `ALPHA_VANTAGE_MIN_DELAY_MS` tiny throttle between sequential AV calls (default 100ms).
- Optional: `ALPHA_VANTAGE_DAILY_BUDGET` local guard for `/api/market-data` route (default 50000).

LLM / Express server:
- `OLLAMA_HOST` (default `http://golem:11434`) — connect via Tailscale
- `OLLAMA_MODEL` (recommended `gpt-oss:120b` or `llama4:maverick`)

Run locally:
- `npm run server` (starts Express at `http://localhost:4000`)
- `npm run dev` (starts Next.js)

Postman usage:
- Import `POST /api/llm/analyze` and send a JSON body:
```
{
  "trade": { "symbol": "AAPL", "contractType": "put-credit-spread", "expirationDate": "2025-10-18", "numberOfContracts": 1, "shortPutStrike": 190, "longPutStrike": 185, "creditReceived": 1.25 },
  "ipsName": "PCS Conservative",
  "strategyType": "put-credit-spread",
  "model": "llama4:maverick"
}
```
Response is strict JSON with `score`, `summary`, `rationale_bullets`, `math`, `market_context`, `plan`, and `suggestions`.

## Tool Calling (Express)

- Tools are defined and passed to Ollama via the `tools` parameter in `server.js`:
  - `search_symbols(query, limit?)`: Alpha Vantage SYMBOL_SEARCH.
  - `get_quote(symbol)`: Alpha Vantage GLOBAL_QUOTE.
  - `get_overview(symbol)`: Alpha Vantage OVERVIEW fundamentals.
- When the model requests a tool call, the server executes the function (fetches data from Alpha Vantage), then appends a `tool` role message containing the JSON result and calls Ollama again to let the model incorporate the output.
- The server preserves the message sequence through 2 tool rounds and returns a strict JSON response for programmatic use.
