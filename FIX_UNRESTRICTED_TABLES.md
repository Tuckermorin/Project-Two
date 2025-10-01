# Fix Unrestricted Tables - Migration Guide

## 🎯 What This Fixes

This migration secures the 6 tables that were showing as "unrestricted" in your schema:

### Tables Missing `user_id`:
1. ✅ **`ai_trade_analyses`** - Adds `user_id uuid NOT NULL`
2. ✅ **`ips_score_calculations`** - Adds `user_id uuid NOT NULL`
3. ✅ **`ips_factors`** - Adds `user_id uuid NOT NULL`

### Tables with Wrong Type:
4. ✅ **`trades`** - Converts `user_id` from `TEXT` to `UUID`
5. ✅ **`ips_configurations`** - Converts `user_id` from `TEXT` to `UUID`

### Tables Missing RLS Only:
6. ✅ **`watchlist_items`** - Enables RLS (user_id already correct)

## 📋 Prerequisites

**IMPORTANT:** You must have at least one user in your `auth.users` table before running this migration.

If you don't have a user yet:
1. Go to your app's signup page: `http://localhost:3000/signup`
2. Create an account
3. Then run this migration

## 🚀 How to Run

### Step 1: Open Supabase Dashboard
Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql

### Step 2: Copy the Migration
Open the file: `supabase/migrations/20250930_fix_unrestricted_tables.sql`

Copy the entire contents (all ~280 lines)

### Step 3: Run in SQL Editor
1. Paste into the Supabase SQL Editor
2. Click **"Run"**
3. Wait for completion (should take 5-10 seconds)

### Step 4: Verify Success
You should see output like:
```
NOTICE:  Using user ID XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX for backfilling existing data
NOTICE:  Adding user_id to ai_trade_analyses
NOTICE:  Successfully added user_id to ai_trade_analyses
...
NOTICE:  ==========================================================
NOTICE:  Migration Complete!
NOTICE:  ==========================================================
```

## ✅ What This Does

### For Each Table:

1. **Adds `user_id` Column** (if missing)
   - Type: `uuid NOT NULL`
   - Default: `auth.uid()`
   - Foreign Key: `auth.users(id) ON DELETE CASCADE`
   - Index: Created for performance

2. **Converts Type** (if wrong)
   - Changes from `text` to `uuid`
   - Backfills all existing data with first user's ID
   - Maintains all other data integrity

3. **Enables RLS**
   - Row Level Security turned on
   - Policy: `Users can manage their rows`
   - Rule: `auth.uid() = user_id`

## 🔍 After Migration

### Check RLS Status
Run this in Supabase SQL Editor:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'ai_trade_analyses',
  'ips_score_calculations',
  'ips_factors',
  'trades',
  'ips_configurations',
  'watchlist_items'
);
```

All 6 tables should show `rowsecurity = true`

### Check Policies
```sql
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE tablename IN (
  'ai_trade_analyses',
  'ips_score_calculations',
  'ips_factors',
  'trades',
  'ips_configurations',
  'watchlist_items'
)
ORDER BY tablename;
```

Each table should have a policy named "Users can manage their rows"

## 🧪 Test Your App

After running the migration:

1. **Log in to your app** with your user account
2. **Create some data**:
   - Create an IPS configuration
   - Add factors to the IPS
   - Create a trade
   - Score a trade
3. **Verify RLS works**:
   - All data should save successfully
   - You should only see your own data
   - No errors in the console

## 🆘 Troubleshooting

### Error: "No users found in auth.users"
**Solution:** Create a user account first:
```
1. Go to http://localhost:3000/signup
2. Create an account
3. Run the migration again
```

### Error: "column user_id already exists"
**Solution:** This table was already migrated. The migration is idempotent and will skip tables that are already updated.

### Error: "constraint already exists"
**Solution:** The migration includes DROP IF EXISTS statements for constraints. If you still get this error, you may need to manually drop the constraint first.

## 📝 What Changed in Your Database

### `ai_trade_analyses`
```sql
-- Before:
CREATE TABLE ai_trade_analyses (
  id uuid PRIMARY KEY,
  trade_id uuid,
  -- ... other columns
);

-- After:
CREATE TABLE ai_trade_analyses (
  id uuid PRIMARY KEY,
  trade_id uuid,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  -- ... other columns
  CONSTRAINT ai_trade_analyses_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE ai_trade_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their rows" ON ai_trade_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### `trades` (Type Conversion)
```sql
-- Before:
user_id text NOT NULL DEFAULT 'default-user'

-- After:
user_id uuid NOT NULL DEFAULT auth.uid()
  CONSTRAINT trades_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
```

## 🎉 Success!

Once complete, all 6 tables will be properly secured with:
- ✅ Correct `user_id uuid` columns
- ✅ Foreign key constraints to `auth.users`
- ✅ Row Level Security enabled
- ✅ Policies enforcing user isolation
- ✅ Indexes for performance

### Final Table Summary:
| Table | Status |
|-------|--------|
| `ai_trade_analyses` | ✅ user_id added, RLS enabled |
| `ips_score_calculations` | ✅ user_id added, RLS enabled |
| `ips_factors` | ✅ user_id added, RLS enabled |
| `trades` | ✅ user_id converted to UUID, RLS enabled |
| `ips_configurations` | ✅ user_id converted to UUID, RLS enabled |
| `watchlist_items` | ✅ RLS enabled (user_id was correct) |

Your app is now fully multi-user ready with complete data isolation! 🚀
