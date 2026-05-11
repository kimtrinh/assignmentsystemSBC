# Current Patient Assignment System — Kaiser Fontana & Ontario ED

## 1. Purpose & audience

This document describes how patient assignments are currently made in the Kaiser Fontana Medical Center (FMC) and Ontario Emergency Departments, as of the source materials referenced below. It exists as a shared reference for the team designing the eventual replacement (a web app for the assignment clerk and physicians, with automated rule enforcement). It is **descriptive**, not prescriptive — it captures the workflow as it actually runs today, not what we want it to become.

Audience: anyone who will design, build, or review the replacement system.

## 2. Sites & users

- **Sites covered:** Kaiser Fontana (FMC) and Kaiser Ontario. The two sites share the same assignment rules, but each maintains its own daily spreadsheet with site-specific shift labels and provider rosters.
- **Assignment clerk** — types entries into the daily sheet as patients are roomed; maintains the Main ED rotation grid and the Choose-in table; tracks skips on the assignment sheet.
- **Physicians** — read the sheet to know who is up next in the rotation, see their choose-in selection, and confirm skips. They do not normally edit the sheet directly.
- **Charge RN / Doctor of the Day (DOD)** — have authority over operational decisions such as converting a First Track shift to a Mod Pod shift when no MP provider is available. Their exact editing footprint on the sheet is an open question (see §7).

## 3. Source artifacts

- **Fontana daily sheet (Google Sheets):** https://docs.google.com/spreadsheets/d/1E1T2x5kNpn4SM7yRzY_jwboXWGBssd0StDGVssQcB98/edit
  Drive `fileId: 1E1T2x5kNpn4SM7yRzY_jwboXWGBssd0StDGVssQcB98`
- **Assignment rules and recommendations (Google Doc), dated 4/25/2022:** https://docs.google.com/document/d/1d41YC683ZWRF8Ji7d3mLi_jzdMcau8_U/edit
  Drive `fileId: 1d41YC683ZWRF8Ji7d3mLi_jzdMcau8_U`
- **Ontario daily sheet:** pending — to be added by the user. This document will be updated once received.

## 4. Daily spreadsheet anatomy (Fontana)

Each day has its own tab, named like `May 8 2026`. The worked examples in this section come from that tab.

### 4.1 Header

- **Date / Year** — identifies the tab.
- **Current NEDOCS score** — the ED's National Emergency Department Overcrowding Score for the day's snapshot. A "Check" column appears to indicate when the score should be re-read.

### 4.2 Main ED Rotation grid

The largest region of each tab. It is organized into **hour blocks** running 0500, 0600, 0700, …, through 2400. Each hour block has rows for the patients roomed in that hour, with these columns:

- **Time** — the time the patient was roomed (e.g., `500`, `501`, `642`).
- **Bed** — bed identifier (numeric rooms such as `23`, `45`; AH/BH/CH/DH/FX/RW prefixes for sub-areas, e.g., `AH2`, `RW01`, `FX8`).
- **Physician** — the named provider the patient is assigned to (e.g., `Austin Nguyen 5a-3p`, `Sin 5a-3p`, or placeholders such as `choice--overnight1` for overnight choose-in slots).
- **Comments / ESI** — free-text and/or ESI level (e.g., `2`, `3`, `NEDOCS 99`, `MASSENGALE`, `CHARLES`).

The clerk fills rows in as patients are roomed, working down within the hour. The **order rows are filled** within an hour effectively encodes the round-robin order (see rules in §5.1).

Cells marked `X` indicate that a slot is closed or intentionally skipped.

### 4.3 Provider Schedule

A small table to the right of the rotation grid lists the day's shifts:

| Shift label | Provider | Start | End |
| --- | --- | --- | --- |
| 5a-3p (1) | Austin Nguyen 5a-3p | 500 | 1500 |
| 5a-3p (2) | Sin 5a-3p | 500 | 1500 |
| 6a-4p (1) | Schwartzwald 6a-4p | 600 | 1600 |
| 6a-4p (2) | Luong 6a-4p | 600 | 1600 |
| 10a-10p | Sperry 10a-10p | 1000 | 2200 |
| 12p-10p | Zhou M 12p-10p | 1200 | 2200 |
| 1p-11p | Rasheed 1p-11p | 1300 | 2300 |
| 2p-12a | *(open)* | 1400 | 2400 |
| 3p-1a | Britton 3p-1a | 1500 | 100 |
| 8p-8a (1) | Zhou J 8p-8a | 2000 | 800 |
| 8p-8a (2) | B. Chen 8p-8a | 2000 | 800 |
| 9p-7a | Khauv 9p-7a | 2100 | 700 |
| 10p-8a | David Lee 10p-8a | 2200 | 800 |

