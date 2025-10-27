// Pooled Supabase client for high-concurrency operations
// Use this for agent operations, batch processing, and heavy queries
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client using the connection pooler.
 *
 * Use this for:
 * - Agent operations (many concurrent queries)
 * - Batch processing
 * - Background jobs
 * - Any operation that makes 10+ database queries
 *
 * Benefits:
 * - Handles 100+ concurrent connections
 * - Automatic connection reuse
 * - Better performance under load
 *
 * Trade-offs:
 * - Slightly higher latency (~5-10ms per query)
 * - Some advanced PostgreSQL features may not work
 */
export async function createPooledClient() {
  const cookieStore = await cookies()

  // Use pooler URL instead of direct connection
  const poolerUrl = process.env.SUPABASE_POOLER_URL ||
                    process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('.supabase.co', '.pooler.supabase.com');

  return createServerClient(
    poolerUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Creates a direct Supabase client (bypasses pooler).
 *
 * Use this sparingly for operations that need:
 * - Minimum latency (dashboard queries)
 * - Advanced PostgreSQL features (LISTEN/NOTIFY, etc.)
 * - Single quick queries
 *
 * Note: Limited to ~60 concurrent connections on most Supabase plans
 */
export async function createDirectClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Ignore server component set errors
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Ignore server component remove errors
          }
        },
      },
    }
  )
}
