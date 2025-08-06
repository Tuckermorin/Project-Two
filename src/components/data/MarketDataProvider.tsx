// src/components/data/MarketDataProvider.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface MarketDataState {
  lastSync: {
    daily?: Date;
    marketOpen?: Date;
    midday?: Date;
    marketClose?: Date;
  };
  syncStatus: {
    daily: 'idle' | 'syncing' | 'success' | 'error';
    snapshots: 'idle' | 'syncing' | 'success' | 'error';
  };
  error?: string;
}

interface MarketDataContextType extends MarketDataState {
  refreshData: () => Promise<void>;
  triggerSync: (type: 'daily' | 'snapshot', snapshotType?: string) => Promise<void>;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MarketDataState>({
    lastSync: {},
    syncStatus: {
      daily: 'idle',
      snapshots: 'idle'
    }
  });

  // Load initial sync status
  useEffect(() => {
    loadSyncStatus();
  }, []);

  const loadSyncStatus = async () => {
    try {
      // This would typically come from your database
      // For now, we'll use localStorage to track sync status
      const syncData = localStorage.getItem('marketDataSync');
      if (syncData) {
        const parsed = JSON.parse(syncData);
        setState(prev => ({
          ...prev,
          lastSync: {
            daily: parsed.daily ? new Date(parsed.daily) : undefined,
            marketOpen: parsed.marketOpen ? new Date(parsed.marketOpen) : undefined,
            midday: parsed.midday ? new Date(parsed.midday) : undefined,
            marketClose: parsed.marketClose ? new Date(parsed.marketClose) : undefined,
          }
        }));
      }
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  const refreshData = async () => {
    setState(prev => ({ 
      ...prev, 
      syncStatus: { ...prev.syncStatus, daily: 'syncing' } 
    }));

    try {
      const response = await fetch('/api/jobs/daily-sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev-secret'}`
        }
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const now = new Date();
      setState(prev => ({
        ...prev,
        lastSync: { ...prev.lastSync, daily: now },
        syncStatus: { ...prev.syncStatus, daily: 'success' },
        error: undefined
      }));

      // Save to localStorage
      const syncData = {
        daily: now.toISOString(),
        ...JSON.parse(localStorage.getItem('marketDataSync') || '{}')
      };
      localStorage.setItem('marketDataSync', JSON.stringify(syncData));

    } catch (error) {
      setState(prev => ({
        ...prev,
        syncStatus: { ...prev.syncStatus, daily: 'error' },
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  };

  const triggerSync = async (type: 'daily' | 'snapshot', snapshotType?: string) => {
    if (type === 'daily') {
      await refreshData();
    } else {
      setState(prev => ({ 
        ...prev, 
        syncStatus: { ...prev.syncStatus, snapshots: 'syncing' } 
      }));

      try {
        const response = await fetch('/api/jobs/snapshot-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev-secret'}`
          },
          body: JSON.stringify({ snapshotType })
        });

        if (!response.ok) {
          throw new Error('Snapshot sync failed');
        }

        const now = new Date();
        setState(prev => ({
          ...prev,
          lastSync: { 
            ...prev.lastSync, 
            [snapshotType as string]: now 
          },
          syncStatus: { ...prev.syncStatus, snapshots: 'success' },
          error: undefined
        }));

        // Save to localStorage
        const syncData = JSON.parse(localStorage.getItem('marketDataSync') || '{}');
        syncData[snapshotType as string] = now.toISOString();
        localStorage.setItem('marketDataSync', JSON.stringify(syncData));

      } catch (error) {
        setState(prev => ({
          ...prev,
          syncStatus: { ...prev.syncStatus, snapshots: 'error' },
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    }
  };

  const contextValue: MarketDataContextType = {
    ...state,
    refreshData,
    triggerSync
  };

  return (
    <MarketDataContext.Provider value={contextValue}>
      {children}
    </MarketDataContext.Provider>
  );
}

export const useMarketData = (): MarketDataContextType => {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
};
