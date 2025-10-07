// Auto-initialize scheduler when server starts
// This file should be imported in your root layout or API route

import { initializeScheduler } from './utils/server-scheduler';

// Only run on server side
if (typeof window === 'undefined') {
  // Initialize scheduler when this module is first imported
  console.log('[Init] Starting scheduler on server startup...');
  initializeScheduler();
}

// Export for manual initialization if needed
export { initializeScheduler };
