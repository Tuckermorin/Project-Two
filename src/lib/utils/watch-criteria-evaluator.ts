// src/lib/utils/watch-criteria-evaluator.ts

export interface WatchRule {
  id: string
  type: 'price' | 'percentage' | 'factor' | 'ips_score' | 'short_strike_proximity'
  factorId?: string
  factorName?: string
  operator: 'gt' | 'lt' | 'gte' | 'lte'
  value: number
  valueType?: 'percentage' | 'dollar' // For price/percentage types
  description: string
}

export interface WatchCriteria {
  enabled: boolean
  rules: WatchRule[]
}

export interface WatchAlert {
  ruleId: string
  type: string
  description: string
  currentValue: number
  threshold: number
  triggered: boolean
}

export interface TradeWithIPS {
  id: string
  symbol: string
  current_price?: number
  entry_price?: number
  short_strike?: number // Short strike price for options spreads
  ips_id?: string
  ips_score?: number // IPS score for the trade (0-100)
  trade_factors?: Array<{
    factor_name: string
    factor_value: number
  }>
}

export interface IPSWithCriteria {
  id: string
  name: string
  watch_criteria?: WatchCriteria
}

/**
 * Evaluates watch criteria for a trade and returns any triggered alerts
 */
export function evaluateWatchCriteria(
  trade: TradeWithIPS,
  ips: IPSWithCriteria
): WatchAlert[] {
  const alerts: WatchAlert[] = []

  // Check if watch criteria is enabled
  if (!ips.watch_criteria?.enabled || !ips.watch_criteria?.rules?.length) {
    return alerts
  }

  for (const rule of ips.watch_criteria.rules) {
    let currentValue: number | null = null
    let triggered = false

    // Evaluate based on rule type
    switch (rule.type) {
      case 'price':
        currentValue = trade.current_price ?? null
        if (currentValue !== null) {
          // For price-based watch, value type determines comparison
          // If valueType is 'percentage', compare % change; if 'dollar', compare absolute price
          if (rule.valueType === 'percentage' && trade.entry_price) {
            // Calculate percentage change from entry
            currentValue = ((trade.current_price - trade.entry_price) / trade.entry_price) * 100
          }
          triggered = evaluateOperator(currentValue, rule.operator, rule.value)
        }
        break

      case 'percentage':
        // Calculate percentage change from entry
        if (trade.current_price && trade.entry_price) {
          if (rule.valueType === 'dollar') {
            // Dollar change from entry
            currentValue = trade.current_price - trade.entry_price
          } else {
            // Percentage change from entry (default)
            currentValue = ((trade.current_price - trade.entry_price) / trade.entry_price) * 100
          }
          triggered = evaluateOperator(currentValue, rule.operator, rule.value)
        }
        break

      case 'ips_score':
        // Check if IPS score meets threshold
        currentValue = trade.ips_score ?? null
        if (currentValue !== null) {
          triggered = evaluateOperator(currentValue, rule.operator, rule.value)
        }
        break

      case 'short_strike_proximity':
        // Check if stock price is within X% or $X of short strike
        if (trade.current_price && trade.short_strike) {
          if (rule.valueType === 'percentage') {
            // Calculate percentage distance from short strike
            const percentDistance = Math.abs((trade.current_price - trade.short_strike) / trade.short_strike) * 100
            currentValue = percentDistance
            triggered = evaluateOperator(currentValue, rule.operator, rule.value)
          } else {
            // Calculate dollar distance from short strike
            const dollarDistance = Math.abs(trade.current_price - trade.short_strike)
            currentValue = dollarDistance
            triggered = evaluateOperator(currentValue, rule.operator, rule.value)
          }
        }
        break

      case 'factor':
        // Check if factor value falls outside IPS target
        if (rule.factorId && trade.trade_factors) {
          const factor = trade.trade_factors.find(f =>
            f.factor_name.toLowerCase() === rule.factorName?.toLowerCase()
          )
          if (factor) {
            currentValue = factor.factor_value
            triggered = evaluateOperator(currentValue, rule.operator, rule.value)
          }
        }
        break
    }

    if (currentValue !== null) {
      alerts.push({
        ruleId: rule.id,
        type: rule.type,
        description: rule.description,
        currentValue,
        threshold: rule.value,
        triggered
      })
    }
  }

  return alerts
}