A separate `PITT` line (e.g., `Chock 10a-10p`) appears alongside.

### 4.4 NEDOCS column

A per-hour NEDOCS reading is tracked down the page (`99`, `105`, `96`, `115`, `179`, `162`, `159`, …), giving a time-series of crowding for the shift.

### 4.5 Choose-in Patient table

Last-hour selections, one row per provider:

| Provider | Time/Bed | ESI / Patient |
| --- | --- | --- |
| Austin Nguyen 5a-3p | 512 / B18 | 23831594 / LV 2 |
| Sin 5a-3p | 508 / 41 | TOSCANO |
| Schwartzwald 6a-4p | 0950 / AH2 | Nunez |
| Luong 6a-4p | 1411 / FX16 | 26642861 / LV 4 |
| Sperry 10a-10p | 1530 / 41 | 2 |
| Zhou M 12p-10p | 1810 / 35 | VEGA. B-2 |
| Rasheed 1p-11p | 2126 / l4 | Howard, C |
| Britton 3p-1a | 1530 / L2 | Gatson, G |
| Zhou J 8p-8a | 2239 / l2 | 36 / Shimp, R |
| B. Chen 8p-8a | *(empty)* | *(empty)* |
| Khauv 9p-7a | 2117 / L3 | 15 / Soto, C |
| David Lee 10p-8a | *(empty)* | *(empty)* |

The clerk fills this in during each provider's last hour as the choose-in patient is selected (see rules in §5.2).

### 4.6 Fixed shift template — "Do not make changes to the section below"

A block on the right side of each tab enumerates Fontana's canonical daily shift slots. The labels are fixed; the right-hand column is **auto-populated** with whichever named provider is on that shift today.

Canonical slots:

- **Red (Main):** 5a-3p, 6a-4p, 10a-10p, 12p-10p, 2p-12a, 8p-8a
- **Blue (Main):** 6a-4p, 8a-6p, 1p-11p, 3p-1a, 8p-8a, 9p-7a, 10p-8a
- **PEDS:** 3p-1a, plus PEDS 2 11a-11p
- **PITT:** 10a-10p
- **FLEX:** 7a-7p, 8a-8p, 1p-1a, 2p-2a, 6p-6a
- **DOD:** 1 (6a-10a), 2 (10a-9p), 3 (9p-12a), 4 (12a-6a)

Example mapping on `May 8 2026`:

| Slot | Provider |
| --- | --- |
| FMC – Red 5a-3p | Austin Nguyen 5a-3p |
| FMC – Red 6a-4p | Sin 5a-3p |
| FMC – Blue 6a-4p | Schwartzwald 6a-4p |
| FMC – Blue 8a-6p | Luong 6a-4p |
| FMC – Red 10a-10p | Sperry 10a-10p |
| FMC – Red 12p-10p | Zhou M 12p-10p |
| FMC – Blue 1p-11p | Rasheed 1p-11p |
| FMC – Red 2p-12a | OPEN ASSIGNMENT 2p-12a |
| FMC – Blue 3p-1a | Britton 3p-1a |
| FMC – Red 8p-8a | Zhou J 8p-8a |
| FMC – Blue 8p-8a | B. Chen 8p-8a |
| FMC – Blue 9p-7a | Khauv 9p-7a |
| FMC – Blue 10p-8a | David Lee 10p-8a |
| FMC – PEDS 3p-1a | Rajasingham 3p-3a |
| FMC – PITT 10a-10p | Chock 10a-10p |
| FMC – FLEX 7a-7p | Stebbins 5a-5p |
| FMC – FLEX 8a-8p | Gore 8a-8p |
| FMC – FLEX 1p-1a | Hong 12p-12a |
| FMC – FLEX 2p-2a | Garcia 3p-3a |
| FMC – FLEX 6p-6a | Afagh 6p-6a |
| FMC – DOD 1 6a-10a | Luong 6a-10a |
| FMC – DOD 2 10a-9p | Chock 10a-9p |
| FMC – DOD 3 9p-12a | Britton 9p-12a |
| FMC – DOD 4 12a-6a | Zhou J 12a-6a |

