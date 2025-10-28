// ---------- Factor Types used by the Trade Entry UI ----------
// All factors are now API-driven or calculated (no manual input needed)
export type FactorSource = "api" | "calculated";

export interface IPSFactor {
  id: string;                 // unique id for the IPS factor row (e.g., factor_id)
  key: string;                // machine key used by the services (e.g., "option_delta", "pe_ratio")
  name: string;               // human label (e.g., "Delta", "P/E Ratio")
  source: FactorSource;       // "api" | "calculated"
  weight?: number;            // optional scoring weight
  target?: {                  // optional target/range stored in IPS
    operator?: "<" | "<=" | "=" | ">=" | ">";
    min?: number | null;
    max?: number | null;
    value?: number | string | boolean | null;
  };
  inputType?: "number" | "text" | "boolean" | "select";
  options?: Array<{ label: string; value: string }>;
}

export interface FactorValueMap {
  [key: string]: number | string | boolean | null | undefined;
}

export interface LoadedIPSFactors {
  all: IPSFactor[];  // All factors are now auto-collected
}
