# ED Patient Assignment System

A web replacement for the Kaiser Fontana / Ontario ED patient assignment spreadsheet.

V1 (this commit) covers what the assignment clerk types into the sheet today:

- **Main ED rotation grid** — hour blocks (0500…2400, 0100…0400) with rows for Time, Bed, Physician, Comments (ESI level **or** skip reason).
- **Today's roster** — assign a provider name to each canonical FMC shift slot (Red, Blue, PEDS, PITT, FLEX, DOD).
- **Choose-in** — per-provider last-hour selection (time/bed + ESI/patient).

Multiple users can view and edit live: the board polls every 2 seconds, so changes by the clerk appear on physician screens within ~2 seconds.

Documentation of the current (spreadsheet) system lives in [`docs/current-system.md`](docs/current-system.md).

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS
- SQLite via Prisma
- SWR for client-side data fetching + polling

## Setup

```bash
npm install
npm run db:push      # create the SQLite schema
npm run db:seed      # seed Fontana shift slots + Ontario site
npm run dev          # start at http://localhost:3000
```

The SQLite file lives at `prisma/dev.db` (ignored by git). `DATABASE_URL` is read from `.env`.

## Using the board

1. Open `http://localhost:3000`.
2. Pick **Kaiser Fontana** (or Ontario) and a date — today is preselected.
3. **Roster panel (right)** — type each provider's name into their shift slot at the start of the shift.
4. **Rotation grid (left)** — for each hour block, click **+ Add row** as patients are roomed and fill in:
   - **Time** — time roomed (e.g., `642`)
   - **Bed** — bed identifier (e.g., `AH2`, `23`, `FX8`)
   - **Physician** — pick from the dropdown (sourced from the roster)
   - **Comments** — ESI level (e.g., `2`) or skip reason (e.g., `skip: intubation room 35`)
5. **Choose-in panel (right)** — once a provider is named, a choose-in row appears: enter `time/bed` and `ESI/patient` during the last hour.

All fields autosave on blur. The header shows a "Live · refreshing every 2s" indicator.

## Data model (brief)

- `Site` — Fontana, Ontario.
- `ShiftSlot` — canonical daily shift template per site (auto-created from `prisma/seed.ts`).
- `Day` — one row per (site, date).
- `RosterEntry` — links a `Day` to a `ShiftSlot` with the provider name typed in for that day.
- `Assignment` — rows in the rotation grid (one per patient roomed).
- `ChooseIn` — last-hour selection per `RosterEntry`.

## What's not in V1

- Rule enforcement (round-robin order, PSG counts, L1/L2 override, L4/5 weighting, skip carry-over) — coming next.
- NEDOCS tracking, per-hour bed snapshots.
- Authentication / user accounts.
- EHR (Epic) integration.
- Ontario-specific shift template (currently empty; user will provide).

## Editing the FMC shift template

Edit `prisma/seed.ts` and run `npm run db:seed` again. Existing slots are matched by label and updated in place; new labels are added.
