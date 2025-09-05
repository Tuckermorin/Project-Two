# AI Trade Analysis & IPS Scoring

Focused trade journaling with IPS‑weighted scoring.

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

## API Endpoints (IPS & Trades)

| Method | Path | Description |
|---|---|---|
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
