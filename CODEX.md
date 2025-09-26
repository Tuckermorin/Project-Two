15-minute Delayed US Stock Market Data: Enabled

To access 15-minute delayed US stock market data, please append entitlement=delayed to the data request. For example:
https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&entitlement=delayed&apikey=XF0H4EC893MP2ATJ

https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&entitlement=delayed&apikey=XF0H4EC893MP2ATJ

https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=IBM&outputsize=full&entitlement=delayed&apikey=XF0H4EC893MP2ATJ

💡Tip: you can also access 15-minute delayed technical indicators with similar URL configurations:
https://www.alphavantage.co/query?function=SMA&symbol=IBM&interval=5min&time_period=10&series_type=close&entitlement=delayed&apikey=XF0H4EC893MP2ATJ


Realtime US Stock Market Data: Enabled

To access realtime US stock market data, please append entitlement=realtime to the data request. For example:
https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&entitlement=realtime&apikey=XF0H4EC893MP2ATJ

https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&entitlement=realtime&apikey=XF0H4EC893MP2ATJ

https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=IBM&outputsize=full&entitlement=realtime&apikey=XF0H4EC893MP2ATJ

💡Tip: you can also access realtime technical indicators with similar URL configurations:
https://www.alphavantage.co/query?function=SMA&symbol=IBM&interval=5min&time_period=10&series_type=close&entitlement=realtime&apikey=XF0H4EC893MP2ATJ

❗IMPORTANT: if your subscription plan is also eligible for realtime US options data, please set up your options data entitlements here.
---
## Next Auth Steps

- Provision Supabase project (or NextAuth provider) and set environment variables in :
  - 
  - 
---

## Authentication Setup

- Provision Supabase (or NextAuth) credentials and add the secrets to `.env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`).
- Wrap the app in a session provider inside `src/app/layout.tsx` once auth is enabled.
- Replace the disabled submit actions in `src/app/login/page.tsx` and `src/app/account/page.tsx` with real API calls when sessions are available.
- Update `src/components/navigation.tsx` to show the signed-in user dropdown after wiring authentication.
