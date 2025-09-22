// src/lib/events.ts
// Central place for DOM event identifiers shared across dashboard components.

export const TRADES_UPDATED_EVENT = 'tenxiv:trades-updated';

export function dispatchTradesUpdated(detail?: unknown) {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent(TRADES_UPDATED_EVENT, { detail });
  window.dispatchEvent(event);
}
