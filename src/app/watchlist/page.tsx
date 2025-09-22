"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, Plus, Search, Trash2, TrendingUp, Loader2, AlertCircle, List, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"

type Stock = {
  id: string
  symbol: string
  companyName?: string
  sector?: string
  notes?: string
  currentPrice?: number
  week52High?: number
  week52Low?: number
  marketCap?: number
  peRatio?: number
  dividendYield?: number
  change?: number
  changePercent?: number
  volume?: number
  currency?: string
  beta?: number
  analystTargetPrice?: number
  eps?: number
  lastUpdated?: string
  error?: string | null
}

const AV_BASE = "https://www.alphavantage.co/query"
const AV_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY || "demo"

async function fetchAlphaVantage(symbol: string) {
  const [quoteRes, overviewRes] = await Promise.all([
    fetch(`${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`, { cache: "no-store" }),
    fetch(`${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`, { cache: "no-store" }),
  ])

  const quoteJson = await quoteRes.json()
  const overviewJson = await overviewRes.json()

  const q = quoteJson?.["Global Quote"] || {}
  const price = parseFloat(q?.["05. price"]) || undefined
  const change = q?.["09. change"] ? Number(q["09. change"]) : undefined
  const changePct = q?.["10. change percent"]
    ? Number(String(q["10. change percent"]).replace('%', ''))
    : undefined
  const volume = q?.["06. volume"] ? Number(q["06. volume"]) : undefined

  const name = overviewJson?.Name as string | undefined
  const sector = overviewJson?.Sector as string | undefined
  const mcap = overviewJson?.MarketCapitalization ? Number(overviewJson.MarketCapitalization) : undefined
  const pe = overviewJson?.PERatio ? Number(overviewJson.PERatio) : undefined
  const div = overviewJson?.DividendYield ? Number(overviewJson.DividendYield) : undefined
  const wkHigh = overviewJson?.["52WeekHigh"] ? Number(overviewJson["52WeekHigh"]) : undefined
  const wkLow = overviewJson?.["52WeekLow"] ? Number(overviewJson["52WeekLow"]) : undefined
  const beta = overviewJson?.Beta ? Number(overviewJson.Beta) : undefined
  const analystTargetPrice = overviewJson?.AnalystTargetPrice ? Number(overviewJson.AnalystTargetPrice) : undefined
  const eps = overviewJson?.EPS ? Number(overviewJson.EPS) : undefined
  const currency = overviewJson?.Currency as string | undefined

  const hasData = !!price || !!name
  if (!hasData) {
    const note = quoteJson?.Note || overviewJson?.Note || ""
    const msg = note || quoteJson?.Information || overviewJson?.Information || "No data returned for symbol."
    throw new Error(msg)
  }

  return {
    companyName: name,
    sector,
    currentPrice: price,
    week52High: wkHigh,
    week52Low: wkLow,
    marketCap: mcap,
    peRatio: pe,
    dividendYield: div,
    change,
    changePercent: changePct,
    volume,
    currency,
    beta,
    analystTargetPrice,
    eps,
  } as Partial<Stock>
}

const STORAGE_KEY = "watchlist:v2"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Columns available in list view
const ALL_COLUMNS = [
  { key: "symbol", label: "Symbol" },
  { key: "companyName", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "currentPrice", label: "Price" },
  { key: "changePercent", label: "Change %" },
  { key: "change", label: "Change ($)" },
  { key: "marketCap", label: "Market Cap" },
  { key: "peRatio", label: "P/E" },
  { key: "eps", label: "EPS" },
  { key: "dividendYield", label: "Div Yield" },
  { key: "beta", label: "Beta" },
  { key: "analystTargetPrice", label: "Target" },
  { key: "volume", label: "Volume" },
  { key: "currency", label: "Currency" },
  { key: "week52", label: "52W Range" },
  { key: "notes", label: "Notes" },
] as const

type ColumnKey = typeof ALL_COLUMNS[number]["key"]