### 4.7 Per-hour bed snapshots and acuity rollups

Smaller grids appear throughout each tab listing the rooms/beds in use at each hour (e.g., a `1000` block with rooms `D40, C34, C30, CH04, D43, AH03, D49, X, C37, A05, B19, B17`) and per-hour acuity tallies (columns of ESI numbers next to a NEDOCS reading). These appear to be situational snapshots rather than primary inputs to the rotation grid.

## 5. Assignment rules

Source: *Assignment rules and recommendations*, 4/25/2022. The rules below are organized as in the source.

### 5.1 Main ED

- Physicians are assigned the **first three patients** roomed in their first hour.
- Subsequent assignments are **round-robin**.
- **Physician Safety Goal (PSG)** is **two patients per hour**.
- **High-acuity override:** if a Level 1 or Level 2 patient is roomed and needs attention, they are assigned to the next physician in rotation regardless of how many patients that physician already has. The patient is **credited to the subsequent hour**.
- **Level 4 / 5 weighting:** for logistical reasons, Level 4 and Level 5 patients count for **one full PSG slot** when assigned to a Main physician.
- **No-patient-hour-1 catch-up:** if a provider sees no patients in their first hour, they see **three patients up front** in their next hour.
- **L4/5 cannot serve as choose-in:** if a L4/5 patient is seen earlier in the shift, it should not be counted as their last patient; the choose-in is selected in the **last hour**.

### 5.2 Last hour / Choose-in

- The physician may select **the longest-waiting Level 4/5** patient or **any bedded patient in the Main**.
- The patient may be selected **after the physician's last Main patient has been assigned**, OR **with 15 minutes until the last hour** if they have not yet been assigned their last Main patient.
- **L2 emergency override:** if a Level 2 patient needing emergent attention arrives, the physician has not yet selected their choose-in, and the rotation is otherwise full, that L2 is assigned to them.
- **No nursing, no patient:** if nursing is unavailable to assist with patient care and there are no appropriate patients that can be seen without assistance, that PSG is left open.

### 5.3 Skips

- A physician may take **one "skip"** from a PSG slot for a procedure. They — or someone on their behalf — must inform the assignment clerk of the procedure and room number; both are recorded on the assignment sheet.
- If the provider is still occupied when their next assignment comes up, efforts should be made not to assign them an **unstable Level 2**.
- **One skip per patient when multiple physicians are involved.** Example: for a sedation + reduction, only one physician may claim the skip. The physicians decide who claims it.
- **One skip per patient when multiple procedures are done by the same physician.** Example: intubation + central line = one skip.
- **Code Blue / Critical resuscitation:** the attending physician may take a skip if the code is involved. Other physicians may only claim a skip if they performed a procedure on that patient. This is the only exception to the one-skip-per-patient-per-provider rule. "Assisting the code" does not warrant a skip.
- A skip may be **carried into the next hour** if the doctor does not come up in the rotation in the hour of the procedure.

### 5.4 Mod Pod / First Track — shared rules

- Assign waiting-room patients **no more than two hours in advance** to limit backfills from LWBS (Left Without Being Seen). If the provider is working faster, they may notify the clerk to assign further out.
- **LWBS backfill window:** if a patient LWBS or is upgraded to the Main **without any workup performed**, the provider is backfilled with another patient up until **one hour after the assigned hour**. (E.g., if assigned for the 1900 hour, backfill is allowed until 2059 regardless of when the patient was actually seen.) If a note and work-up were performed, the provider keeps credit for the patient.
- Patients are **not re-assigned a new ESI** when seen to give credit (e.g., a Level 4 "should have been a Level 3" does not get re-leveled).
- The **designated clerk** is responsible for assigning patients in MP and FT. The provider is encouraged to bring their list of patients seen to coordinate mismatches and clarify LWBS / backfills.

### 5.5 Mod Pod

