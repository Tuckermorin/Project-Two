# Authentication Integration Checklist

The application is wired for Supabase Auth. Complete these steps to finish the connection:

1. **Supabase project**
   - Create (or reuse) a Supabase project.
   - Enable **Email/Password** authentication under *Authentication → Providers*.
   - Set the *Site URL* to your production domain (and `http://localhost:3000` for local development).

2. **Environment variables**
   - Add the following to `.env` (all required):
     - `NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_PUBLIC_ANON_KEY"`
     - `SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"`
   - Restart the Next.js dev server after updating the file.

3. **Redirect URLs / CORS**
   - In Supabase, open *Authentication → URL Configuration* and add your production domain and `http://localhost:3000` to the Redirect URLs list so the auth cookies can round-trip.

4. **User management**
   - Create user accounts via the Supabase dashboard or the `/login` page.
   - The Account screen updates `auth.users` metadata (display name + phone). Password resets still rely on Supabase’s built-in flows.

5. **Emails (optional)**
   - Configure SMTP settings in Supabase if you want password reset / confirmation emails.

Once these steps are complete, the navigation bar, login page, and account page will automatically reflect the signed-in session.
