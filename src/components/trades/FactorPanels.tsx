"use client";
import { useMemo } from "react";
import type { IPSFactor, FactorValueMap } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

type ManualProps = {
  factors: IPSFactor[];
  values: FactorValueMap;
  onChange: (key: string, value: number | string | boolean | null) => void;
};
type ApiProps = {
  factors: IPSFactor[];
  values: FactorValueMap;
  isConnected?: boolean;
  onRefresh?: () => void;
  editable?: boolean;
  onChange?: (key: string, value: number | string | boolean | null) => void;
};

export function ApiFactorsPanel({ factors, values, isConnected = true, onRefresh, editable = true, onChange }: ApiProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">API Factors ({factors.length})</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "secondary" : "destructive"}>
            {isConnected ? "Connected" : "Offline"}
          </Badge>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs px-2 py-1 rounded border hover:bg-muted cursor-pointer"
            >
              Refresh
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {factors.length === 0 && <p className="text-sm text-muted-foreground">No API-driven factors for this IPS.</p>}
        {factors.map((f) => {
          const v = values[f.key];
          const canEdit = editable && typeof onChange === 'function';
          return (
            <div key={f.key} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-5">
                <div className="text-sm font-medium">{f.name}</div>
                {f.target && (
                  <div className="text-xs text-muted-foreground">
                    target: {f.target.operator ?? ""}{" "}
                    {f.target.value ?? (f.target.min ?? "")}{" "}
                    {f.target.max != null ? `– ${f.target.max}` : ""}
                  </div>
                )}
              </div>
              <div className="col-span-7">
                {canEdit ? (
                  <Input
                    type="text"
                    inputMode={f.inputType === 'number' ? 'decimal' : 'text'}
                    value={v === undefined || v === null ? '' : String(v)}
                    onChange={(e) => onChange!(f.key, e.target.value)}
                    onBlur={(e) => { if (e.target.value.trim() === '') onChange!(f.key, null); }}
                  />
                ) : (
                  <Input value={v === undefined || v === null ? '' : String(v)} readOnly className="bg-muted/40" />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ManualFactorsPanel({ factors, values, onChange }: ManualProps) {
  const nothing = useMemo(() => factors.length === 0, [factors.length]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Manual Factors ({factors.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {nothing && <p className="text-sm text-muted-foreground">No manual factors for this IPS.</p>}
        {factors.map((f) => {
          const current = values[f.key] ?? "";
          return (
            <div key={f.key} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-5">
                <div className="text-sm font-medium">{f.name}</div>
                {f.target && (
                  <div className="text-xs text-muted-foreground">
                    target: {f.target.operator ?? ""}{" "}
                    {f.target.value ?? (f.target.min ?? "")}{" "}
                    {f.target.max != null ? `– ${f.target.max}` : ""}
                  </div>
                )}
              </div>
              <div className="col-span-7">
                {f.inputType === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={Boolean(current)} onCheckedChange={(val) => onChange(f.key, val)} />
                    <span className="text-xs text-muted-foreground">{String(Boolean(current))}</span>
                  </div>
                ) : f.inputType === "select" && f.options ? (
                  <select
                    className="w-full border border-[var(--glass-border)] rounded px-2 py-2 bg-[var(--glass-bg)] text-[var(--text-primary)] focus:border-[var(--gradient-primary-start)] focus:outline-none"
                    value={String(current)}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    inputMode={f.inputType === "number" ? "decimal" : "text"}
                    value={current === undefined || current === null ? '' : String(current)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      // Preserve the user's exact decimal typing (e.g., "0.05").
                      // We intentionally do NOT coerce to Number here.
                      onChange(f.key, raw);
                    }}
                    onBlur={(e) => {
                      // Optional normalization on blur: collapse empty to null
                      if (e.target.value.trim() === '') onChange(f.key, null);
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
