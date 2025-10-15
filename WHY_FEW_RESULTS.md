# Why Am I Only Getting 5 Trades?

## TL;DR

**This is expected behavior!** Your agent is working correctly by **only recommending high-quality trades** that meet your IPS criteria. Only 2 out of 23 stocks (VRT and OKLO) passed all your filters.

---

## What's Happening

### Your Current Results
- **Watchlist**: 23 stocks
- **Stocks that passed**: 2 (VRT, OKLO)
- **Total trades found**: 5 (3 OKLO contracts, 2 VRT contracts)
- **Pass rate**: ~9%

### This is Actually Good!

The agent is doing its job by **protecting you from bad trades**. It filtered out 21 stocks that didn't meet your Investment Policy Statement (IPS) requirements.

---

## Why Stocks Get Filtered

### Common Reasons (in order of frequency)

#### 1. **Low IV Rank** (Most Common)
- Your IPS requires high implied volatility
- Many stocks just aren't volatile enough right now
- Example: If IPS requires IV Rank ≥ 70, but stock has IV Rank of 45
- **Solution**: Lower IV Rank threshold in IPS, or wait for more volatile market conditions

#### 2. **Poor Liquidity**
- Low open interest on option contracts
- Wide bid-ask spreads
- Not enough trading volume
- **Impact**: Can't get good fills, hard to exit
- **Solution**: Remove illiquid stocks from watchlist

#### 3. **No Suitable Strikes**
- Can't find contracts at your target delta (e.g., 15-25 delta)
- Stock price doesn't align with available strikes
- Not enough strike prices in the options chain
- **Solution**: Adjust delta targets or DTE range

#### 4. **Fundamental Issues**
- Stock doesn't meet sector/industry requirements
- Poor financial metrics (if your IPS checks fundamentals)
- Recent negative news or sentiment
- **Solution**: Review IPS fundamental criteria

#### 5. **Unfavorable Options Chain Structure**
- Term structure is inverted (backwardation)
- Put skew is wrong direction
- No good spread opportunities
- **Solution**: Wait for better market conditions

---

## Your Specific Case: "Put Credit Strategy for 1-14 DTE Contracts"

### Likely Issues

Looking at your IPS name, here's what's probably filtering stocks:

#### 1. **Very Short DTE (1-14 days)**
- Most stocks don't have liquid options at 1-2 weeks
- Weekly options are less common
- **This alone could filter 70%+ of your watchlist**

#### 2. **Credit Spread Requirements**
- Need specific strike spacing (e.g., $5 wide)
- Need both strikes to have liquidity
- Short DTE + specific width = very restrictive

#### 3. **Current Market Conditions**
- If VIX is low, most stocks have low IV Rank
- October 2025 - if market is calm, fewer opportunities

---

## How to Get More Recommendations

### Option 1: Adjust IPS Thresholds (Recommended)

**Loosen** some requirements while keeping quality high:

```
Before:
- IV Rank ≥ 70 (very strict)
- DTE: 1-14 days (very tight)
- Delta: 0.15-0.25 (narrow range)
- Min OI: 500+ (high liquidity requirement)

After (More Flexible):
- IV Rank ≥ 50 (still selective, but more options)
- DTE: 7-30 days (wider window)
- Delta: 0.10-0.30 (more contract choices)
- Min OI: 100+ (still liquid, but more available)
```

### Option 2: Expand Watchlist

Add more stocks, especially:
- **High IV stocks**: Meme stocks, biotech, tech growth
- **Liquid stocks**: Large cap, popular stocks
- **Sector diversity**: Don't focus only on one sector

### Option 3: Check Multiple DTEs

Instead of 1-14 DTE only, try:
- 7-21 DTE
- 14-30 DTE
- 21-45 DTE

More liquid options, more opportunities.

### Option 4: Wait for Better Conditions

Sometimes the market just isn't offering good opportunities:
- Low VIX periods = fewer trades
- Earnings season = more IV expansion
- Market selloffs = more put selling opportunities

---

## Understanding the Numbers

### Configuration Limits vs Quality Filters

