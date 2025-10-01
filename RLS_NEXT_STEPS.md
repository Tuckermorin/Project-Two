# What You Need to Do Now - RLS Setup

## ✅ What's Already Done

1. ✅ Migration ran successfully - all tables have `user_id`
2. ✅ RLS is enabled on all tables
3. ✅ Your `.env` has the correct keys
4. ✅ Your API routes are using `NEXT_PUBLIC_SUPABASE_ANON_KEY` (good!)

## ❌ The Problem

Your API routes are creating Supabase clients **incorrectly** for RLS. They're creating a **shared client instance** that doesn't have user context.

**Current code (doesn't work with RLS):**
```typescript
// This creates ONE client for ALL requests - no user context!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  // This supabase instance has no user session
  const { data } = await supabase.from('trades').select('*')
  // RLS will block this because there's no authenticated user!
}
```

## 🔧 The Fix

You need to create a **new client for each request** that includes the user's session from cookies.

### Option 1: Use Supabase SSR (Recommended)

Install the package:
```bash
npm install @supabase/ssr --legacy-peer-deps
```

Then update your API routes:

**Before:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser();
  // ... rest of code
}
```

**After:**
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Now this will work with RLS!
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RLS automatically filters by user - no need for .eq('user_id', user.id)
  const { data, error } = await supabase.from('trades').select('*');

  return NextResponse.json({ data });
}
```

### Option 2: Keep Using Service Role (Current Approach - Works but Bypasses RLS)

If you want to keep your current setup working, you can use the **service role key** which bypasses RLS:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // ⚠️ Bypasses RLS
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser();

  // You MUST manually filter by user_id when using service role
  const { data } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', user.id);  // ⚠️ Manual filtering required

  return NextResponse.json({ data });
}
```

**⚠️ With this approach:**
- RLS is bypassed (you're using admin credentials)
- You MUST manually filter by `user_id` in every query
- If you forget `.eq('user_id', user.id)`, users can see each other's data!

## 📋 What You Need to Change

### Files That Need Updating:

1. `/src/app/api/ips/route.ts`
2. `/src/app/api/ips/[id]/route.ts`
3. `/src/app/api/ips/[id]/factors/route.ts`
4. `/src/app/api/trades/route.ts`
5. `/src/app/api/trades/close/route.ts`
6. `/src/app/api/trades/score/route.ts`
7. `/src/app/api/trades/factors/route.ts`
8. `/src/app/api/watchlist/route.ts`

All of these need to:
1. **Import** `createServerClient` from `@supabase/ssr` and `cookies` from `next/headers`
2. **Create client inside each function** (not as a shared constant)
3. **Pass cookies** to the client
4. **Remove** manual `.eq('user_id', user.id)` filtering (RLS handles it)

## 🎯 Recommended Approach

**I recommend Option 1 (Use @supabase/ssr)** because:
- ✅ RLS automatically enforces security
- ✅ Less code (no manual filtering needed)
- ✅ Can't forget to filter by user_id
- ✅ More secure (database enforces access control)

## 🚀 Quick Start

Want me to update your API routes to use the proper SSR approach? Just say "yes" and I'll:
1. Install `@supabase/ssr`
2. Update all your API routes to create clients correctly
3. Remove manual user_id filtering
4. Test that RLS is working

## 📝 Testing After Changes

Once updated, test with two user accounts:

1. **Log in as User A** and create some trades
2. **Log in as User B** and verify you can't see User A's trades
3. **Try to access User A's data directly** (should fail)

You can test in the Supabase SQL Editor:
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'trades';

-- View policies
SELECT * FROM pg_policies WHERE tablename = 'trades';
```

## ❓ Questions?

**Q: Do I need to change my environment variables?**
A: No! Your `.env.local` is already correct.

**Q: Will this break my existing app?**
A: No, but users won't be able to see data until routes are updated.

**Q: Can I test without updating all routes?**
A: Yes! Update one route at a time and test as you go.

**Q: What about background jobs?**
A: For background jobs/cron tasks, keep using service role key. They don't need RLS.

## 🔐 Current Security Status

Right now your app is:
- ⚠️ **Not secure** - API routes don't have user context
- ⚠️ RLS is enabled but **not being enforced** properly
- ⚠️ Manual filtering exists but can be forgotten

After the fix:
- ✅ **Secure** - Database enforces user isolation
- ✅ RLS properly enforced on every query
- ✅ Can't accidentally expose other users' data
