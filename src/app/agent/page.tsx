"use client"

import React, { useState, useEffect } from 'react';
import { AgentJobSubmit } from '@/components/agent/AgentJobSubmit';
import { AgentJobProgress } from '@/components/agent/AgentJobProgress';
import { AgentJobList } from '@/components/agent/AgentJobList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function AgentPage() {
  const [ipsConfigurations, setIpsConfigurations] = useState<any[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load IPS configurations and watchlist on mount
  useEffect(() => {
    async function loadData() {
      try {
        // Load IPS configurations
        const ipsRes = await fetch('/api/ips');
        const ipsData = await ipsRes.json();
        setIpsConfigurations(Array.isArray(ipsData) ? ipsData : []);

        // Load watchlist symbols
        const watchlistRes = await fetch('/api/watchlist');
        const watchlistData = await watchlistRes.json();
        const symbols = watchlistData?.data?.map((w: any) => w.symbol) || [];
        setWatchlistSymbols(symbols);

      } catch (error: any) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data', {
          description: error.message
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleJobSubmitted = (jobId: string) => {
    setCurrentJobId(jobId);
    setSelectedJobId(jobId);
  };

  const handleJobComplete = (result: any) => {
    toast.success('Agent completed!', {
      description: `Found ${result.stats?.final_recommendations || 0} trade recommendations`
    });

    // Could navigate to prospective trades page here
    // router.push('/trades/prospective');
  };

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
  };

  const handleViewResults = (job: any) => {
    // Could open a modal or navigate to results page
    console.log('View results for job:', job);
    toast.info('Results viewer coming soon!');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Trading Agent</h1>
        <p className="text-muted-foreground">
          Submit background jobs to analyze your watchlist and find trade opportunities
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column: Submit + Progress */}
        <div className="space-y-6">
          {/* Job Submission Form */}
          <AgentJobSubmit
            ipsConfigurations={ipsConfigurations}
            watchlistSymbols={watchlistSymbols}
            onJobSubmitted={handleJobSubmitted}
          />

          {/* Current/Selected Job Progress */}
          {selectedJobId && (
            <AgentJobProgress
              jobId={selectedJobId}
              onComplete={handleJobComplete}
              onCancel={() => setSelectedJobId(null)}
            />
          )}

          {/* Info Card */}
          {!selectedJobId && (
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="font-medium mb-1">1. Configure & Submit</div>
                  <div className="text-muted-foreground">
                    Select your IPS and execution mode, then submit the job
                  </div>
                </div>
                <div>
                  <div className="font-medium mb-1">2. Background Processing</div>
                  <div className="text-muted-foreground">
                    Agent runs in the background - you can close this tab
                  </div>
                </div>
                <div>
                  <div className="font-medium mb-1">3. Real-Time Updates</div>
                  <div className="text-muted-foreground">
                    Progress updates every 5 seconds while job is running
                  </div>
                </div>
                <div>
                  <div className="font-medium mb-1">4. Review Results</div>
                  <div className="text-muted-foreground">
                    View recommendations when complete
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Job History */}
        <div>
          <AgentJobList
            onSelectJob={handleSelectJob}
            onViewResults={handleViewResults}
            limit={10}
          />
        </div>
      </div>
    </div>
  );
}
