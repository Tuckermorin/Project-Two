# AI Trade Score Gamification Components

## Overview
This directory contains gamification components for displaying AI trade recommendation scores with visual feedback based on IPS (Investment Policy Statement) alignment.

## Components

### 1. AITradeScoreButton
**File**: `AITradeScoreButton.tsx`

A fully interactive button component with tier-based styling and animations.

#### Score Tiers:
- **95-100%**: 🔥 Perfect Match (Fire glow animation, orange/red gradient)
- **90-94%**: ⭐ Elite Quality (Shimmer sweep, purple/pink gradient)
- **80-89%**: 💎 High Quality (Glow pulse, blue/cyan gradient)
- **70-79%**: ✓ Good Quality (Subtle hover glow, green/emerald gradient)
- **60-69%**: ⚠️ Acceptable (Standard hover, yellow/orange gradient)
- **<60%**: ⚠️ Review Needed (Warning state, muted red gradient)

#### Usage:
```typescript
import { AITradeScoreButton } from '@/components/trades/AITradeScoreButton';

<AITradeScoreButton
  score={85}
  tradeName="Bull Put Spread"
  symbol="AAPL"
  strategy="Credit Spread"
  onClick={() => handleViewDetails()}
  ipsFactors={{
    passed: ['IV Rank', 'Delta', 'Volume'],
    failed: ['Term Structure'],
    scores: { iv_rank: 0.8, delta: 0.25 }
  }}
/>
```

### 2. AITradeScoreCard
**File**: `AITradeScoreCard.tsx`

A detailed card component showing comprehensive trade information with gamified visual feedback.

#### Features:
- Tier-based border styling
- Educational score messaging
- IPS factor pass/fail badges
- Trade metrics (entry, max profit/loss, POP)
- AI rationale display
- Action buttons (Accept, View Details, Reject)

#### Usage:
```typescript
import { AITradeScoreCard } from '@/components/trades/AITradeScoreCard';

<AITradeScoreCard
  score={92}
  symbol="TSLA"
  strategy="Iron Condor"
  contractType="Credit Spread"
  entryPrice={2.50}
  maxProfit={250}
  maxLoss={750}
  probabilityOfProfit={65}
  ipsFactors={{
    passed: ['IV Rank >= 50', 'Delta <= 0.30', 'Liquidity Check'],
    failed: ['DTE < 45'],
    scores: { iv_rank: 0.75, delta: 0.28, dte: 35 }
  }}
  rationale="High IV environment with favorable term structure..."
  onAccept={() => handleAccept()}
  onReject={() => handleReject()}
  onViewDetails={() => handleViewDetails()}
/>
```

### 3. AgentSection Integration
**File**: `AgentSection.tsx` (Updated)

The main AI agent component now displays tier-based badges with icons for each candidate.

#### Visual Indicators:
Each trade recommendation shows an icon-enhanced badge:
- 🔥 Flame for 95-100%
- ⭐ Star for 90-94%
- 🏆 Award for 80-89%
- 📈 Trending Up for 70-79%
- 🛡️ Shield for 60-69%
- ⚠️ Alert Triangle for <60%

## CSS Animations
**File**: `src/app/globals.css`

### Animation Classes:
1. **`.fire-effect`**: Pulsing fire glow (1.5s infinite)
2. **`.shimmer-effect`**: Light sweep animation (2s infinite)
3. **`.glow-pulse`**: Breathing glow with scale (2s infinite)
4. **`.subtle-glow`**: Hover-only effect (no auto-animation)
5. **`.standard`**: Minimal hover transform
6. **`.warning-state`**: Muted appearance

### Accessibility:
All animations respect `prefers-reduced-motion` preference:
```css
@media (prefers-reduced-motion: reduce) {
  .fire-effect,
  .shimmer-effect::after,
  .glow-pulse,
  .subtle-glow {
    animation: none !important;
    transition: none !important;
  }
}
```

