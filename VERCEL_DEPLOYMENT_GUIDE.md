# Vercel Deployment Guide - TenXiv Trading Platform

## Why Deploy to Vercel?

**Benefits:**
1. **Automated cron jobs** - Your snapshot and market context jobs run 24/7 without your server
2. **Zero maintenance** - No server to keep running locally
3. **Free tier** - Generous free plan (100GB bandwidth, unlimited requests)
4. **Automatic deployments** - Push to GitHub = instant deploy
5. **Global CDN** - Fast worldwide access
6. **Built-in SSL** - HTTPS automatically configured

**Current Problem:**
- Your cron jobs only work when `npm run dev` is running locally
- Vercel cron jobs run on Vercel's infrastructure, independent of your local machine

## Prerequisites

- [x] GitHub account
- [x] Vercel account (free - sign up at vercel.com)
- [x] Git installed locally
- [x] Your project already has `vercel.json` configured ✅

## Step-by-Step Deployment (15 minutes)

### Step 1: Push Your Code to GitHub (5 min)

If you haven't already:

```bash
# Initialize git (if not already done)
cd "c:\Users\tucke\OneDrive\Desktop\Project-Two"
git init

# Add remote (create repo on GitHub first)
git remote add origin https://github.com/YOUR_USERNAME/tenxiv.git

# Add all files
git add .

# Commit
git commit -m "Initial commit - ready for Vercel deployment"

# Push to GitHub
git push -u origin main
```

**Important:** Make sure `.env` is in your `.gitignore` (it should be) - never commit secrets!

### Step 2: Connect Vercel to GitHub (3 min)

1. Go to https://vercel.com
2. Click "Sign Up" → "Continue with GitHub"
3. Authorize Vercel to access your GitHub repos

### Step 3: Import Project (2 min)

1. Click "Add New..." → "Project"
2. Find your `tenxiv` repo in the list
3. Click "Import"

### Step 4: Configure Environment Variables (5 min)

**Critical:** Add all environment variables from your `.env` file:

```bash
# Vercel Dashboard → Your Project → Settings → Environment Variables

# Add these (copy from your .env file):

ALPHA_VANTAGE_API_KEY=XF0H4EC893MP2ATJ
NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY=XF0H4EC893MP2ATJ
ALPHA_VANTAGE_ENTITLEMENT=realtime
ALPHA_VANTAGE_MIN_DELAY_MS=10

SUPABASE_URL=https://bannkxicnkhajjokzpwu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-key-here
SUPABASE_ANON_KEY=eyJhbGc...your-key-here

NEXT_PUBLIC_SUPABASE_URL=https://bannkxicnkhajjokzpwu.supabase.co
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-key-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-key-here

NEXT_PUBLIC_DEFAULT_USER_ID=3d648cfe-a3df-4674-b12b-11e9b7d68a0b

DATABASE_URL=postgresql://postgres.bannkxicnkhajjokzpwu:YOUR_PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres

NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=https://your-vercel-app.vercel.app  # Update after first deploy

OLLAMA_HOST=http://golem:11434  # May not work on Vercel (local only)
OLLAMA_MODEL=llama4:maverick

TAVILY_API_KEY=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

OPENAI_API_KEY=sk-proj-...your-key-here

FRED_API_KEY=b339b58c3094acea9e095d5ad268f3a9

# IMPORTANT: Add the CRON_SECRET we just created!
CRON_SECRET=tenxiv_snapshot_cron_2025_secure_key_v1
```

**Scope:** Select "Production", "Preview", and "Development" for each variable

### Step 5: Deploy! (2 min)

1. Click "Deploy"
2. Wait ~2-3 minutes for build to complete
3. You'll get a URL like: `https://tenxiv.vercel.app` or `https://your-project-name.vercel.app`

### Step 6: Verify Cron Jobs Are Running (5 min)

After deployment, check logs:

1. Go to your Vercel project dashboard
2. Click "Deployments" → Latest deployment
3. Click "Functions" tab
4. Look for `/api/jobs/snapshot-sync`
5. Check execution logs

