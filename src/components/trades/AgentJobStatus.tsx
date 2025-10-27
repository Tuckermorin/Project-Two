"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  symbols: string[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress?: {
    completed_steps: number;
    total_steps: number;
    message: string;
  };
  error_message?: string;
  result?: {
    candidates?: any[];
  };
}

interface AgentJobStatusProps {
  jobs: AgentJob[];
  onViewJob: (job: AgentJob) => void;
  className?: string;
}

export function AgentJobStatus({ jobs, onViewJob, className = "" }: AgentJobStatusProps) {
  const [now, setNow] = useState(Date.now());

  // Update current time every second for running time display
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : now;
    const seconds = Math.floor((end - start) / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const getStatusIcon = (status: AgentJob['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatSymbols = (symbols: string[]) => {
    if (symbols.length <= 3) {
      return symbols.join(', ');
    }
    return `${symbols.slice(0, 3).join(', ')} +${symbols.length - 3} more`;
  };

  if (jobs.length === 0) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Agent Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
            onClick={() => onViewJob(job)}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {getStatusIcon(job.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {formatSymbols(job.symbols)}
                  </span>
                </div>
                {job.status === 'running' && job.progress && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 truncate">
                    {job.progress.message}
                  </p>
                )}
                {job.status === 'completed' && job.result?.candidates && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                    {job.result.candidates.length} candidates
                  </p>
                )}
                {job.status === 'failed' && job.error_message && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                    {job.error_message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(job.status === 'running' || job.status === 'completed') && job.started_at && (
                <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {formatDuration(job.started_at, job.completed_at)}
                </div>
              )}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
