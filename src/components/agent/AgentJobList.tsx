"use client"

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Loader2, Eye, Trash2, RefreshCw } from 'lucide-react';
import { useAgentJobList } from '@/hooks/useAgentJob';
import { formatDistanceToNow } from 'date-fns';

interface AgentJobListProps {
  onSelectJob?: (jobId: string) => void;
  onViewResults?: (job: any) => void;
  limit?: number;
}

export function AgentJobList({ onSelectJob, onViewResults, limit = 10 }: AgentJobListProps) {
  const { jobs, loading, error, refresh } = useAgentJobList({ limit });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading job history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            Error loading jobs: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant =
      status === 'completed' ? 'default' :
      status === 'failed' || status === 'cancelled' ? 'destructive' :
      status === 'running' ? 'secondary' :
      'outline';

    return (
      <Badge variant={variant} className="text-xs">
        {status}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Agent Jobs</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No agent jobs found. Submit your first job above!
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => onSelectJob?.(job.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <span className="font-mono text-sm text-muted-foreground">
                      #{job.id.substring(0, 8)}
                    </span>
                    {getStatusBadge(job.status)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm mb-2">
                  <div>
                    <div className="text-muted-foreground text-xs">Symbols</div>
                    <div className="font-medium">{job.symbols_count}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Duration</div>
                    <div className="font-medium">{formatDuration(job.duration_seconds)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Results</div>
                    <div className="font-medium">
                      {job.status === 'completed' && job.result
                        ? `${job.result.stats?.final_recommendations || 0} trades`
                        : '--'}
                    </div>
                  </div>
                </div>

                {job.progress && (job.status === 'running' || job.status === 'pending') && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {job.progress.message}
                  </div>
                )}

                {job.status === 'completed' && job.result && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewResults?.(job);
                      }}
                      className="flex-1"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View Results
                    </Button>
                  </div>
                )}

                {job.status === 'failed' && job.error_message && (
                  <div className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                    {job.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
