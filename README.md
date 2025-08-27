# Freaking Math — Multiplayer (Supabase, T/F, Guest-Friendly)

**Guest flow:** If the URL contains `?room=ABC123` (as in the QR), the **Host** panel is hidden and the **Create Room** button is disabled, so guests can **only join** and wait for the host.

- True/False gameplay like Freaking Math
- Supabase Realtime channels + presence
- QR join with `?room=` auto-filled

## Setup
1) Put your Supabase credentials into `js/app_supabase_tf_guestflow.js`.
2) Deploy to Netlify/Vercel. The host creates a room and shares the QR (which includes `?room=CODE`), so guests never see the create option.

## Troubleshooting

- Run `python3 -m http.server 5173` and open `http://localhost:5173` for local testing.
- In local mode, the console prints diagnostic messages and surfaces runtime errors.
- Run `npx eslint js/app_supabase_tf_guestflow.js` to catch undefined variables like accidental `True`.
