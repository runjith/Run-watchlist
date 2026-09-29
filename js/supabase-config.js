/* ============================================================
   RUN WATCHLIST — Supabase connection settings

   Fill in the two values below to connect your private
   Supabase database (SETUP_GUIDE.md, Part 4, shows where to
   find them):

     url      → Project Settings → API (or "Connect") → Project URL
     anonKey  → the PUBLISHABLE key (starts with sb_publishable_)
                or, on older projects, the "anon public" key
                (a long text starting with eyJ...)

   These two values are designed to be public. They let the
   website TALK to Supabase, but they do not let anyone READ
   your research: the database only answers people who have
   signed in with your email and password.

   NEVER put these here:
     ✗ the SECRET key (sb_secret_...) or the "service_role" key
     ✗ your database password
   The website refuses to start if it detects a secret key.

   Leave both empty ("") to run in local mode: everything is
   then kept only in this browser, with no sign-in.
   ============================================================ */

const SUPABASE_CONFIG = {
  url: "https://syvmtbilijekilsffzik.supabase.co",       // e.g. "https://abcdefghijklm.supabase.co"
  anonKey: "sb_publishable_YW5gjn-AELtgiLJsKV7naA_gYmdQ9Ig"    // e.g. "sb_publishable_..." or "eyJhbGciOiJIUzI1NiIs..."
};