## Data Extraction from Agent

To populate `ipsFactors` prop, extract from the agent's `reasoning_chain`:

```typescript
// In options-agent-v3.ts or similar
const ipsFactorsPassed = Object.entries(
  candidate.reasoning_chain?.ips_compliance?.passes || {}
)
  .filter(([_, passed]) => passed)
  .map(([factor]) => factor);

const ipsFactorsFailed =
  candidate.reasoning_chain?.ips_compliance?.violations || [];

const ipsFactorScores =
  candidate.reasoning_chain?.ips_compliance?.factor_scores || {};

// Add to candidate object
candidate.ipsFactorsPassed = ipsFactorsPassed;
candidate.ipsFactorsFailed = ipsFactorsFailed;
candidate.ipsFactorScores = ipsFactorScores;
```

## Ethical Guidelines

### ✅ DO:
- Show **WHY** a score is what it is (IPS factors)
- Display which factors passed/failed
- Celebrate trade **QUALITY** (high IPS match)
- Make rejection easy (ghost button)
- Use educational tooltips

### ❌ DON'T:
- Celebrate trade **FREQUENCY**
- Use countdown timers
- Hide risks or low scores
- Auto-accept trades
- Use social comparison ("Beat other traders!")
- Apply dark patterns

## Testing Checklist

- [ ] All 6 tiers render with correct colors
- [ ] Fire animation works for 95-100%
- [ ] Shimmer works for 90-94%
- [ ] Glow pulse works for 80-89%
- [ ] Hover effects work for 70-79%
- [ ] Test with `prefers-reduced-motion: reduce`
- [ ] Test dark mode
- [ ] Test keyboard navigation (Tab through buttons)
- [ ] Test screen reader (tooltips announce properly)
- [ ] Test on mobile devices
- [ ] Verify no animation jank or performance issues
- [ ] Check WCAG AA contrast ratios

## Browser DevTools Testing

### Enable Reduced Motion:
**Chrome/Edge**:
```
DevTools → Rendering → Emulate CSS media feature prefers-reduced-motion: reduce
```

**Firefox**:
```
about:config → ui.prefersReducedMotion = 1
```

### Test Dark Mode:
**Chrome/Edge**:
```
DevTools → Rendering → Emulate CSS media feature prefers-color-scheme: dark
```

## Customization

### Adjusting Tier Thresholds:
Edit the `getScoreTier()` function in both components:
```typescript
function getScoreTier(score: number): ScoreTier {
  if (score >= 95) return { /* Perfect Match */ };
  if (score >= 90) return { /* Elite Quality */ };
  // ... etc
}
```

### Adding New Animations:
1. Add keyframes to `globals.css`
2. Create animation class
3. Update `animationClass` in tier object
4. Test with `prefers-reduced-motion`

## Performance Considerations

- Animations use `transform` and `opacity` (GPU-accelerated)
- No expensive repaints or reflows
- Shimmer uses pseudo-element (no extra DOM nodes)
- Tooltips are lazy-rendered (Radix UI)

## Accessibility Features

- Semantic HTML (button, badge elements)
- ARIA labels inherited from Radix UI
- Keyboard navigation support
- Focus visible states
- Screen reader friendly
- High contrast mode compatible
- Reduced motion support

## Future Enhancements

### Potential Additions:
1. **Sound effects** (optional, user-controlled)
2. **Haptic feedback** (mobile)
3. **Confetti animation** for 100% scores
4. **Progress bars** showing score breakdown
5. **Historical comparison** (this trade vs. average)
6. **Learning mode** with detailed factor explanations

## Support

For questions or issues with these components:
1. Check this README
2. Review component prop types (TypeScript)
3. Test in isolation with mock data
4. Verify CSS animations are loaded

## Version History

- **v1.0** (2025-01-09): Initial implementation
  - 6 score tiers with animations
  - IPS factor tooltips
  - Dark mode support
  - Accessibility features
