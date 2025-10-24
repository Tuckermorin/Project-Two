// ecosystem.config.js
// PM2 configuration file for TenXIV automated jobs

module.exports = {
  apps: [
    {
      name: 'tenxiv-scheduler',
      script: 'npx',
      args: 'tsx scripts/schedulers/start-all-schedulers.ts',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/scheduler-error.log',
      out_file: './logs/scheduler-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart at 3 AM every day to keep things fresh
      cron_restart: '0 3 * * *',
      // Auto-restart if memory usage exceeds 500MB
      max_memory_restart: '500M',
      // Wait 5 seconds between restarts to avoid rapid restart loops
      min_uptime: '5s',
      // Max 3 restart attempts in 1 minute
      max_restarts: 3,
      restart_delay: 5000
    }
  ]
};