**Next cron run:**
- 2:30 PM EST Mon-Fri
- 6:00 PM EST Mon-Fri
- 9:00 PM EST Mon-Fri

You can also manually trigger to test:
```bash
curl https://your-app.vercel.app/api/jobs/snapshot-sync
```

## Your Configured Cron Jobs

From your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/jobs/daily-sync",
      "schedule": "0 22 * * 1-5"  // 10 PM EST Mon-Fri
    },
    {
      "path": "/api/jobs/snapshot-sync",
      "schedule": "30 14 * * 1-5"  // 2:30 PM EST Mon-Fri
    },
    {
      "path": "/api/jobs/snapshot-sync",
      "schedule": "0 18 * * 1-5"   // 6:00 PM EST Mon-Fri (+ market context)
    },
    {
      "path": "/api/jobs/snapshot-sync",
      "schedule": "0 21 * * 1-5"   // 9:00 PM EST Mon-Fri
    }
  ]
}
```

These will run automatically 24/7 once deployed to Vercel!

## Post-Deployment Updates

### Update NEXTAUTH_URL

After first deploy, update the environment variable:

1. Vercel Dashboard → Settings → Environment Variables
2. Edit `NEXTAUTH_URL`
3. Change to: `https://your-actual-app.vercel.app`
4. Redeploy (automatic on next git push)

### Add Custom Domain (Optional)

1. Vercel Dashboard → Settings → Domains
2. Add your domain (e.g., `tenxiv.com`)
3. Follow DNS instructions
4. SSL certificate auto-configured

## Troubleshooting

### Issue: Cron jobs not running

**Check 1: CRON_SECRET configured?**
```bash
# Vercel Dashboard → Settings → Environment Variables
# Verify CRON_SECRET exists with value: tenxiv_snapshot_cron_2025_secure_key_v1
```

**Check 2: Check function logs**
```bash
# Vercel Dashboard → Deployments → Latest → Functions
# Look for /api/jobs/snapshot-sync
# Check for errors in logs
```

**Check 3: Verify cron schedule**
```bash
# Make sure cron times are correct for your timezone
# Vercel uses UTC internally but converts based on your schedule format
```

### Issue: Environment variables not working

**Fix:** Make sure you selected all scopes (Production, Preview, Development)

1. Vercel Dashboard → Settings → Environment Variables
2. Click on each variable
3. Verify all three environments are checked
4. Redeploy if needed

### Issue: Database connection failing

**Fix:** Check if your Supabase connection allows external IPs

1. Supabase Dashboard → Settings → Database
2. Check "Connection pooling" settings
3. Vercel functions use dynamic IPs - ensure they're not blocked

### Issue: Build failing

**Common causes:**
- TypeScript errors (fix locally first with `npm run build`)
- Missing dependencies (ensure `package.json` is complete)
- Environment variables missing (add them before deploy)

**Debug:**
```bash
# Test build locally before deploying:
npm run build

# If it passes locally but fails on Vercel, check:
# 1. Node version compatibility
# 2. Missing files in .gitignore
# 3. Build command in vercel.json
```

### Issue: Ollama/Local LLM not working

**Expected:** Ollama won't work on Vercel (it's running locally)

**Options:**
1. Use OpenAI instead (already configured)
2. Deploy Ollama to a cloud server and update `OLLAMA_HOST`
3. Use Vercel Functions for non-LLM tasks only

## Monitoring After Deployment

### Daily Checks (First Week)

1. **Verify snapshots accumulating:**
   ```sql
   SELECT COUNT(*), DATE(snapshot_time) as date
   FROM trade_snapshots
   GROUP BY DATE(snapshot_time)
   ORDER BY date DESC;

   -- Should see ~54 snapshots per day (18 trades × 3 runs)
   ```

2. **Verify market context generating:**
   ```sql
   SELECT as_of_date, created_at, source_count
   FROM daily_market_context
   ORDER BY as_of_date DESC;

   -- Should see 1 new context per day
   ```

3. **Check Vercel function logs:**
   - Vercel Dashboard → Deployments → Latest → Functions
   - Look for errors or failed executions