/**
 * Evaluates a comparison operator
 */
function evaluateOperator(
  currentValue: number,
  operator: 'gt' | 'lt' | 'gte' | 'lte',
  threshold: number
): boolean {
  switch (operator) {
    case 'gt':
      return currentValue > threshold
    case 'gte':
      return currentValue >= threshold
    case 'lt':
      return currentValue < threshold
    case 'lte':
      return currentValue <= threshold
    default:
      return false
  }
}

/**
 * Gets a summary of all triggered alerts for a trade
 */
export function getTriggeredAlertsCount(alerts: WatchAlert[]): number {
  return alerts.filter(a => a.triggered).length
}

/**
 * Checks if a trade should be marked as needing attention
 */
export function shouldAlertTrade(alerts: WatchAlert[]): boolean {
  return alerts.some(a => a.triggered)
}

/**
 * Evaluates exit strategy to determine if trade should be closed
 */
export interface ExitStrategies {
  profit?: {
    enabled: boolean
    type: 'percentage' | 'dollar'
    value: number
  }
  loss?: {
    enabled: boolean
    type: 'percentage' | 'dollar'
    value: number
  }
  time?: {
    enabled: boolean
    daysBeforeExpiration: number
  }
}

export interface ExitSignal {
  shouldExit: boolean
  reason: string
  type: 'profit' | 'loss' | 'time'
}

export function evaluateExitStrategy(
  trade: {
    current_price?: number
    entry_price?: number
    credit_received?: number
    expiration_date?: string
    max_gain?: number
    max_loss?: number
  },
  exitStrategies?: ExitStrategies
): ExitSignal | null {
  if (!exitStrategies) return null

  // Check profit target
  if (exitStrategies.profit?.enabled && trade.credit_received && trade.current_price) {
    // For credit spreads: profit % = (credit - current_price) / credit * 100
    // This gives us the percentage of the credit that has been captured as profit
    const currentProfit = trade.credit_received - trade.current_price
    const profitPercent = (currentProfit / trade.credit_received) * 100

    const profitTarget = exitStrategies.profit.value // This is the percentage (e.g., 50 for 50%)

    if (profitPercent >= profitTarget) {
      return {
        shouldExit: true,
        reason: `Profit target reached: ${profitPercent.toFixed(1)}% of credit (target: ${profitTarget}%)`,
        type: 'profit'
      }
    }
  }

  // Check stop loss
  if (exitStrategies.loss?.enabled && trade.credit_received && trade.current_price) {
    // For credit spreads: calculate actual loss percentage
    // Loss = (current_price - credit_received)
    // Loss % = (loss / credit_received) * 100
    // For a loss, current_price > credit_received, so this will be positive
    const actualLoss = trade.current_price - trade.credit_received
    const lossPercent = (actualLoss / trade.credit_received) * 100

    const lossThreshold = exitStrategies.loss.value // This is the percentage (e.g., 250 for 250%)

    // Only trigger if we have an actual loss (lossPercent > 0) and it exceeds threshold
    if (lossPercent > 0 && lossPercent >= lossThreshold) {
      return {
        shouldExit: true,
        reason: `Stop loss triggered: ${lossPercent.toFixed(0)}% loss (threshold: ${lossThreshold}%)`,
        type: 'loss'
      }
    }
  }

  // Check time-based exit
  if (exitStrategies.time?.enabled && trade.expiration_date) {
    const daysToExp = daysToExpiry(trade.expiration_date)
    if (daysToExp !== null && daysToExp <= exitStrategies.time.daysBeforeExpiration) {
      return {
        shouldExit: true,
        reason: `Time exit: ${daysToExp} days to expiration`,
        type: 'time'
      }
    }
  }

  return null
}

function daysToExpiry(exp: string): number | null {
  const d = new Date(exp)
  if (Number.isNaN(d.getTime())) return null
  const diff = d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
