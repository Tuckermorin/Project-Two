# Exit Signal Documentation

## Overview

Exit signals automatically trigger when trades reach predefined profit or loss thresholds. These signals are configured in your IPS (Investment Performance Strategy) settings and displayed visually in the Active Trades dashboard.

## How Exit Signals Work

### Profit Target (Take Profit)

**Default:** 50% of credit received

When a credit spread has captured 50% (or your configured percentage) of the maximum profit, an exit signal triggers.

**Calculation:**
```
Profit % = (Credit Received - Current Spread Price) / Credit Received × 100
```

**Example - AMD Trade:**
- Credit Received: $0.35
- Current Spread Price: $0.17 (cost to close)
- Profit: $0.35 - $0.17 = $0.18
- Profit %: ($0.18 / $0.35) × 100 = **51.4%**
- **Result:** Exit signal triggers (≥ 50% target)

### Stop Loss (Loss Limit)

**Default:** 200% of credit received

When the cost to close a spread exceeds 200% of the credit received, an exit signal triggers to limit losses.

**Calculation:**
```
Loss % = Current Spread Price / Credit Received × 100
```

**Example:**
- Credit Received: $0.50
- Current Spread Price: $1.05 (cost to close)
- Loss %: ($1.05 / $0.50) × 100 = **210%**
- **Result:** Exit signal triggers (≥ 200% threshold)

### Time-Based Exit

**Default:** Disabled

Optionally exit trades N days before expiration regardless of profit/loss status.

## Visual Indicators

Exit signals appear in the **Status** column of the Active Trades dashboard:

### Profit Signal (Green)
```
┌─────────┐
│ 📈 EXIT │  ← Trending up icon + EXIT badge
└─────────┘
```
- **Icon:** 📈 (TrendingUp)
- **Color:** Red background with red text
- **Hover:** Shows profit percentage and target

### Loss Signal (Red)
```
┌─────────┐
│ 📉 EXIT │  ← Trending down icon + EXIT badge
└─────────┘
```
- **Icon:** 📉 (TrendingDown)
- **Color:** Red background with red text
- **Hover:** Shows loss percentage and threshold

### Time Signal (Clock)
```
┌─────────┐
│ 🕐 EXIT │  ← Clock icon + EXIT badge
└─────────┘
```
- **Icon:** 🕐 (Clock)
- **Color:** Red background with red text
- **Hover:** Shows days to expiration

## Hover Details

Clicking on an EXIT status badge shows a popover with:
- **Signal Type:** "Take Profit Signal", "Stop Loss Signal", or "Time Exit Signal"
- **Reason:** Detailed explanation with percentages
- **Action:** "Consider closing this position"

**Example Popover:**
```
┌────────────────────────────────────┐
│ 📈 Take Profit Signal              │
│                                    │
│ Profit target reached: 52.1% of    │
│ credit (target: 50%)               │
│                                    │
│ Consider closing this position     │
└────────────────────────────────────┘
```

## Configuration

Exit strategies are configured per IPS in the IPS Builder:

1. Go to **IPS** page
2. Select or create an IPS
3. Configure **Exit Strategies** section:
   - **Profit Target:** Enable/disable, set percentage (default: 50%)
   - **Stop Loss:** Enable/disable, set percentage (default: 200%)
   - **Time Exit:** Enable/disable, set days before expiration

### Default Exit Strategies

```json
{
  "profit": {
    "enabled": true,
    "type": "percentage",
    "value": 50,
    "description": "Exit at 50% of max profit"
  },
  "loss": {
    "enabled": true,
    "type": "percentage",
    "value": 200,
    "description": "Exit at 200% of credit received"
  },
  "time": {
    "enabled": false,
    "daysBeforeExpiration": 0,
    "description": "Exit N days before expiration"
  }
}
```

## Requirements

For exit signals to work properly:

1. **Trade must have an IPS assigned** (`ips_id` field)
2. **IPS must have exit strategies configured**
3. **Spread prices must be updated** (via scheduler or manual refresh)
4. **Trade data required:**
   - `credit_received`: Initial credit when trade opened
   - `current_spread_price`: Current cost to close (updated by scheduler)
   - `expiration_date`: For time-based exits

## Troubleshooting

### Exit Signals Not Showing

**Check 1: Is spread price updated?**
- Look at "Options Pricing Last Updated" in Active Trades Summary
- If "Never", click "Update Now" button
- Spread prices must be fetched for exit evaluation

