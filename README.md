# ENT R1 Mock Web

A static, Vercel-ready single-page mock examination for ENT R1 Basic Science Set 02 (61 questions, 90 minutes).

Each question is answered one at a time: choose an option, submit it, and the 90-minute timer pauses while the explanation is shown. Submitted answers are final. Moving to the next question resumes the timer. The timer also pauses whenever the exam is not on screen — on the home screen, in a hidden tab, or after the tab is closed — so an attempt can be picked up later without the clock having drained in the meantime. A full answer review is still available after the exam is submitted.

## Local preview

No install step is required. From this directory, run:

```bash
npx serve .
```

Open the local URL printed by the command. For code and data checks, run:

```bash
npm run check
npm test
```

## Optional: sync across devices with Supabase

The app is fully usable offline with no setup — every attempt and score lives in `localStorage`. Signing in with a magic link turns on best-effort sync on top of that local copy, for the one person using this app on more than one device. Supabase is never required and is never on the critical path: if it's unconfigured, unreachable, or the free-tier project has paused itself from being idle, the app just keeps working locally.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` from this repo. It creates the `attempts` and `summaries` tables (one row per user per `set_id`, so later sets don't need a migration) with Row Level Security policies that scope every row to `auth.uid()` — that's what makes it safe to use the anon key in the browser.
3. In **Authentication → Providers**, leave Email enabled and turn off "Confirm email" if you want the magic link to sign a first-time visitor straight in.
4. In **Authentication → URL Configuration**, add this site's deployed URL (and `http://localhost:3000` for local preview, if you use `npx serve .`) as a redirect URL.
5. Copy the project's API URL and anon/public key into `js/supabase-config.js` (this repo already carries a live pair). Commit that file — the anon key is publishable by design and only ever grants what the RLS policies above allow. Never put the `service_role` key there.
6. Redeploy. A "Sync across devices" box appears in the header; entering an email sends a magic link, and once signed in, attempts and scores sync last-write-wins by timestamp between devices. Remote writes are coalesced — rapid answering costs a handful of them rather than one per click — and anything still queued is flushed when the tab is hidden or closed.

## Deploy to Vercel

Either import this folder/repository in the Vercel dashboard (Framework Preset: **Other**) and deploy, or use the CLI:

```bash
npx vercel deploy
```

The app is static; `vercel.json` supplies clean URLs and response headers.
