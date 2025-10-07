# Row Level Security (RLS) Security Guide

## Current Status
Your tables are currently **publicly accessible** via the API because RLS is disabled. Now that you have user authentication, you should enable RLS to secure your data.

## What is Row Level Security (RLS)?
RLS is a PostgreSQL feature that restricts which rows users can access in database tables. When enabled, users can only see/modify rows that match the RLS policies you define.

---

## Step 1: Run the Migration

First, run the migration that adds `user_id` to all tables:

```bash
# In Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Create a new query
# 3. Paste the contents of: supabase/migrations/20250930_add_user_id_to_remaining_tables.sql
# 4. Click "Run"
```

This will:
- Add `user_id` column to all tables
- Create indexes for performance
- Enable RLS on all tables
- Create policies for user data isolation

---

## Step 2: Update Your Supabase Client Configuration

### Current Issue
Your API routes are currently using clients that bypass RLS. You need to use different client configurations based on the use case.

### Client Types

#### 1. **Anon Key Client** (For user operations - respects RLS)
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  // No special auth config needed - uses the user's session
)
```

#### 2. **Service Role Client** (For admin operations - bypasses RLS)
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)
```

---

## Step 3: Update Your API Routes

You need to change how you create Supabase clients in your API routes. Here's the pattern:

### For User-Specific Data (Use Anon Key)

**Before:**
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // ❌ Bypasses RLS
)
```

**After:**
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,  // ✅ Respects RLS
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  // RLS will automatically filter by logged-in user
  const { data, error } = await supabase
    .from('trades')
    .select('*')
  // No need to filter by user_id - RLS does it!

  return NextResponse.json({ data })
}
```

### For Admin/Background Tasks (Use Service Role)

Keep using service role for:
- Background jobs
- Scheduled tasks
- Admin operations
- Data migrations

---

## Step 4: Remove Manual user_id Filtering

Once RLS is enabled with the anon key client, you can remove manual filtering:

**Before (Manual filtering):**
```typescript
const { data } = await supabase
  .from('trades')
  .select('*')
  .eq('user_id', user.id)  // ❌ Not needed with RLS
```

**After (RLS handles it):**
```typescript
const { data } = await supabase
  .from('trades')
  .select('*')
  // ✅ RLS automatically filters by user_id
```

---

## Step 5: Update Each API Route

Here are the routes that need updating:

### Routes Already Using Service Role (Need to Change to Anon Key):

1. **IPS Routes** - `/api/ips/route.ts`
2. **Trades Routes** - `/api/trades/route.ts`
3. **Trades Sub-Routes** - `/api/trades/close/route.ts`, `/api/trades/score/route.ts`, `/api/trades/factors/route.ts`
4. **IPS Sub-Routes** - `/api/ips/[id]/route.ts`, `/api/ips/[id]/factors/route.ts`

### Example Update for `/api/ips/route.ts`:

**Before:**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('ips_configurations')
    .select('*')
    .eq('user_id', user.id)  // Manual filtering

  return NextResponse.json(data)
}
```

**After:**
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // RLS handles filtering automatically
  const { data, error } = await supabase
    .from('ips_configurations')
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

---

## Step 6: Testing Your Setup

### Test RLS is Working:

1. **Create two test accounts** in Supabase Dashboard
2. **Log in as User A** and create some data
3. **Log in as User B** and verify you can't see User A's data
4. **Try to modify User A's data as User B** - should fail

### Check RLS Status:

In Supabase SQL Editor:
```sql
-- Check which tables have RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- View policies for a table
SELECT * FROM pg_policies WHERE tablename = 'trades';
```

---

## Step 7: Handle Edge Cases

### Shared Data Tables

For tables like `factor_definitions` that contain shared reference data:

```sql
-- Everyone can read
CREATE POLICY "Anyone can read factors"
ON factor_definitions
FOR SELECT
USING (true);

-- Only service role can write
CREATE POLICY "Service role can manage"
ON factor_definitions
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

### Background Jobs

Use service role client for cron jobs:
```typescript
// In a background job or API route
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// This bypasses RLS for admin operations
await supabaseAdmin.from('macro_series').insert({ ... })
```

---

## Common Issues & Solutions

### Issue: "new row violates row-level security policy"
**Cause:** Trying to insert without proper user_id
**Solution:** Make sure `user_id` is set to `auth.uid()` as default or explicitly in INSERT

### Issue: "No rows returned" even though data exists
**Cause:** RLS is filtering out rows
**Solution:** Check that the user_id matches and RLS policies are correct

### Issue: API returns empty array after enabling RLS
**Cause:** Using service role client instead of anon client
**Solution:** Switch to `createServerClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Issue: Can't insert data into shared tables
**Cause:** Using user client instead of service role
**Solution:** Use service role client for admin operations

---

## Recommended Next Steps

1. ✅ Run the migration to add user_id to all tables
2. ✅ Update API routes to use `createServerClient` with anon key
3. ✅ Remove manual `.eq('user_id', user.id)` filtering
4. ✅ Test with multiple users
5. ✅ Monitor Supabase logs for RLS errors
6. Consider adding database triggers to automatically set `user_id` on INSERT

---

## Security Checklist

- [ ] RLS enabled on all user-specific tables
- [ ] Policies created for SELECT, INSERT, UPDATE, DELETE
- [ ] API routes use anon key (not service role) for user operations
- [ ] Service role key kept secret (not in frontend)
- [ ] Tested with multiple user accounts
- [ ] Shared reference data has appropriate policies
- [ ] Auth middleware validates user sessions
- [ ] No hardcoded user IDs in code

---

## Need Help?

If you encounter issues:
1. Check Supabase logs in the Dashboard
2. Test policies in SQL Editor
3. Verify environment variables are set correctly
4. Make sure cookies are being passed correctly from frontend
