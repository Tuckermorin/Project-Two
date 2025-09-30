// Shared market data types used by both client and server helpers

export type OptionLegRole = 'long' | 'short' | 'buy' | 'sell';

export interface OptionLegRequest {
  /**
   * Optional identifier so the caller can reference a specific leg (e.g. "short_put").
   * If omitted, the receiver should derive a deterministic key from the leg details.
   */
  id?: string;
  type: 'call' | 'put';
  strike: number;
  /** Optional override if a single context covers multiple expirations */
  expiration?: string;
  role?: OptionLegRole;
  /** Mark the primary leg that factor lookups should default to when unspecified */
  primary?: boolean;
}

export interface OptionsRequestContext {
  /** Default expiration applied to legs that omit their own date */
  expiration?: string;
  legs: OptionLegRequest[];
}
