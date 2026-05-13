# ED Patient Assignment System

A static web replacement for the Kaiser Fontana / Ontario ED patient assignment
spreadsheet. Hosted on **GitHub Pages**.

> **Single-user only.** This is a static build — there is no server and no
> shared database. Every board lives in **your own browser's localStorage**:
>
> - Two clerks open the same date → they see two separate, empty boards.
> - Clearing browser data / using a different browser / using a different
>   device deletes your boards.
> - If you need live collaboration across people, move this off GitHub Pages
>   to a host that can run the API (e.g. Vercel free tier with a Postgres
>   database). The git history before this commit had that version.

## What's in V1

- **Main ED rotation grid** — hour blocks (0500…2400, 0100…0400), each with
  rows for Time, Bed, Physician (picked from the roster), Comments
  (ESI level **or** skip reason).
- **Today's roster** — type a provider's name into each canonical FMC shift
  slot (Red, Blue, PEDS, PITT, FLEX, DOD).
- **Choose-in** — per-provider time/bed + ESI/patient, appears once a
  provider is named.

## Stack

- Next.js 14 (App Router) configured for **static export** (`output: "export"`)
- React 18 + TypeScript
- Tailwind CSS
- `localStorage` for persistence (no server, no DB)
- GitHub Actions → GitHub Pages for deploy

## Deploying to GitHub Pages

The workflow at `.github/workflows/pages.yml` is already set up to build and
deploy on every push to `main` (or the development branch). You only have to
turn Pages on once:

1. In GitHub: **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Merge this branch to `main` (or push to it). The workflow will build the
   site and publish it.
4. The live URL will be:
   `https://<your-github-username>.github.io/assignmentsystemSBC/`

The `next.config.mjs` sets `basePath: "/assignmentsystemSBC"` whenever the
build runs under GitHub Actions (`GITHUB_PAGES=true`), so all routes, CSS,
and JS resolve correctly under that subpath. If you rename the repo, update
that string.

## Local development (optional)

You don't need to run anything locally — pushes deploy automatically.
If you do want to:

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static export to ./out
```

## Using the board

1. Open the deployed URL.
2. Pick **Kaiser Fontana** (or Ontario) and a date — today is preselected.
3. **Roster panel (right)** — type each provider's name into their shift slot
   at the start of the shift.
4. **Rotation grid (left)** — for each hour block, click **+ Add row** as
   patients are roomed and fill in:
   - **Time** — time roomed (e.g., `642`)
   - **Bed** — bed identifier (e.g., `AH2`, `23`, `FX8`)
   - **Physician** — pick from the dropdown (sourced from the roster)
   - **Comments** — ESI level or skip reason
5. **Choose-in panel (right)** — once a provider is named, a choose-in row
   appears: enter `time/bed` and `ESI/patient` during the last hour.

All edits autosave to `localStorage` immediately. The URL hash
(`#/FMC/2026-05-11`) reflects the open site+date, so you can bookmark a day.

## Editing the FMC shift template

Edit the `FMC_SLOTS` array in `lib/shiftTemplate.ts` and push. Pages will
redeploy. Ontario's template is currently empty (`slots: []`) — fill in the
list there when you have it.

## Optional: Supabase + Vercel for shared, realtime boards

The app runs against a Supabase backend when these two env vars are set; if
either is missing it falls back to per-browser `localStorage` (the original
single-user mode, still fine for GitHub Pages).

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### One-time Supabase setup

1. Create a new project at https://supabase.com (free tier is fine for
   prototyping with **de-identified / fake** patient data — see HIPAA note
   below before going live).
2. Open the SQL editor and run, in order:
   - `supabase/migrations/0001_init.sql` — creates the `days` table
     (one row per site+date holding the JSONB DayState), the `audit_log`
     table, RLS policies, and enables realtime broadcasts on `days`.
   - `supabase/migrations/0002_audit_log_user_name.sql` — adds the
     `user_name` column the History panel attributes entries to.
3. **Authentication → Providers → Anonymous Sign-Ins**: enable. The app
   silently signs every visitor in as an anonymous Supabase user so
   realtime writes are authenticated without a login flow. There's no
   sign-in screen, magic-link email, or password — visitors just type
   their name in the header so audit entries can be attributed.
4. **Authentication → URL Configuration**: add your deployed origin
   (e.g. `https://ed-assign.vercel.app/`) plus `http://localhost:3000/`
   to the **Site URL** / **Redirect URLs** list.

### Turning it on with the GitHub Pages workflow (easiest)

`.github/workflows/pages.yml` already reads `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from repository secrets at build
time. To enable shared realtime on the live Pages URL:

1. In your GitHub repo: **Settings → Secrets and variables → Actions
   → New repository secret.**
2. Add `NEXT_PUBLIC_SUPABASE_URL` with your Project URL.
3. Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the anon public key.
4. Push to `main` (or re-run the Pages workflow). The next deploy will
   inline the values and the **"Local only"** pill in the DayBoard
   header will switch to **"Live sync"**.

There's no risk in leaving the secrets unset — the workflow already
handles the empty case and just builds the localStorage-only app.

### Or: deploy to Vercel

1. Import this GitHub repo in Vercel (`Add New → Project`).
2. Framework: Next.js. Build command: `next build`. Output directory: `out/`.
3. Under **Environment Variables**, paste in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. Each push to your tracked branch rebuilds automatically.

### How to tell if sync is on

A small status pill in the DayBoard header reads:

- 🟢 **Live sync** — Supabase configured, anonymous session, realtime
  subscription active. Edits propagate within ~1s.
- 🟢 **Live · you@example.com** — same as above but signed in via the
  optional email magic link from the Picker.
- 🟡 **Local only** — no backend env vars set. Per-browser only.
- ⚪ **Connecting** — waiting on the first getSession to resolve.

### Behavior with vs. without Supabase

| Configured | What happens |
| --- | --- |
| Both env vars present | No sign-in screen. Visitor is auto-signed-in as an anonymous Supabase user; the "You:" field in the header captures their name for the audit log. Realtime board shared across every browser. localStorage still mirrors the data so refreshes work offline. |
| Either env var missing | No sign-in screen. Single-user localStorage mode, same as the GitHub Pages build. The "You:" field still labels audit entries locally. |

### HIPAA note

Patient name, bed, and ESI in this app are PHI. The moment that data lives
in Supabase you need a **signed Business Associate Agreement** before
storing real patient data. Supabase signs BAAs only on their paid tier.
Until then: use this for prototyping with de-identified / fake data only.

## What's not in V1

- Mod Pod and First Track grids (rules §5.5 / §5.6) — separate rotations
  with their own PSG tapers, not yet modeled.
- Structured skip tracking with rule enforcement (one skip per provider
  per patient, lactation limits, code-blue exception).
- Per-hour bed snapshots and acuity rollups (source sheet §4.7).
- EHR (Epic) integration.
- Ontario-specific shift template.
