# GAIN WAVES app

Phone-first web app for the GAIN WAVES club: log workouts, earn XP, climb from Rookie to Freak.
A brand of Waves SIA, Riga.

- Static site (no build step): `index.html`, `app.css`, `app.js`, `config.js`.
- Data and sign-in: Supabase (EU, Frankfurt). XP is calculated in the database, not in the app.
- Run locally: `python3 -m http.server 4521` in this folder, then open http://localhost:4521.