- Patients are assigned from a pool of designated Mod Pod patients.
- **Three** patients in the first hour, **two** every subsequent hour.
- A **two-hour wrap-up** at the end, with the last assigned hour being a **choose-in** patient.
- The MP choose-in is either the **longest-waiting Level 4/5** or another Level 3 mod pod patient.
- The MP provider may be assigned Level 4s as needed.
- The hourly assignment shape looks like one of:
  - 1× L3 + 1× L3
  - 1× L3 + 1× L4
  - 1× L4 + 1× L4
  - 1× L3 + 1× L4 (only if no other L4s are available)
- If only L4s are available in the **first hour**, the provider may be assigned **four** patients that hour.

### 5.6 First Track

- Patients are assigned from Level 4s and 5s, **three per hour**.
- **Soft Level 3s** may also be assigned and count for **two** spots in that hour.
- **One-hour wrap-up** at the end of the shift.
- **FT → MP conversion:** if no Mod Pod provider is available, the **Charge RN and DOD** may convert the shift to a Mod Pod shift. MP assignment rules and the two-hour wrap-up then apply, but the hours stay the same as the originally assigned shift.

### 5.7 Tent patients

Primarily assigned to FT or MP providers, but may be given to Main providers as needed. **Surge note:** if numbers reach surge levels, a formal assignment policy for tent patients will be created (does not yet exist in the rules doc).

### 5.8 Lactation

- A lactation break may be taken **twice in a 12-hour Main shift** and **once for all other shifts**.
- It is treated as **any other skip**, and may be marked as a **personal skip** on the assignment sheet.

## 6. Glossary

- **NEDOCS** — National Emergency Department Overcrowding Score; a numeric measure of ED crowding.
- **PSG** — Physician Safety Goal; the target patients-per-hour load (2 in Main ED).
- **ESI** — Emergency Severity Index; 1 (most acute) through 5 (least acute).
- **Level 1 / Level 2** — high-acuity patients (ESI 1/2).
- **Level 4 / Level 5** — low-acuity patients (ESI 4/5).
- **Soft 3** — an ESI 3 patient considered lower-acuity than typical Level 3s; in First Track, counts as 2 slots.
- **LWBS** — Left Without Being Seen.
- **MP** — Mod Pod.
- **FT** — First Track.
- **DOD** — Doctor of the Day; an administrative/leadership shift.
- **PEDS** — Pediatrics shift.
- **PITT** — a named provider shift slot (specific role TBD; see open questions).
- **FLEX** — flexible-coverage shifts overlapping multiple service lines.
- **FMC** — Fontana Medical Center.
- **Red / Blue** — Main ED color-team designations for shift slots.
- **Choose-in** — the patient a provider selects to see in their last hour.
- **Skip** — a forfeited PSG slot, typically for a procedure, code, or lactation break.
- **Tent** — overflow/triage tent patients.

## 7. Open questions

These are flagged for the user to resolve before we design the replacement.

1. **Ontario sheet** — user will share the Ontario equivalent of the Fontana daily sheet. Once shared, document its layout, shift labels, and any divergences from Fontana.
2. **FMC shift template auto-population** — confirmed as auto-populated, but the source of truth (master roster sheet? imported schedule? formula referencing another tab?) is not yet documented. Knowing this is critical for the replacement, since the new app will need an equivalent roster source.
3. **Ontario shift labels** — does Ontario use the same Red/Blue/PEDS/PITT/FLEX/DOD vocabulary, or different team/section names?
4. **Charge RN / DOD editing footprint** — beyond converting FT → MP, what do these roles actually edit in the sheet (skips? overrides? choose-in eligibility?)?
5. **Skip tracking surface area** — the rules require recording the procedure and room number for skips, but the current sheet does not have a visible dedicated column for skips. Are they recorded only in the free-text Comments column, or in a side region not yet identified?
6. **PITT role** — what does PITT stand for / what patient population does that shift cover?
7. **Provider Schedule vs. fixed shift template** — both regions list providers and shifts; clarify which is the authoritative source the rotation grid pulls from when there are conflicts.
8. **"OPEN ASSIGNMENT" entries** — e.g., `OPEN ASSIGNMENT 2p-12a` in the FMC template. Is this a placeholder for an unfilled shift, or a real "swing" slot the clerk distributes?

## 8. Out of scope for this document

- Design or architecture of the replacement web app.
- Data model, schema, or screen mockups.
- Ontario sheet contents (pending share).
