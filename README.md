# Freaking Math — Multiplayer (Supabase Realtime)

A static, mobile-friendly math race game using **Supabase Realtime channels** (no SQL tables required).

## Setup
1) Create a project at https://supabase.com and obtain:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
2) In `js/app_supabase.js`, replace the placeholders with your values.
3) Serve locally:
```bash
python3 -m http.server 5173
# visit http://localhost:5173
```
Or deploy to Netlify / Vercel (no build step).

## Notes
- Client trusts the browser for scoring; for stricter anti‑cheat, use a Supabase **Edge Function** to validate answers against the deterministic seed.
- Presence + broadcast are used; no database tables are needed unless you want to persist results.