**Check 2: Does trade have IPS assigned?**
- Check if IPS Score column shows a value
- If no IPS, exit strategies won't evaluate

**Check 3: Are exit strategies enabled?**
- Go to IPS page
- Check the IPS used by the trade
- Verify exit strategies are enabled

**Check 4: Check browser console**
- Open Developer Tools (F12)
- Look for logs: `[Dashboard] Trade AMD exitSignal:`
- Verify trade data and exit strategy configuration

### False Signals

If signals trigger incorrectly:

1. **Verify spread price is correct**
   - Check `current_spread_price` in database
   - Compare to broker's quote for closing the spread

2. **Check credit received**
   - Ensure `credit_received` matches entry premium
   - Should be per-contract value (e.g., $0.35, not $35)

3. **Adjust thresholds**
   - 50% profit target may be too conservative
   - Consider 60-70% for different trading styles
   - 200% loss limit may be too loose for some strategies

## Best Practices

### Profit Targets
- **Conservative:** 40-50% (take profits early)
- **Moderate:** 60-70% (balanced approach)
- **Aggressive:** 80-90% (maximize profits, higher risk)

### Stop Losses
- **Tight:** 150% (limit losses aggressively)
- **Moderate:** 200% (standard risk management)
- **Loose:** 250%+ (give trades more room, higher risk)

### Time Exits
- **Short-term trades:** Exit 7-14 days before expiration
- **Monthly options:** Exit 3-7 days before expiration
- **Long-term:** Exit 1-3 days before expiration

## Technical Details

### Files Modified

1. **[watch-criteria-evaluator.ts:184-200](src/lib/utils/watch-criteria-evaluator.ts#L184-L200)**
   - Fixed profit calculation to use credit received, not max_gain
   - Now matches Current P/L % shown in dashboard

2. **[excel-style-trades-dashboard.tsx:261-274](src/components/dashboard/excel-style-trades-dashboard.tsx#L261-L274)**
   - Changed to pass `current_spread_price` instead of stock price
   - Exit evaluation now uses correct spread pricing

3. **[active-trades-summary.tsx:109](src/components/dashboard/active-trades-summary.tsx#L109)**
   - Updated to use spread price for exit evaluation
   - Consistent with main dashboard logic

### Database Schema

```sql
-- IPS configurations table
ALTER TABLE ips_configurations
ADD COLUMN exit_strategies JSONB DEFAULT '{...}';

-- Trades table
ALTER TABLE trades
ADD COLUMN current_spread_price NUMERIC,
ADD COLUMN spread_price_updated_at TIMESTAMP WITH TIME ZONE;
```

## Example Calculations

### Example 1: Profit Signal
```
Trade: TSLA Put Credit Spread
Credit Received: $0.46
Current Spread Price: $0.21
Contracts: 3

Profit per contract: $0.46 - $0.21 = $0.25
Profit %: ($0.25 / $0.46) × 100 = 54.3%
Exit Strategy: 50% target

Result: ✅ EXIT SIGNAL (Profit target reached)
Total P/L: $0.25 × 3 × 100 = $75.00
```

### Example 2: No Signal Yet
```
Trade: AMD Put Credit Spread
Credit Received: $0.35
Current Spread Price: $0.20
Contracts: 3

Profit per contract: $0.35 - $0.20 = $0.15
Profit %: ($0.15 / $0.35) × 100 = 42.9%
Exit Strategy: 50% target

Result: ⏳ WATCH (Not at target yet)
Total P/L: $0.15 × 3 × 100 = $45.00
```

### Example 3: Loss Signal
```
Trade: MU Put Credit Spread
Credit Received: $0.44
Current Spread Price: $0.95
Contracts: 5

Loss %: ($0.95 / $0.44) × 100 = 215.9%
Exit Strategy: 200% threshold

Result: ⚠️ EXIT SIGNAL (Stop loss triggered)
Total P/L: ($0.44 - $0.95) × 5 × 100 = -$255.00
```

## Summary

Exit signals provide automated, visual indicators when trades reach key profit or loss thresholds. They help you:
- **Lock in profits** at predefined targets (e.g., 50% of credit)
- **Limit losses** before they become catastrophic
- **Stay disciplined** by following your trading plan

The signals appear automatically in the dashboard Status column with clear icons and hover details explaining why the signal triggered.
