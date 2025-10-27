"use client"

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2 } from 'lucide-react';
import { useSubmitAgentJob } from '@/hooks/useAgentJob';
import { toast } from 'sonner';

interface AgentJobSubmitProps {
  ipsConfigurations: Array<{ id: string; name: string; description?: string }>;
  watchlistSymbols: string[];
  onJobSubmitted?: (jobId: string) => void;
}

export function AgentJobSubmit({
  ipsConfigurations,
  watchlistSymbols,
  onJobSubmitted
}: AgentJobSubmitProps) {
  const [selectedIpsId, setSelectedIpsId] = useState<string>('');
  const [mode, setMode] = useState<'paper' | 'live' | 'backtest'>('paper');

  const { submitJob, submitting, error } = useSubmitAgentJob();

  const handleSubmit = async () => {
    if (!selectedIpsId) {
      toast.error('Please select an IPS configuration');
      return;
    }

    if (watchlistSymbols.length === 0) {
      toast.error('No symbols in watchlist');
      return;
    }

    try {
      toast.info('Submitting agent job...', {
        description: `Processing ${watchlistSymbols.length} symbols in ${mode} mode`
      });

      const jobId = await submitJob({
        ipsId: selectedIpsId,
        symbols: watchlistSymbols,
        mode
      });

      toast.success('Agent job submitted!', {
        description: `Job ID: ${jobId.substring(0, 8)}... | Status updates will appear below.`
      });

      onJobSubmitted?.(jobId);
    } catch (err: any) {
      toast.error('Failed to submit job', {
        description: err.message
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Agent</CardTitle>
        <CardDescription>
          Submit a background job to find trade recommendations
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* IPS Selection */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Investment Policy Statement (IPS)
          </label>
          <Select value={selectedIpsId} onValueChange={setSelectedIpsId}>
            <SelectTrigger>
              <SelectValue placeholder="Select IPS Configuration" />
            </SelectTrigger>
            <SelectContent>
              {ipsConfigurations.map((ips) => (
                <SelectItem key={ips.id} value={ips.id}>
                  {ips.name}
                  {ips.description && (
                    <span className="text-muted-foreground text-xs ml-2">
                      - {ips.description}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mode Selection */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Execution Mode
          </label>
          <Select value={mode} onValueChange={(v: any) => setMode(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paper">
                Paper Trading (Simulation)
              </SelectItem>
              <SelectItem value="live">
                Live Trading
              </SelectItem>
              <SelectItem value="backtest">
                Backtest (Historical)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Watchlist Summary */}
        <div className="bg-muted p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Watchlist Symbols</span>
            <Badge variant="secondary">{watchlistSymbols.length} symbols</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {watchlistSymbols.length > 0 ? (
              <>
                {watchlistSymbols.slice(0, 10).join(', ')}
                {watchlistSymbols.length > 10 && ` +${watchlistSymbols.length - 10} more`}
              </>
            ) : (
              'No symbols loaded'
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || !selectedIpsId || watchlistSymbols.length === 0}
          className="w-full"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Submitting Job...
            </>
          ) : (
            <>
              <Play className="h-5 w-5 mr-2" />
              Start Agent Run
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground text-center">
          Job will run in the background. You can close this tab and check back later.
        </div>
      </CardContent>
    </Card>
  );
}
