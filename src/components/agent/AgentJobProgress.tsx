"use client"

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2, Clock, XCircle, Loader2, X } from 'lucide-react';
import { useAgentJob, type AgentJob } from '@/hooks/useAgentJob';

interface AgentJobProgressProps {
  jobId: string;
  onComplete?: (result: any) => void;
  onCancel?: () => void;
}

export function AgentJobProgress({ jobId, onComplete, onCancel }: AgentJobProgressProps) {
  const { job, loading, error, cancelJob } = useAgentJob(jobId);

  React.useEffect(() => {
    if (job?.status === 'completed' && job.result && onComplete) {
      onComplete(job.result);
    }
  }, [job?.status, job?.result, onComplete]);

  if (loading && !job) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading job status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center text-red-600">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Error: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!job) return null;

  const progressPercent = job.progress
    ? Math.round((job.progress.completed_steps / job.progress.total_steps) * 100)
    : 0;

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const handleCancel = async () => {
    try {
      await cancelJob();
      onCancel?.();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {job.status === 'pending' && (
              <>
                <Clock className="h-5 w-5 text-yellow-600" />
                Agent Job Queued
              </>
            )}
            {job.status === 'running' && (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                Agent Running
              </>
            )}
            {job.status === 'completed' && (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Agent Completed
              </>
            )}
            {job.status === 'failed' && (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                Agent Failed
              </>
            )}
            {job.status === 'cancelled' && (
              <>
                <X className="h-5 w-5 text-gray-600" />
                Agent Cancelled
              </>
            )}
          </CardTitle>
          <Badge variant={
            job.status === 'completed' ? 'default' :
            job.status === 'failed' ? 'destructive' :
            job.status === 'running' ? 'secondary' :
            'outline'
          }>
            {job.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {(job.status === 'pending' || job.status === 'running') && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">{job.progress?.message || 'Processing...'}</span>
              <span className="text-muted-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </div>
        )}

        {/* Progress Details */}
        {job.progress && (job.status === 'pending' || job.status === 'running') && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Current Step</div>
              <div className="font-medium capitalize">
                {job.progress.current_step.replace(/_/g, ' ')}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Steps Completed</div>
              <div className="font-medium">
                {job.progress.completed_steps} / {job.progress.total_steps}
              </div>
            </div>
            {job.progress.symbols_processed !== undefined && (
              <div>
                <div className="text-muted-foreground">Symbols Processed</div>
                <div className="font-medium">
                  {job.progress.symbols_processed} / {job.progress.total_symbols || 0}
                </div>
              </div>
            )}
            {job.progress.candidates_found !== undefined && (
              <div>
                <div className="text-muted-foreground">Candidates Found</div>
                <div className="font-medium">{job.progress.candidates_found}</div>
              </div>
            )}
          </div>
        )}

        {/* Timing Information */}
        <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
          <div>
            <div className="text-muted-foreground">Time Elapsed</div>
            <div className="font-medium">{formatDuration(job.duration_seconds)}</div>
          </div>
          {job.estimated_seconds_remaining !== null && job.status === 'running' && (
            <div>
              <div className="text-muted-foreground">Est. Remaining</div>
              <div className="font-medium">{formatDuration(job.estimated_seconds_remaining)}</div>
            </div>
          )}
        </div>

        {/* Completed Results */}
        {job.status === 'completed' && job.result && (
          <div className="border-t pt-4">
            <div className="font-medium text-green-600 mb-2">
              Found {job.result.stats?.final_recommendations || 0} trade recommendations
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Initial Symbols</div>
                <div className="font-medium">{job.result.stats?.initial_symbols || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Candidates</div>
                <div className="font-medium">{job.result.stats?.candidates_generated || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Final Trades</div>
                <div className="font-medium">{job.result.stats?.final_recommendations || 0}</div>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {job.status === 'failed' && job.error_message && (
          <div className="border-t pt-4">
            <div className="flex items-start gap-2 text-red-600">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Error</div>
                <div className="text-sm">{job.error_message}</div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {(job.status === 'pending' || job.status === 'running') && (
          <div className="border-t pt-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel Job
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