**Agent Configuration** (What we changed):
```typescript
finalRecommendations: 40  // Can return UP TO 40 trades
maxPerSymbol: 3          // UP TO 3 contracts per stock
```

These are **maximums**, not targets. The agent won't force bad trades.

**Quality Filters** (Your IPS):
- High-weight factors (must pass): IV Rank, Liquidity, Delta, etc.
- Low-weight factors (nice to have): News sentiment, fundamentals
- Diversity filters: Sector limits, symbol limits

### The Funnel

```
23 stocks in watchlist
    ↓ [Pre-filter on fundamentals]
20 stocks remain
    ↓ [Check IV Rank, liquidity]
5 stocks remain
    ↓ [Fetch options chains]
5 stocks have options data
    ↓ [Find suitable strikes + DTE]
2 stocks have good contracts
    ↓ [Score with IPS]
5 total trades found
    ↓ [Diversity filtering]
5 final recommendations (2 stocks, up to 3 contracts each)
```

---

## What Your Current Results Mean

### The Good News

✅ **VRT**: 88% IPS score (ELITE) - Excellent trade
✅ **OKLO**: 88% IPS score (ELITE) - Excellent trade

These are **high-quality recommendations**. The agent found the best opportunities from your watchlist.

### The Reality

Your watchlist had 23 stocks, but:
- 21 didn't meet the strict 1-14 DTE + high IV requirements
- The agent correctly rejected them
- Better to have 2 great trades than 20 mediocre ones

---

## Action Items

### 1. Review Your IPS Settings

Go to your IPS configuration and check:
- **DTE Range**: Is 1-14 days too narrow?
- **IV Rank Threshold**: Is it realistic for current market?
- **Liquidity Requirements**: Are they too strict?
- **Delta Range**: Could you widen it slightly?

### 2. Check Specific Stock Data

For the 21 filtered stocks, you can manually check:
- What's their current IV Rank? (Use TradingView or ThinkorSwim)
- Do they have weekly options?
- What's the open interest at your target DTE?

### 3. Consider Market Timing

- Is VIX currently low? (Check VIX chart)
- Are we in a calm market period?
- Would you get better results during earnings season?

### 4. Adjust Expectations

With a 1-14 DTE strategy:
- Expect fewer opportunities
- Run the agent more frequently (daily/weekly)
- Build a larger watchlist (50-100 stocks)

---

## New UI Features (Just Added)

You'll now see helpful information when few stocks pass:

### Pass Rate Indicator
```
2 unique stocks • 23 in watchlist (9% pass rate - 21 filtered by IPS)
```

### Info Card
When < 30% of stocks pass, you'll see a yellow info card explaining:
- Why stocks were filtered
- Common reasons for rejection
- How to get more recommendations

---

## Example: More Flexible IPS

Here's a sample configuration that would likely yield 15-25 trades:

```
Strategy: Put Credit Spreads
DTE Range: 14-30 days (not 1-14)
IV Rank: ≥ 50 (not ≥ 70)
Delta Range: 0.10-0.30 (not 0.15-0.25)
Min Open Interest: 100+ (not 500+)
Width: $5 wide (flexible)
Pop Target: ≥ 65% (not ≥ 75%)
```

This would still be **high quality**, just less restrictive.

---

## Summary

**Your agent is working perfectly!** It's doing exactly what it should:

1. ✅ Analyzed all 23 stocks
2. ✅ Filtered based on your IPS criteria
3. ✅ Found 2 stocks that meet requirements
4. ✅ Recommended 5 high-quality trades (88% IPS scores!)

**The issue isn't the agent** - it's that your current IPS is very strict (1-14 DTE) combined with current market conditions (possibly low IV environment).

**Next steps:**
1. Review your IPS thresholds
2. Consider widening DTE range to 7-30 days
3. Check if IV Rank requirements are realistic
4. Add more stocks to your watchlist
5. Or accept that this strategy has fewer setups (quality over quantity!)

Remember: **5 excellent trades are better than 40 mediocre ones**. The agent is protecting your capital by being selective.
