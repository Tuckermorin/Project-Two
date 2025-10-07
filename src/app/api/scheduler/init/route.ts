// API Route: Initialize Scheduler
// This endpoint starts the scheduler (can also be called automatically)

import { NextResponse } from 'next/server';
import { initializeScheduler, isSchedulerRunning } from '@/lib/utils/server-scheduler';

export async function GET() {
  try {
    if (isSchedulerRunning()) {
      return NextResponse.json({
        success: true,
        message: 'Scheduler is already running',
        status: 'running'
      });
    }

    initializeScheduler();

    return NextResponse.json({
      success: true,
      message: 'Scheduler started successfully',
      status: 'started',
      jobs: [
        'Daily Trade Monitoring - 9:00 AM EST (Mon-Fri)',
        'Midday Trade Check - 12:00 PM EST (Mon-Fri)',
        'Auto Post-Mortems - Every hour',
        'Weekly RAG Enrichment - 2:00 AM Sunday'
      ]
    });
  } catch (error: any) {
    console.error('[API /scheduler/init] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to start scheduler'
      },
      { status: 500 }
    );
  }
}