export default function WatchlistPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [hydrated, setHydrated] = useState(false)

  // add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [symbol, setSymbol] = useState("")
  const [notes, setNotes] = useState("")
  const [preview, setPreview] = useState<Partial<Stock> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string; region?: string; currency?: string }>>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // view/sort/filter controls
  const [viewMode, setViewMode] = useState<"tiles" | "list">("tiles")
  const [selectedCols, setSelectedCols] = useState<ColumnKey[]>(["symbol", "companyName", "currentPrice", "changePercent", "marketCap", "notes"])
  const [sortBy, setSortBy] = useState<ColumnKey>("symbol")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [sectorFilter, setSectorFilter] = useState("")
  const pendingKeys = useMemo(
    () => stocks.filter(s => !s.lastUpdated).map(s => s.id).join('|'),
    [stocks]
  )

  // load persisted
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as {
          stocks: Stock[]
          selectedCols?: ColumnKey[]
          viewMode?: "tiles" | "list"
        }
        setStocks(parsed.stocks || [])
        if (parsed.selectedCols?.length) setSelectedCols(parsed.selectedCols)
        if (parsed.viewMode) setViewMode(parsed.viewMode)
      }
    } catch {}
    setHydrated(true)
  }, [])

  // persist
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stocks, selectedCols, viewMode }))
  }, [stocks, selectedCols, viewMode, hydrated])

  // Load fresh market data for stocks without a recent snapshot
  useEffect(() => {
    if (!hydrated) return
    if (!pendingKeys) return

    let cancelled = false

    const mapUnifiedToStock = (data: any): Partial<Stock> => {
      if (!data) return {}
      const fundamentals = data.fundamentals || {}
      return {
        currentPrice: data.currentPrice ?? undefined,
        change: data.priceChange ?? undefined,
        changePercent: data.priceChangePercent ?? undefined,
        volume: data.volume ?? undefined,
        marketCap: data.marketCap ?? fundamentals.marketCap ?? undefined,
        peRatio: data.peRatio ?? fundamentals.peRatio ?? undefined,
        beta: data.beta ?? fundamentals.beta ?? undefined,
        week52High: data.week52High ?? fundamentals.week52High ?? undefined,
        week52Low: data.week52Low ?? fundamentals.week52Low ?? undefined,
        dividendYield: fundamentals.dividendYield ?? undefined,
        analystTargetPrice: fundamentals.analystTargetPrice ?? undefined,
        eps: fundamentals.eps ?? undefined,
        currency: data.currency ?? fundamentals.currency ?? undefined,
        lastUpdated: new Date().toISOString(),
        error: null,
      }
    }

    const fetchSymbol = async (symbol: string) => {
      const url = `/api/market-data/fundamental?symbol=${encodeURIComponent(symbol)}`
      let attempt = 0
      let lastError: string | null = null

      while (attempt < 3) {
        try {
          const res = await fetch(url, { cache: 'no-store' })
          if (res.status === 429 || res.headers.get('X-RateLimited') === 'true') {
            lastError = 'Alpha Vantage rate limit reached. Some watchlist data may be stale.'
            attempt += 1
            await sleep(1200 * attempt)
            continue
          }
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error || body?.message || res.statusText)
          }
          const body = await res.json()
          if (!body?.data) throw new Error('No data returned')
          return { mapped: mapUnifiedToStock(body.data), notice: lastError }
        } catch (err: any) {
          lastError = err?.message || 'Failed to fetch watchlist data'
          attempt += 1
          await sleep(800 * attempt)
        }
      }

      throw new Error(lastError || 'Failed to fetch watchlist data')
    }

    const pending = stocks.filter((s) => !s.lastUpdated)
    if (pending.length === 0) return

    (async () => {
      for (const stock of pending) {
        if (cancelled) break
        try {
          const result = await fetchSymbol(stock.symbol)
          if (cancelled) break
          if (result?.notice) setNotice(result.notice)
          else setNotice(null)
          setStocks((prev) =>
            prev.map((item) =>
              item.id === stock.id
                ? { ...item, ...result.mapped }
                : item
            )
          )
        } catch (err: any) {
          if (cancelled) break
          setNotice((prev) => prev ?? err?.message ?? 'Unable to update watchlist data.')
          setStocks((prev) =>
            prev.map((item) =>
              item.id === stock.id
                ? { ...item, error: err?.message || 'Failed to refresh data', lastUpdated: item.lastUpdated ?? new Date().toISOString() }
                : item
            )
          )
        }

        // avoid hitting rate limits with a small delay between calls
        await sleep(500)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hydrated, pendingKeys, stocks])

  // ticker => preview fetch (debounced)
  useEffect(() => {
    let ignore = false
    const s = symbol.trim().toUpperCase()
    if (!s) {
      setPreview(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const t = setTimeout(async () => {
      try {
        const data = await fetchAlphaVantage(s)
        if (!ignore) setPreview({ symbol: s, ...data })
      } catch (e: any) {
        if (!ignore) {
          setPreview(null)
          setError(e?.message || "Failed to fetch symbol data.")
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }, 350)
    return () => {
      ignore = true
      clearTimeout(t)
    }
  }, [symbol])

  // symbol search (shared with trades entry)
  useEffect(() => {
    if (!searchOpen) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setSearchBusy(false)
      return
    }
    setSearchBusy(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market-data/symbol-search?q=${encodeURIComponent(q)}&limit=8`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.success !== false) {
          const results = Array.isArray(data?.data) ? data.data : data?.matches || []
          setSearchResults(results.map((r: any) => ({ symbol: r.symbol ?? r.Symbol ?? '', name: r.name ?? r.Name ?? '', region: r.region ?? r.Region, currency: r.currency ?? r.Currency })).filter((r: any) => r.symbol))
        } else {
          setSearchResults([])
        }
      } catch {
        setSearchResults([])
      } finally {
        setSearchBusy(false)
      }
    }, 250)

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchQuery, searchOpen])

  const handleAddStock = () => {
    const s = symbol.trim().toUpperCase()
    if (!s || !preview) return
    const stock: Stock = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
      symbol: s,
      companyName: preview.companyName,
      sector: preview.sector,
      currentPrice: preview.currentPrice,
      week52High: preview.week52High,
      week52Low: preview.week52Low,
      marketCap: preview.marketCap,
      peRatio: preview.peRatio,
      dividendYield: preview.dividendYield,
      change: preview.change,
      changePercent: preview.changePercent,
      volume: preview.volume,
      currency: preview.currency,
      beta: preview.beta,
      analystTargetPrice: preview.analystTargetPrice,
      eps: preview.eps,
      notes: notes.trim() || undefined,
      error: null,
    }
    setStocks(prev => [...prev, stock])
    setSymbol("")
    setNotes("")
    setPreview(null)
    setError(null)
    setShowAddForm(false)
    setNotice(null)
  }

  const handleRemoveStock = (id: string) => {
    setStocks(prev => prev.filter(s => s.id !== id))
  }

  // derived stats
  const sectorCount = useMemo(
    () => new Set(stocks.map(s => s.sector).filter(Boolean)).size,
    [stocks]
  )
  const notesCount = useMemo(() => stocks.filter(s => !!s.notes).length, [stocks])

  // filter + sort for list view
  const visibleStocks = useMemo(() => {
    const filtered = stocks.filter(s =>
      sectorFilter ? (s.sector || "").toLowerCase().includes(sectorFilter.toLowerCase()) : true
    )
    const valueOf = (st: Stock, key: ColumnKey) => {
      if (key === "week52") return (st.week52High ?? 0) - (st.week52Low ?? 0)
      return st[key] ?? ""
    }
    const sorted = [...filtered].sort((a, b) => {
      const va = valueOf(a, sortBy)
      const vb = valueOf(b, sortBy)
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
    return sorted
  }, [stocks, sortBy, sortDir, sectorFilter])

  // helpers
  const fmtNum = (n?: number) => (n == null ? "—" : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n))
  const fmtMoney = (n?: number, currency: string = 'USD') => (
    n == null ? "—" : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  )
  const fmtPercent = (n?: number) => (n == null ? "—" : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`)

  return (
    <div className="container mx-auto px-4 py-8">
      {notice && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {notice}
        </div>
      )}
      {/* Watchlist Stats moved to top */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Watchlist Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{stocks.length}</p>
              <p className="text-sm text-gray-600">Total Stocks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{sectorCount}</p>
              <p className="text-sm text-gray-600">Sectors</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{notesCount}</p>
              <p className="text-sm text-gray-600">With Notes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls row */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "tiles" | "list")}>
            <TabsList>
              <TabsTrigger value="tiles" className="flex items-center gap-1"><LayoutGrid className="h-4 w-4" /> Tiles</TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-1"><List className="h-4 w-4" /> List</TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "list" && (
            <div className="flex items-center gap-2 ml-2">
              <Input
                className="w-40"
                placeholder="Filter sector"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
              />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as ColumnKey)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Sort by" /></SelectTrigger>
                <SelectContent>
                  {ALL_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                <SelectTrigger className="w-28"><SelectValue placeholder="Dir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Asc</SelectItem>
                  <SelectItem value="desc">Desc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {
            setNotice(null)
            setStocks(prev => prev.map(stock => ({ ...stock, lastUpdated: undefined })))
          }}>
            Refresh Data
          </Button>
          <Button onClick={() => setShowAddForm(v => !v)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>

      {/* Add Stock Form (ticker drives values; only Notes is editable) */}
      {showAddForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker *</label>
                <div className="relative">
                  <Input
                    placeholder="Search by symbol or company"
                    value={symbol}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase()
                      setSymbol(value.replace(/\s+/g, ''))
                      setSearchQuery(e.target.value)
                    }}
                    autoComplete="off"
                  />
                  {(loading || searchBusy) && <Loader2 className="absolute right-2 top-2.5 h-5 w-5 animate-spin text-gray-400" />}
                  {searchOpen && (searchQuery || '').length >= 1 && (
                    <div className="absolute z-20 mt-1 w-full rounded border bg-background shadow">
                      {searchBusy && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                      )}
                      {!searchBusy && searchResults.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                      )}
                      {!searchBusy && searchResults.map((result) => (
                        <button
                          key={`${result.symbol}-${result.name}`}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/40"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setSymbol(result.symbol.toUpperCase())
                            setSearchQuery('')
                            setSearchResults([])
                            setSearchOpen(false)
                          }}
                        >
                          <div className="text-sm font-medium">
                            {result.symbol}
                            <span className="text-muted-foreground"> • {result.name}</span>
                          </div>
                          {(result.region || result.currency) && (
                            <div className="text-[11px] text-muted-foreground">
                              {result.region ?? ''}{result.currency ? ` • ${result.currency}` : ''}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {error && (
                  <div className="flex items-center text-sm text-red-600 mt-2">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {error}
                  </div>
                )}
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <Input value={preview?.companyName || ""} readOnly placeholder="—" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sector</label>
                  <Input value={preview?.sector || ""} readOnly placeholder="—" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <Input value={preview?.currentPrice != null ? `$${preview.currentPrice.toFixed(2)}` : ""} readOnly placeholder="—" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">52W Range</label>
                  <Input
                    value={
                      preview?.week52Low != null && preview?.week52High != null
                        ? `$${preview.week52Low.toFixed(2)} – $${preview.week52High.toFixed(2)}`
                        : ""
                    }
                    readOnly placeholder="—"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <Input
                  placeholder="Why you're watching this stock"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddStock} disabled={!symbol.trim() || !preview || !!error || loading}>Add to Watchlist</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-gray-500 mt-4">Alpha Vantage free tier updates quotes end‑of‑day.</p>
          </CardContent>
        </Card>
      )}

      {/* View as Tiles */}
      {viewMode === "tiles" && (
        stocks.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900">No Stocks in Watchlist</h3>
              <p className="text-gray-500 mb-6">Add stocks you want to monitor</p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Stock
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stocks.map((stock) => {
              const changePct = stock.changePercent ?? null
              const changeClass = changePct == null ? 'text-gray-600' : changePct >= 0 ? 'text-green-600' : 'text-red-600'
              const price = typeof stock.currentPrice === 'number' ? fmtMoney(stock.currentPrice, stock.currency ?? 'USD') : 'N/A'
              const target = stock.analystTargetPrice != null ? fmtMoney(stock.analystTargetPrice, stock.currency ?? 'USD') : '—'
              const range = stock.week52Low != null && stock.week52High != null
                ? `${fmtMoney(stock.week52Low, stock.currency ?? 'USD')} – ${fmtMoney(stock.week52High, stock.currency ?? 'USD')}`
                : '—'
              const changeDollar = stock.change != null ? fmtMoney(stock.change, stock.currency ?? 'USD') : null
              const changeDisplay = changePct == null && changeDollar == null
                ? '—'
                : `${changePct != null ? fmtPercent(changePct) : '—'}${changeDollar ? ` (${changeDollar})` : ''}`
              return (
                <Card key={stock.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <Link href={`/watchlist/${stock.symbol}`} className="group">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:underline">{stock.symbol}</h3>
                          {stock.companyName && <p className="text-sm text-gray-600">{stock.companyName}</p>}
                        </Link>
                        {stock.sector && <Badge variant="secondary" className="mt-2">{stock.sector}</Badge>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveStock(stock.id)}
                        aria-label={`Remove ${stock.symbol} from watchlist`}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600">Current Price</p>
                      <p className="text-2xl font-bold text-gray-900">{price}</p>
                      <p className={`text-sm font-medium ${changeClass}`}>{changeDisplay}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-700">
                      <div>52W Range: <span className="font-medium">{range}</span></div>
                      <div>Volume: <span className="font-medium">{fmtNum(stock.volume)}</span></div>
                      <div>Market Cap: <span className="font-medium">{fmtNum(stock.marketCap)}</span></div>
                      <div>P/E: <span className="font-medium">{stock.peRatio ?? '—'}</span></div>
                      <div>Dividend Yield: <span className="font-medium">{stock.dividendYield != null ? fmtPercent(stock.dividendYield * 100) : '—'}</span></div>
                      <div>Beta: <span className="font-medium">{stock.beta ?? '—'}</span></div>
                      <div>Target: <span className="font-medium">{target}</span></div>
                      <div>EPS: <span className="font-medium">{stock.eps != null ? stock.eps.toFixed(2) : '—'}</span></div>
                    </div>

                  {stock.notes && (
                    <div>
                      <p className="text-sm text-gray-600">Notes</p>
                      <p className="text-sm text-gray-800">{stock.notes}</p>
                    </div>
                  )}

                  {stock.error && (
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {stock.error}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link href={`/watchlist/${stock.symbol}`}>
                          <TrendingUp className="h-4 w-4 mr-1" />
                          Analyze
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline">
                        <Search className="h-4 w-4 mr-1" />
                        Research
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      )}

      {/* View as List */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {/* column selector */}
            <div className="p-4 border-b flex flex-wrap gap-4">
              {ALL_COLUMNS.map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedCols.includes(col.key)}
                    onCheckedChange={(v) => {
                      setSelectedCols(prev => v ? Array.from(new Set([...prev, col.key])) : prev.filter(k => k !== col.key))
                    }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {selectedCols.map(col => (
                    <th key={col} className="px-4 py-3 text-left font-medium text-gray-700">{ALL_COLUMNS.find(c=>c.key===col)?.label}</th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStocks.map((s) => {
                  const changeClass = s.changePercent == null ? 'text-gray-600' : s.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                  return (
                    <tr key={s.id} className="border-t">
                      {selectedCols.includes("symbol") && (
                        <td className="px-4 py-3">
                          <Link href={`/watchlist/${s.symbol}`} className="font-semibold hover:underline">{s.symbol}</Link>
                        </td>
                      )}
                      {selectedCols.includes("companyName") && <td className="px-4 py-3">{s.companyName ?? "—"}</td>}
                      {selectedCols.includes("sector") && <td className="px-4 py-3">{s.sector ?? "—"}</td>}
                      {selectedCols.includes("currentPrice") && <td className="px-4 py-3">{fmtMoney(s.currentPrice, s.currency ?? 'USD')}</td>}
                      {selectedCols.includes("changePercent") && (
                        <td className={cn('px-4 py-3 font-medium', changeClass)}>{fmtPercent(s.changePercent ?? undefined)}</td>
                      )}
                      {selectedCols.includes("change") && <td className="px-4 py-3">{fmtMoney(s.change, s.currency ?? 'USD')}</td>}
                      {selectedCols.includes("marketCap") && <td className="px-4 py-3">{fmtNum(s.marketCap)}</td>}
                      {selectedCols.includes("peRatio") && <td className="px-4 py-3">{s.peRatio ?? "—"}</td>}
                      {selectedCols.includes("eps") && <td className="px-4 py-3">{s.eps != null ? s.eps.toFixed(2) : '—'}</td>}
                      {selectedCols.includes("dividendYield") && (
                        <td className="px-4 py-3">{s.dividendYield != null ? `${(s.dividendYield * 100).toFixed(2)}%` : "—"}</td>
                      )}
                      {selectedCols.includes("beta") && <td className="px-4 py-3">{s.beta ?? '—'}</td>}
                      {selectedCols.includes("analystTargetPrice") && <td className="px-4 py-3">{fmtMoney(s.analystTargetPrice, s.currency ?? 'USD')}</td>}
                      {selectedCols.includes("volume") && <td className="px-4 py-3">{fmtNum(s.volume)}</td>}
                      {selectedCols.includes("currency") && <td className="px-4 py-3">{s.currency ?? 'USD'}</td>}
                      {selectedCols.includes("week52") && (
                        <td className="px-4 py-3">
                          {s.week52Low != null && s.week52High != null
                            ? `${fmtMoney(s.week52Low, s.currency ?? 'USD')} – ${fmtMoney(s.week52High, s.currency ?? 'USD')}`
                            : "—"}
                        </td>
                      )}
                      {selectedCols.includes("notes") && <td className="px-4 py-3">{s.notes ?? "—"}</td>}
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/watchlist/${s.symbol}`}>Analyze</Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveStock(s.id)} aria-label={`Remove ${s.symbol}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {s.error && (
                          <div className="mt-2 text-xs text-red-600">{s.error}</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {visibleStocks.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-gray-500" colSpan={selectedCols.length + 1}>No results</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