### Weekly Monitoring

1. **Check Tavily credit usage:**
   - 20 credits/day × 7 days = 140 credits/week
   - You have 4000 credits = ~28 weeks

2. **Monitor database size:**
   - Supabase Dashboard → Database → Usage
   - Snapshots grow ~2.7MB/day

3. **Review Vercel usage:**
   - Vercel Dashboard → Usage
   - Free tier: 100GB bandwidth/month (should be plenty)

## Cost Comparison

### Before Vercel (Local Server)
- Must keep computer running 24/7
- Electricity: ~$10-20/month
- Maintenance: Manual restarts, updates
- Reliability: Subject to power outages, crashes

### After Vercel (Cloud)
- **Hosting:** Free (Vercel free tier)
- **Bandwidth:** Free (100GB/month included)
- **Functions:** Free (100,000 invocations/month)
- **Cron jobs:** Free (unlimited on hobby plan)
- **Electricity:** $0 (runs in cloud)
- **Maintenance:** Automatic

**Total Vercel cost:** $0/month (free tier)

### API Costs (Same Either Way)
- Alpha Vantage: $0 (premium tier unlimited)
- Tavily: 20 credits/day (from your 4000 credit pool)
- OpenAI: ~$0.30/month (GPT-4-mini + embeddings)

**Total monthly cost with Vercel: ~$0.30/month** (just OpenAI)

## Continuous Deployment

Once set up, any git push triggers automatic deployment:

```bash
# Make changes locally
git add .
git commit -m "Update trading logic"
git push

# Vercel automatically:
# 1. Detects push
# 2. Builds your app
# 3. Runs tests (if configured)
# 4. Deploys to production
# 5. Updates your live site

# Takes ~2-3 minutes total
```

## Advanced Configuration (Optional)

### Preview Deployments

Every pull request gets its own preview URL:
- Test changes before merging to main
- Share with collaborators
- Automatically deleted when PR closed

### Environment-Specific Variables

Different values for dev/staging/prod:
```bash
# Development:
NEXT_PUBLIC_API_URL=http://localhost:3000

# Preview:
NEXT_PUBLIC_API_URL=https://preview.tenxiv.vercel.app

# Production:
NEXT_PUBLIC_API_URL=https://tenxiv.com
```

### Analytics Integration

Vercel includes basic analytics:
- Page views
- Top pages
- Geographic distribution
- Performance metrics

**Enable:**
1. Vercel Dashboard → Analytics
2. Click "Enable"
3. Free on hobby plan

## Security Checklist

Before deploying:

- [ ] `.env` is in `.gitignore` (never commit secrets)
- [ ] All API keys added to Vercel environment variables
- [ ] `CRON_SECRET` configured in Vercel
- [ ] Database credentials secure (not in code)
- [ ] Supabase RLS policies enabled
- [ ] Authentication configured (NextAuth)
- [ ] CORS configured (if using external APIs)

## Rollback Plan

If something breaks after deploy:

1. **Instant rollback:**
   - Vercel Dashboard → Deployments
   - Find previous working deployment
   - Click "..." → "Promote to Production"
   - Takes ~10 seconds

2. **Git rollback:**
   ```bash
   git revert HEAD
   git push
   # Vercel auto-deploys the reverted version
   ```

## Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **Next.js on Vercel:** https://nextjs.org/docs/deployment
- **Cron Jobs:** https://vercel.com/docs/cron-jobs
- **Environment Variables:** https://vercel.com/docs/concepts/projects/environment-variables

## Summary

**Time to deploy:** ~15 minutes
**Cost:** $0/month (free tier)
**Benefit:** 24/7 automated cron jobs without local server
**Difficulty:** Easy (mostly clicking in UI)

Once deployed, your cron jobs will:
- Run automatically 3x daily for snapshots
- Generate market context at 6 PM daily
- Never require your local machine to be on
- Log all executions in Vercel dashboard
- Alert you on failures (configure in settings)

**Next step:** Follow Step 1 and push your code to GitHub!
