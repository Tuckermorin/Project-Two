// src/lib/utils/spread-pricing.ts

import { getAlphaVantageClient } from '@/lib/api/alpha-vantage'

export interface SpreadPrice {
  mid: number
  bid: number
  ask: number
  updatedAt: string
}

/**
 * Calculate the current price of a vertical spread
 * For credit spreads: price = (short_leg_bid - long_leg_ask)
 * For debit spreads: price = (long_leg_ask - short_leg_bid)
 */
export async function calculateSpreadPrice(
  symbol: string,
  shortStrike: number,
  longStrike: number,
  contractType: 'put' | 'call',
  expirationDate: string
): Promise<SpreadPrice | null> {
  try {
    const alphaVantage = getAlphaVantageClient()

    // Fetch real-time options chain
    const contracts = await alphaVantage.getRealtimeOptions(symbol, {
      requireGreeks: false
    })

    if (!contracts || contracts.length === 0) {
      console.log(`[Spread Pricing] No option contracts found for ${symbol}`)
      return null
    }

    // Normalize expiration date format
    const targetExpiry = new Date(expirationDate).toISOString().split('T')[0]

    // Find short leg
    const shortLeg = contracts.find(c =>
      c.strike === shortStrike &&
      c.type === contractType &&
      c.expiration === targetExpiry
    )

    // Find long leg
    const longLeg = contracts.find(c =>
      c.strike === longStrike &&
      c.type === contractType &&
      c.expiration === targetExpiry
    )

    if (!shortLeg || !longLeg) {
      console.log(`[Spread Pricing] Missing legs for ${symbol} ${contractType} spread ${shortStrike}/${longStrike}`)
      return null
    }

    // For credit spreads (sell short, buy long):
    // Closing cost = what you pay to buy back the short - what you get for selling the long
    // Spread price = (short leg bid - long leg ask) when buying to close
    // This is the debit you pay to close the position

    const shortBid = shortLeg.bid ?? 0
    const shortAsk = shortLeg.ask ?? 0
    const longBid = longLeg.bid ?? 0
    const longAsk = longLeg.ask ?? 0

    // To close a credit spread, you BUY it back:
    // - Buy back the short leg at ASK
    // - Sell the long leg at BID
    // Cost to close = short_ask - long_bid
    const closeBid = shortBid - longAsk  // Best case (buy at bid, sell at ask)
    const closeAsk = shortAsk - longBid  // Worst case (buy at ask, sell at bid)
    const closeMid = (closeBid + closeAsk) / 2

    console.log(`[Spread Pricing] ${symbol} ${contractType} ${shortStrike}/${longStrike}:`)
    console.log(`  Short leg: bid=${shortBid}, ask=${shortAsk}`)
    console.log(`  Long leg: bid=${longBid}, ask=${longAsk}`)
    console.log(`  Close price: bid=${closeBid.toFixed(2)}, mid=${closeMid.toFixed(2)}, ask=${closeAsk.toFixed(2)}`)

    return {
      mid: closeMid,
      bid: closeBid,
      ask: closeAsk,
      updatedAt: new Date().toISOString()
    }

  } catch (error) {
    console.error(`[Spread Pricing] Error calculating spread price for ${symbol}:`, error)
    return null
  }
}

/**
 * Calculate profit/loss for a credit spread
 */
export function calculateSpreadPL(
  creditReceived: number,
  currentSpreadPrice: number,
  contracts: number = 1
): { plDollar: number; plPercent: number } {
  // For credit spreads:
  // P/L = (credit received - cost to close) * contracts * 100
  const plPerContract = creditReceived - currentSpreadPrice
  const plDollar = plPerContract * contracts * 100
  const plPercent = (plPerContract / creditReceived) * 100

  return { plDollar, plPercent }
}

/**
 * Determine if spread should exit based on current price
 */
export function shouldExitSpread(
  creditReceived: number,
  currentSpreadPrice: number,
  profitTargetPercent: number = 50, // Close at 50% of max profit
  lossThresholdPercent: number = 200 // Close if loss reaches 200% of credit
): { shouldExit: boolean; reason: string; type: 'profit' | 'loss' | null } {
  const { plPercent } = calculateSpreadPL(creditReceived, currentSpreadPrice)

  // Check profit target
  if (plPercent >= profitTargetPercent) {
    return {
      shouldExit: true,
      reason: `Profit target reached: ${plPercent.toFixed(0)}% (target: ${profitTargetPercent}%)`,
      type: 'profit'
    }
  }

  // Check loss threshold
  const costAsPercentOfCredit = (currentSpreadPrice / creditReceived) * 100
  if (costAsPercentOfCredit >= lossThresholdPercent) {
    return {
      shouldExit: true,
      reason: `Stop loss triggered: ${costAsPercentOfCredit.toFixed(0)}% of credit (threshold: ${lossThresholdPercent}%)`,
      type: 'loss'
    }
  }

  return { shouldExit: false, reason: '', type: null }
}
