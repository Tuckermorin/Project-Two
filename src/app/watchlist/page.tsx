"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, Plus, Search, Trash2, TrendingUp, Loader2, AlertCircle, List, LayoutGrid, Settings2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
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
}

async function fetchStockData(symbol: string) {
  const response = await fetch(`/api/market-data/fundamental?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
  const json = await response.json()

  if (!json.success) {
    throw new Error(json.error || "Failed to fetch stock data")
  }

  const data = json.data || {}
  const fundamentals = data.fundamentals || {}

  return {
    companyName: data.companyName || fundamentals.name,
    sector: fundamentals.sector,
    currentPrice: Number(data.currentPrice || data.price) || undefined,
    week52High: Number(fundamentals.week52High) || undefined,
    week52Low: Number(fundamentals.week52Low) || undefined,
    marketCap: Number(fundamentals.marketCap) || undefined,
    peRatio: Number(fundamentals.peRatio) || undefined,
    dividendYield: Number(fundamentals.dividendYield) || undefined,
    change: Number(data.priceChange) || undefined,
    changePercent: Number(data.priceChangePercent) || undefined,
    volume: Number(data.volume || fundamentals.volume) || undefined,
    currency: fundamentals.currency,
    beta: Number(fundamentals.beta) || undefined,
    analystTargetPrice: Number(fundamentals.analystTargetPrice) || undefined,
    eps: Number(fundamentals.eps) || undefined,
  } as Partial<Stock>
}

const STORAGE_KEY = "watchlist:v2" // Kept for backward compatibility with view preferences

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

  // Symbol search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{symbol: string; name: string; region?: string; type?: string; currency?: string}>>([])
  const [searchTimer, setSearchTimer] = useState<any>(null)

  // view/sort/filter controls
  const [viewMode, setViewMode] = useState<"tiles" | "list">("tiles")
  const [selectedCols, setSelectedCols] = useState<ColumnKey[]>(["symbol", "companyName", "currentPrice", "changePercent", "marketCap", "notes"])
  const [sortBy, setSortBy] = useState<ColumnKey>("symbol")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [sectorFilter, setSectorFilter] = useState("")

  // load watchlist from Supabase
  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        // Load view preferences from localStorage
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as {
            selectedCols?: ColumnKey[]
            viewMode?: "tiles" | "list"
          }
          if (parsed.selectedCols?.length) setSelectedCols(parsed.selectedCols)
          if (parsed.viewMode) setViewMode(parsed.viewMode)
        }

        // Load stocks from Supabase
        const response = await fetch('/api/watchlist', { cache: 'no-store' })
        const json = await response.json()

        if (!ignore && json.success && Array.isArray(json.data)) {
          const stocks = json.data.map((item: any) => ({
            id: item.id,
            symbol: item.symbol,
            companyName: item.company_name,
            sector: item.sector,
            notes: item.notes,
            currentPrice: item.current_price,
            week52High: item.week52_high,
            week52Low: item.week52_low,
            marketCap: item.market_cap,
            peRatio: item.pe_ratio,
            dividendYield: item.dividend_yield,
            change: item.change,
            changePercent: item.change_percent,
            volume: item.volume,
            currency: item.currency,
            beta: item.beta,
            analystTargetPrice: item.analyst_target_price,
            eps: item.eps,
          }))
          setStocks(stocks)
        }
      } catch (error) {
        console.error('Error loading watchlist:', error)
      } finally {
        if (!ignore) setHydrated(true)
      }
    })()
    return () => { ignore = true }
  }, [])

  // persist view preferences only (not stocks)
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedCols, viewMode }))
  }, [selectedCols, viewMode, hydrated])

  // Debounced symbol search
  useEffect(() => {
    if (!searchOpen) return
    if (searchTimer) clearTimeout(searchTimer)
    const t = setTimeout(async () => {
      const q = searchQuery.trim()
      if (!q || q.length < 1) {
        setSearchResults([])
        return
      }
      try {
        setSearchBusy(true)
        const res = await fetch(`/api/market-data/symbol-search?q=${encodeURIComponent(q)}&limit=8`, { cache: 'no-store' })
        const data = await res.json()
        if (data?.success) setSearchResults(data.data || [])
        else setSearchResults([])
      } catch {
        setSearchResults([])
      } finally {
        setSearchBusy(false)
      }
    }, 250)
    setSearchTimer(t)
    return () => clearTimeout(t)
  }, [searchQuery, searchOpen])

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
        const data = await fetchStockData(s)
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

  const handleAddStock = async () => {
    const s = symbol.trim().toUpperCase()
    if (!s || !preview) return

    setLoading(true)
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      })

      const json = await response.json()
      if (!json.success) throw new Error(json.error || 'Failed to add stock')

      // Add to local state with correct mapping
      const newStock: Stock = {
        id: json.data.id,
        symbol: json.data.symbol,
        companyName: json.data.company_name,
        sector: json.data.sector,
        notes: json.data.notes,
        currentPrice: json.data.current_price,
        week52High: json.data.week52_high,
        week52Low: json.data.week52_low,
        marketCap: json.data.market_cap,
        peRatio: json.data.pe_ratio,
        dividendYield: json.data.dividend_yield,
        change: json.data.change,
        changePercent: json.data.change_percent,
        volume: json.data.volume,
        currency: json.data.currency,
        beta: json.data.beta,
        analystTargetPrice: json.data.analyst_target_price,
        eps: json.data.eps,
      }

      setStocks(prev => [...prev, newStock])
      setSymbol("")
      setNotes("")
      setPreview(null)
      setError(null)
      setShowAddForm(false)
    } catch (e: any) {
      setError(e.message || 'Failed to add stock to watchlist')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveStock = async (id: string) => {
    try {
      const response = await fetch(`/api/watchlist?id=${id}`, {
        method: 'DELETE',
      })

      const json = await response.json()
      if (!json.success) throw new Error(json.error || 'Failed to remove stock')

      setStocks(prev => prev.filter(s => s.id !== id))
    } catch (e: any) {
      console.error('Error removing stock:', e)
      setError(e.message || 'Failed to remove stock from watchlist')
    }
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
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "tiles" | "list")}>
            <TabsList>
              <TabsTrigger value="tiles" className="flex items-center gap-1"><LayoutGrid className="h-4 w-4" /> Tiles</TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-1"><List className="h-4 w-4" /> List</TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "list" && (
            <>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="default">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Columns ({selectedCols.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Display Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedCols.length === ALL_COLUMNS.length}
                    onCheckedChange={(checked) => {
                      setSelectedCols(checked ? ALL_COLUMNS.map(c => c.key) : [])
                    }}
                  >
                    <span className="font-medium">Select All</span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map(col => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={selectedCols.includes(col.key)}
                      onCheckedChange={(checked) => {
                        setSelectedCols(prev =>
                          checked
                            ? Array.from(new Set([...prev, col.key]))
                            : prev.filter(k => k !== col.key)
                        )
                      }}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <Button onClick={() => setShowAddForm(v => !v)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Stock
        </Button>
      </div>

      {/* Add Stock Form (ticker drives values; only Notes is editable) */}
      {showAddForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker *</label>
                <div className="relative">
                  <Input
                    placeholder="Search by symbol or company"
                    value={symbol}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                    onChange={e => {
                      const v = e.target.value.toUpperCase()
                      setSymbol(v.replace(/\s+/g, ''))
                      setSearchQuery(e.target.value)
                    }}
                  />
                  {loading && <Loader2 className="absolute right-2 top-2.5 h-5 w-5 animate-spin text-gray-400" />}
                </div>
                {searchOpen && (searchQuery || '').length >= 1 && (
                  <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow-lg">
                    {searchBusy && (
                      <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                    )}
                    {!searchBusy && searchResults.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500">No matches</div>
                    )}
                    {!searchBusy && searchResults.map((r) => (
                      <button
                        key={`${r.symbol}-${r.name}`}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b last:border-b-0 cursor-pointer"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setSymbol(r.symbol.toUpperCase())
                          setSearchOpen(false)
                          setSearchQuery("")
                          setSearchResults([])
                        }}
                      >
                        <div className="text-sm font-medium">{r.symbol} <span className="text-gray-500">• {r.name}</span></div>
                        {r.region && <div className="text-[11px] text-gray-500">{r.region}{r.currency ? ` • ${r.currency}` : ''}</div>}
                      </button>
                    ))}
                  </div>
                )}
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

                  const renderCell = (colKey: ColumnKey) => {
                    switch (colKey) {
                      case "symbol":
                        return (
                          <td key="symbol" className="px-4 py-3">
                            <Link href={`/watchlist/${s.symbol}`} className="font-semibold hover:underline">{s.symbol}</Link>
                          </td>
                        )
                      case "companyName":
                        return <td key="companyName" className="px-4 py-3">{s.companyName ?? "—"}</td>
                      case "sector":
                        return <td key="sector" className="px-4 py-3">{s.sector ?? "—"}</td>
                      case "currentPrice":
                        return <td key="currentPrice" className="px-4 py-3">{fmtMoney(s.currentPrice, s.currency ?? 'USD')}</td>
                      case "changePercent":
                        return <td key="changePercent" className={cn('px-4 py-3 font-medium', changeClass)}>{fmtPercent(s.changePercent ?? undefined)}</td>
                      case "change":
                        return <td key="change" className="px-4 py-3">{fmtMoney(s.change, s.currency ?? 'USD')}</td>
                      case "marketCap":
                        return <td key="marketCap" className="px-4 py-3">{fmtNum(s.marketCap)}</td>
                      case "peRatio":
                        return <td key="peRatio" className="px-4 py-3">{s.peRatio ?? "—"}</td>
                      case "eps":
                        return <td key="eps" className="px-4 py-3">{s.eps != null ? s.eps.toFixed(2) : '—'}</td>
                      case "dividendYield":
                        return <td key="dividendYield" className="px-4 py-3">{s.dividendYield != null ? `${(s.dividendYield * 100).toFixed(2)}%` : "—"}</td>
                      case "beta":
                        return <td key="beta" className="px-4 py-3">{s.beta ?? '—'}</td>
                      case "analystTargetPrice":
                        return <td key="analystTargetPrice" className="px-4 py-3">{fmtMoney(s.analystTargetPrice, s.currency ?? 'USD')}</td>
                      case "volume":
                        return <td key="volume" className="px-4 py-3">{fmtNum(s.volume)}</td>
                      case "currency":
                        return <td key="currency" className="px-4 py-3">{s.currency ?? 'USD'}</td>
                      case "week52":
                        return (
                          <td key="week52" className="px-4 py-3">
                            {s.week52Low != null && s.week52High != null
                              ? `${fmtMoney(s.week52Low, s.currency ?? 'USD')} – ${fmtMoney(s.week52High, s.currency ?? 'USD')}`
                              : "—"}
                          </td>
                        )
                      case "notes":
                        return <td key="notes" className="px-4 py-3">{s.notes ?? "—"}</td>
                      default:
                        return null
                    }
                  }

                  return (
                    <tr key={s.id} className="border-t">
                      {selectedCols.map(colKey => renderCell(colKey))}
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/watchlist/${s.symbol}`}>Analyze</Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveStock(s.id)} aria-label={`Remove ${s.symbol}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
