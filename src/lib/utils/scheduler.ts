// src/lib/utils/scheduler.ts
import cron, { ScheduledTask } from 'node-cron';

export class JobScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();

  constructor(private cronSecret: string) {}

  /**
   * Schedule market data sync jobs
   */
  scheduleMarketJobs() {
    // Daily sync - 5:00 PM EST (after market close) - Monday to Friday
    this.scheduleJob('daily-sync', '0 22 * * 1-5', async () => {
      await this.callEndpoint('/api/jobs/daily-sync', {});
    });

    // Market open snapshot - 9:30 AM EST - Monday to Friday
    this.scheduleJob('market-open-snapshot', '30 14 * * 1-5', async () => {
      await this.callEndpoint('/api/jobs/snapshot-sync', {
        snapshotType: 'market_open'
      });
    });

    // Midday snapshot - 1:00 PM EST - Monday to Friday
    this.scheduleJob('midday-snapshot', '0 18 * * 1-5', async () => {
      await this.callEndpoint('/api/jobs/snapshot-sync', {
        snapshotType: 'midday'
      });
    });

    // Market close snapshot - 4:00 PM EST - Monday to Friday
    this.scheduleJob('market-close-snapshot', '0 21 * * 1-5', async () => {
      await this.callEndpoint('/api/jobs/snapshot-sync', {
        snapshotType: 'market_close'
      });
    });

    console.log('Market data sync jobs scheduled');
  }

  private scheduleJob(name: string, cronExpression: string, job: () => Promise<void>) {
    const scheduledJob = cron.schedule(cronExpression, job, {
      timezone: "America/New_York"
    });

    this.jobs.set(name, scheduledJob);
    console.log(`Job '${name}' scheduled with expression: ${cronExpression}`);
  }

  private async callEndpoint(path: string, body: any) {
    try {
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.cronSecret}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      console.log(`Job ${path} completed:`, result);
    } catch (error) {
      console.error(`Job ${path} failed:`, error);
    }
  }

  stop(jobName?: string) {
    if (jobName) {
      const job = this.jobs.get(jobName);
      if (job) {
        job.stop();
        this.jobs.delete(jobName);
        console.log(`Job '${jobName}' stopped`);
      }
    } else {
      // Stop all jobs
      this.jobs.forEach((job, name) => {
        job.stop();
          console.log(`Job '${name}' stopped`);
      });
      this.jobs.clear();
    }
  }

  getJobStatus(): { name: string; running: boolean }[] {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      running: job.getStatus() === 'scheduled'
    }));
  }
}

// Singleton instance
let jobScheduler: JobScheduler;

export const getJobScheduler = (): JobScheduler => {
  if (!jobScheduler) {
    jobScheduler = new JobScheduler(process.env.CRON_SECRET!);
  }
  return jobScheduler;
};