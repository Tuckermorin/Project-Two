import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Trade {
  id: string
  type: 'put-credit-spread' | 'long-call'
  symbol: string
  expirationDate: string
  quantity: number
  
  // Put Credit Spread fields
  shortStrike?: number
  longStrike?: number
  creditReceived?: number
  
  // Long Call fields
  callStrike?: number
  premiumPaid?: number
  
  // Analysis fields
  currentPrice?: number
  iv?: number
  delta?: number
  
  // Trade management
  status: 'potential' | 'active' | 'closed' | 'expired'
  entryDate: string
  ipsScore: number
  ipsNotes: string
  
  notes?: string
  createdAt: string
  updatedAt: string
}

interface TradesState {
  trades: Trade[]
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateTrade: (id: string, updates: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  activateTrade: (id: string) => void
  getPotentialTrades: () => Trade[]
  getActiveTrades: () => Trade[]
}

export const useTradesStore = create<TradesState>()(
  persist(
    (set, get) => ({
      trades: [],
      
      addTrade: (tradeData) => {
        const newTrade: Trade = {
          ...tradeData,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({ trades: [...state.trades, newTrade] }))
      },
      
      updateTrade: (id, updates) => {
        set((state) => ({
          trades: state.trades.map((trade) =>
            trade.id === id
              ? { ...trade, ...updates, updatedAt: new Date().toISOString() }
              : trade
          ),
        }))
      },
      
      deleteTrade: (id) => {
        set((state) => ({
          trades: state.trades.filter((trade) => trade.id !== id),
        }))
      },
      
      activateTrade: (id) => {
        set((state) => ({
          trades: state.trades.map((trade) =>
            trade.id === id
              ? { ...trade, status: 'active' as const, entryDate: new Date().toISOString(), updatedAt: new Date().toISOString() }
              : trade
          ),
        }))
      },
      
      getPotentialTrades: () => {
        return get().trades.filter((trade) => trade.status === 'potential')
      },
      
      getActiveTrades: () => {
        return get().trades.filter((trade) => trade.status === 'active')
      },
    }),
    {
      name: 'trades-storage',
    }
  )
)