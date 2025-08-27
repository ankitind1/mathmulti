# Freaking Math — Multiplayer (Supabase, True/False)

This variant uses **Correct / Wrong** buttons like the original Freaking Math:
- Shows equations like `8 + 9 = 17`
- Tap **Correct ✅** if true, **Wrong ❌** if false
- One mistake → eliminated; highest score wins
- Supabase Realtime **channels + presence** (no DB tables)

## Setup
1) Create a Supabase project → copy `SUPABASE_URL` and `anon` key.
2) Put them into `js/app_supabase_tf.js`.
3) Serve locally with `python3 -m http.server 5173` or deploy to Netlify/Vercel.

## Notes
- The equation’s RHS is deterministically correct or off by ±1..3 from a seeded RNG, so everyone sees the **same statement order**.
- For anti‑cheat, add a Supabase **Edge Function** to validate answers from the seed.
