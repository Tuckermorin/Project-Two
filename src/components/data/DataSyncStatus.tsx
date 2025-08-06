// src/components/data/DataSyncStatus.tsx
'use client';

import React from 'react';
import { useMarketData } from './MarketDataProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export function DataSyncStatus() {
  const { lastSync, syncStatus, error, refreshData, triggerSync } = useMarketData();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'syncing':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'syncing':
        return 'bg-blue-100 text-blue-800';
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never';
    return date.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Market Data Sync Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Daily Sync Status */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            {getStatusIcon(syncStatus.daily)}
            <div>
              <p className="font-medium">Daily Fundamentals</p>
              <p className="text-sm text-gray-500">
                Last sync: {formatLastSync(lastSync.daily)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(syncStatus.daily)}>
              {syncStatus.daily}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={syncStatus.daily === 'syncing'}
            >
              Sync Now
            </Button>
          </div>
        </div>

        {/* Snapshot Sync Status */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            {getStatusIcon(syncStatus.snapshots)}
            <div>
              <p className="font-medium">Trade Snapshots</p>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Market Open: {formatLastSync(lastSync.marketOpen)}</p>
                <p>Midday: {formatLastSync(lastSync.midday)}</p>
                <p>Market Close: {formatLastSync(lastSync.marketClose)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(syncStatus.snapshots)}>
              {syncStatus.snapshots}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerSync('snapshot', 'manual')}
              disabled={syncStatus.snapshots === 'syncing'}
            >
              Snapshot
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Sync Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Manual Actions */}
        <div className="pt-4 border-t">
          <p className="text-sm font-medium mb-2">Manual Actions</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => triggerSync('snapshot', 'market_open')}
            >
              Market Open
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => triggerSync('snapshot', 'midday')}
            >
              Midday
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => triggerSync('snapshot', 'market_close')}
            >
              Market Close
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}