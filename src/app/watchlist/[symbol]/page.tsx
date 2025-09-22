"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft } from "lucide-react"

const AV_BASE = "https://www.alphavantage.co/query"
const AV_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY || "demo"

type Quote = {
  price?: number
  change?: number
  changePercent?: string
  prevClose?: number
  open?: number
  high?: number
  low?: number
  latestTradingDay?: string
  volume?: number
}

type Overview = {
  Name?: string; Sector?: string; Industry?: string; Exchange?: string; MarketCapitalization?: string;
  PERatio?: string; DividendYield?: string; FiftyTwoWeekHigh?: string; FiftyTwoWeekLow?: string; Currency?: string;
  EBITDA?: string; EPS?: string; Beta?: string; ProfitMargin?: string; OperatingMarginTTM?: string;
  AnalystTargetPrice?: string; RevenueTTM?: string; NetIncomeTTM?: string; ReturnOnEquityTTM?: string;
  QuarterlyRevenueGrowthYOY?: string; QuarterlyEarningsGrowthYOY?: string;
  FiftyDayMovingAverage?: string; TwoHundredDayMovingAverage?: string;
}

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number }

async function getQuote(symbol: string): Promise<Quote> {
  const r = await fetch(`${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`, { cache: "no-store" })
  const j = await r.json()
  const g = j?.["Global Quote"] || {}
  const num = (k: string) => (g[k] ? Number(g[k]) : undefined)
  const str = (k: string) => (g[k] ? String(g[k]) : undefined)
  return {
    price: num("05. price"),
    change: num("09. change"),
    changePercent: str("10. change percent"),
    prevClose: num("08. previous close"),
    open: num("02. open"),
    high: num("03. high"),
    low: num("04. low"),
    latestTradingDay: str("07. latest trading day"),
    volume: num("06. volume")
  }
}

async function getOverview(symbol: string): Promise<Overview> {
  const r = await fetch(`${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`, { cache: "no-store" })
  return await r.json()
}

async function getDaily(symbol: string): Promise<Candle[]> {
  const r = await fetch(`${AV_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${AV_KEY}`, { cache: "no-store" })
  const j = await r.json()
  const raw = j?.["Time Series (Daily)"] || {}
  return Object.entries(raw).slice(0, 60).map(([date, v]: any) => ({
    date,
    open: Number(v["1. open"]),
    high: Number(v["2. high"]),
    low: Number(v["3. low"]),
    close: Number(v["4. close"]),
    volume: Number(v["6. volume"]),
  })).sort((a, b) => a.date.localeCompare(b.date))
}

export default function WatchDetailPage() {
  const params = useParams()
  const symbol = String(params?.symbol || "").toUpperCase()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [daily, setDaily] = useState<Candle[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const [q, o, d] = await Promise.all([getQuote(symbol), getOverview(symbol), getDaily(symbol)])
        if (!alive) return
        setQuote(q); setOverview(o); setDaily(d)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [symbol])

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link href="/watchlist"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <h1 className="text-2xl font-bold">{symbol} {overview?.Name ? `— ${overview.Name}` : ""}</h1>
        <div />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Alpha Vantage data…
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Price Card */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Price</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-semibold">
                {quote?.price ?? "—"} {overview?.Currency ?? ""}
              </div>
              <div className="text-sm text-gray-600">Δ {quote?.change ?? "—"} ({quote?.changePercent ?? "—"})</div>
              <div className="text-xs text-gray-500">Latest trading day: {quote?.latestTradingDay ?? "—"}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>Open: <span className="font-medium">{quote?.open ?? "—"}</span></div>
                <div>High: <span className="font-medium">{quote?.high ?? "—"}</span></div>
                <div>Low: <span className="font-medium">{quote?.low ?? "—"}</span></div>
                <div>Prev Close: <span className="font-medium">{quote?.prevClose ?? "—"}</span></div>
                <div>Volume: <span className="font-medium">{quote?.volume ?? "—"}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Company Snapshot */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Company</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Sector: <span className="font-medium">{overview?.Sector ?? "—"}</span></div>
              <div>Industry: <span className="font-medium">{overview?.Industry ?? "—"}</span></div>
              <div>Exchange: <span className="font-medium">{overview?.Exchange ?? "—"}</span></div>
              <div>Mkt Cap: <span className="font-medium">{overview?.MarketCapitalization ?? "—"}</span></div>
              <div>P/E: <span className="font-medium">{overview?.PERatio ?? "—"}</span></div>
              <div>Div Yield: <span className="font-medium">{overview?.DividendYield ?? "—"}</span></div>
              <div>52W H/L: <span className="font-medium">{overview?.FiftyTwoWeekHigh ?? "—"} / {overview?.FiftyTwoWeekLow ?? "—"}</span></div>
              <div>EBITDA: <span className="font-medium">{overview?.EBITDA ?? "—"}</span></div>
              <div>EPS: <span className="font-medium">{overview?.EPS ?? "—"}</span></div>
              <div>Beta: <span className="font-medium">{overview?.Beta ?? "—"}</span></div>
              <div>Profit Margin: <span className="font-medium">{overview?.ProfitMargin ?? "—"}</span></div>
              <div>Op Margin (TTM): <span className="font-medium">{overview?.OperatingMarginTTM ?? "—"}</span></div>
            </CardContent>
          </Card>

          {/* Recent Daily Candles (compact) */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Recent Daily Prices</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Open</th>
                    <th className="px-3 py-2 text-right font-medium">High</th>
                    <th className="px-3 py-2 text-right font-medium">Low</th>
                    <th className="px-3 py-2 text-right font-medium">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {(daily ?? []).slice(-15).map(c => (
                    <tr key={c.date} className="border-t">
                      <td className="px-3 py-2">{c.date}</td>
                      <td className="px-3 py-2 text-right">{c.open.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{c.high.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{c.low.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{c.close.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-500 mt-2">Alpha Vantage free tier provides end‑of‑day updates.</p>
            </CardContent>
          </Card>

          {/* Valuation & Growth */}
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Key Metrics</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-gray-500">Valuation</h3>
                <p>Analyst Target: <span className="font-medium">{overview?.AnalystTargetPrice ?? '—'}</span></p>
                <p>Market Cap: <span className="font-medium">{overview?.MarketCapitalization ?? '—'}</span></p>
                <p>Beta: <span className="font-medium">{overview?.Beta ?? '—'}</span></p>
                <p>EPS (TTM): <span className="font-medium">{overview?.EPS ?? '—'}</span></p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-gray-500">Growth & Profitability</h3>
                <p>Revenue TTM: <span className="font-medium">{overview?.RevenueTTM ?? '—'}</span></p>
                <p>Net Income TTM: <span className="font-medium">{overview?.NetIncomeTTM ?? '—'}</span></p>
                <p>Profit Margin: <span className="font-medium">{overview?.ProfitMargin ?? '—'}</span></p>
                <p>ROE TTM: <span className="font-medium">{overview?.ReturnOnEquityTTM ?? '—'}</span></p>
                <p>Revenue Growth YoY: <span className="font-medium">{overview?.QuarterlyRevenueGrowthYOY ?? '—'}</span></p>
                <p>Earnings Growth YoY: <span className="font-medium">{overview?.QuarterlyEarningsGrowthYOY ?? '—'}</span></p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-gray-500">Moving Averages</h3>
                <p>50 Day MA: <span className="font-medium">{overview?.FiftyDayMovingAverage ?? '—'}</span></p>
                <p>200 Day MA: <span className="font-medium">{overview?.TwoHundredDayMovingAverage ?? '—'}</span></p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
