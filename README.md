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

## What's not in V1

- Shared/collaborative state across users (impossible on Pages — see warning).
- Rule enforcement (round-robin order, PSG counts, L1/L2 override, L4/5
  weighting, skip carry-over).
- NEDOCS tracking, per-hour bed snapshots.
- Authentication / user accounts.
- EHR (Epic) integration.
- Ontario-specific shift template.
