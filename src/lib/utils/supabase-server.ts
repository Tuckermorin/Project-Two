// Shared Supabase client for server-side operations
// Lazy initialization ensures environment variables are loaded before creating the client

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get or create a Supabase client instance
 * This function uses lazy initialization to ensure environment variables are loaded
 * before creating the client, which is important when using tsx or other module loaders
 */
export function getSupabaseServer(): SupabaseClient {
  if (!supabaseInstance) {
    // Try both variable names (NEXT_PUBLIC_ prefix for Next.js compatibility)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are set in your environment.'
      );
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
}
