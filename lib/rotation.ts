import type { Assignment } from "./storage";
import type { ShiftSlot } from "./shiftTemplate";
import { MAIN_ROTATION_TEAMS } from "./shiftTemplate";
import { effectiveShift } from "./effectiveShift";
import { HOUR_BLOCKS } from "./hours";
import { isRotationActive, psgCapacityAt } from "./psg";

function hourIndex(hour: number): number {
  const i = HOUR_BLOCKS.indexOf(hour);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

export function coversHour(slot: ShiftSlot, hour: number): boolean {
  const start = parseInt(slot.startTime.split(":")[0], 10);
  let end = parseInt(slot.endTime.split(":")[0], 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (end === 0) end = 24;
  if (end === start) return false;
  if (end > start) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

// Filters to providers whose effective shift (real start/end from their name
// when available) is active at this hour. A wrap-up (X) hour is treated as
// off-shift for rotation purposes.
export function onShiftSlots(
  slots: ShiftSlot[],
  roster: Record<string, string>,
  hour: number
): ShiftSlot[] {
  return slots.filter((s) => {
    const name = (roster[s.id] ?? "").trim();
    if (!name) return false;
    const eff = effectiveShift(s, name);
    return isRotationActive(eff, hour);
  });
}

// Pull an ESI level (1..5) out of free-text comments. Matches explicit
// markers first ("lvl2", "L-3", "ESI 4") and falls back to a leading digit
// ("2", "3 some note"). Returns null if no level is recognizable.
export function parseESI(
  comments: string | undefined | null
): number | null {
  if (!comments) return null;
  const explicit = comments.match(/(?:lvl?|esi|l[-\s])\s*([1-5])\b/i);
  if (explicit) return parseInt(explicit[1], 10);
  const leading = comments.match(/^\s*([1-5])(?=\s|$|\*)/);
  return leading ? parseInt(leading[1], 10) : null;
}

// Per-hour PSG capacity for a slot, after applying:
//   - effective shift (provider's actual times from their name)
//   - catch-up rule: 0 patients in their first hour -> 3 in the next
//   - L1/L2 next-hour credit: overage L1/L2 rows in the previous hour
//     reduce this hour's capacity by 1 each
export function effectiveCapacity(
  slot: ShiftSlot,
  hour: number,
  roster: Record<string, string>,
  allAssignments: Assignment[]
): number {
  const name = roster[slot.id];
  const eff = effectiveShift(slot, name);
  let cap = psgCapacityAt(eff, hour);
  if (cap <= 0) return cap;

  const startH = parseInt(eff.startTime.split(":")[0], 10);
  if (!Number.isNaN(startH)) {
    const offset = (hour - startH + 24) % 24;
    if (offset === 1) {
      const firstHourCount = allAssignments.filter(
        (a) => a.shiftSlotId === slot.id && a.hourBlock === startH
      ).length;
      if (firstHourCount === 0) cap = 3;
    }
  }

  const prevHour = (hour - 1 + 24) % 24;
  const prevCap = psgCapacityAt(eff, prevHour);
  const prevAssigns = allAssignments
    .filter((a) => a.shiftSlotId === slot.id && a.hourBlock === prevHour)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const overage = Math.max(0, prevAssigns.length - prevCap);
  if (overage > 0) {
    const l12Overage = prevAssigns
      .slice(-overage)
      .filter((a) => {
        const esi = parseESI(a.comments);
        return esi === 1 || esi === 2;
      }).length;
    cap = Math.max(0, cap - l12Overage);
  }

  return cap;
}

// Round-robin pick driven by the per-hour PSG taper from the FMC PSG sheet,
// using effective capacity (real provider times + rule adjustments).
//
// The rotation pointer carries across hour boundaries: once a provider is
// picked, the cycle advances to them, and the next pick searches forward in
// canonical (allSlots) order from that point. So if hour 05:00 ended with
// Gomez as the last patient, hour 06:00's first non-bolus pick is whoever
// comes after Gomez in the schedule, NOT a restart at the top of the list.
//
// Bolus is layered on top: while any provider in the pool is still in their
// first-hour / catch-up bolus and has remaining capacity, the search skips
// non-bolus providers. This lets two newly-started providers land their 3
// patients each (interleaved) before the continuing providers get one,
// while still respecting the cross-hour pointer for the post-bolus order.
//
// `steps` is the placeholder's position (0 = the very next one up).
export function predictRotation(
  pool: ShiftSlot[],
  allSlots: ShiftSlot[],
  allAssignments: Assignment[],
  hour: number,
  steps: number,
  roster: Record<string, string>
): string {
  if (pool.length === 0 || allSlots.length === 0) return "";

  const caps = new Map<string, number>();
  const remaining = new Map<string, number>();
  for (const s of pool) {
    const cap = effectiveCapacity(s, hour, roster, allAssignments);
    caps.set(s.id, cap);
    remaining.set(s.id, cap);
  }
  for (const a of allAssignments) {
    if (a.hourBlock !== hour) continue;
    if (!remaining.has(a.shiftSlotId)) continue;
    remaining.set(a.shiftSlotId, remaining.get(a.shiftSlotId)! - 1);
  }

  const poolIds = new Set(pool.map((s) => s.id));
  const slotIndex = new Map(allSlots.map((s, i) => [s.id, i]));

  // Walk history to compute two cycle pointers:
  //
  // - cyclePos advances on every historical pick (regular + bolus). It's
  //   used as the search start during a bolus pick so that two bolus
  //   providers in the same hour interleave correctly.
  //
  // - regularCyclePos advances only on non-bolus picks. It's used as the
  //   search start during a non-bolus pick. This is what makes the regular
  //   round-robin survive a bolus run intact: when a new provider comes on
  //   and takes their 3 catch-up patients, those bolus picks shouldn't move
  //   the underlying cycle. After the bolus, the next non-bolus pick
  //   resumes from wherever the regular cycle was before the bolus started.
  //
  // A historical pick is "bolus" iff effectiveCapacity for the slot at that
  // hour was > 2. That's the same condition used to gate bolusMode below.
  const currentH = hourIndex(hour);
  const sortedA = [...allAssignments].sort((a, b) => {
    const ha = hourIndex(a.hourBlock);
    const hb = hourIndex(b.hourBlock);
    if (ha !== hb) return ha - hb;
    return a.sortOrder - b.sortOrder;
  });
  let cyclePos = -1;
  let regularCyclePos = -1;
  for (const a of sortedA) {
    if (hourIndex(a.hourBlock) > currentH) break;
    if (!a.shiftSlotId) continue;
    const idx = slotIndex.get(a.shiftSlotId);
    if (idx === undefined) continue;
    cyclePos = idx;
    const slot = allSlots[idx];
    const histCap = effectiveCapacity(slot, a.hourBlock, roster, allAssignments);
    if (histCap <= 2) {
      regularCyclePos = idx;
    }
  }

  function eligible(id: string, anyBolus: boolean): boolean {
    if (!poolIds.has(id)) return false;
    if ((remaining.get(id) ?? 0) <= 0) return false;
    if (anyBolus && (caps.get(id) ?? 0) <= 2) return false;
    return true;
  }

  function anyBolusAvailable(): boolean {
    for (const s of pool) {
      if ((caps.get(s.id) ?? 0) > 2 && (remaining.get(s.id) ?? 0) > 0) {
        return true;
      }
    }
    return false;
  }

  let pickedId = "";
  for (let step = 0; step <= steps; step++) {
    const bolusMode = anyBolusAvailable();
    const startPos = bolusMode ? cyclePos : regularCyclePos;
    let found: string | null = null;
    for (let i = 1; i <= allSlots.length; i++) {
      const idx = (startPos + i + allSlots.length) % allSlots.length;
      const s = allSlots[idx];
      if (eligible(s.id, bolusMode)) {
        found = s.id;
        cyclePos = idx;
        if (!bolusMode) regularCyclePos = idx;
        break;
      }
    }

    if (!found) {
      // Everyone in the rotation pool has hit (or exceeded) their PSG
      // cap for this hour. Leave the prediction empty so the clerk has
      // to consciously pick a provider for any over-cap entry (e.g. an
      // L1/L2 high-acuity override). Returning "" parks the placeholder
      // dropdown at "—" instead of phantom-suggesting an already-capped
      // provider for a fourth (or fifth) patient.
      return "";
    }

    pickedId = found;
    remaining.set(pickedId, (remaining.get(pickedId) ?? 0) - 1);
  }
  return pickedId;
}

// Re-run the round-robin from a given row onward across every later hour.
// Triggered when a clerk manually overrides a row's provider — every
// downstream rotation-team row gets re-assigned to whoever round-robin
// would pick at that position given the new history.
//
// Rows whose current shiftSlotId is on a non-rotation team (DOD / FLEX /
// PEDS / PITT / MP) are deliberately left alone: those are manual
// off-rotation picks (DOD coverage, lactation breaks, etc.) and the clerk
// already chose them on purpose.
//
// Rows whose current shiftSlotId is empty or points to a slot that's no
// longer in the rotation pool (provider went off-shift, was deleted from
// the roster) are also left alone — there's nothing meaningful for the
// round-robin to swap them to.
export function reshuffleDownstream(
  assignments: Assignment[],
  fromHour: number,
  fromSortOrder: number,
  effectiveSlots: ShiftSlot[],
  roster: Record<string, string>
): Assignment[] {
  const sorted = [...assignments].sort((a, b) => {
    const ha = hourIndex(a.hourBlock);
    const hb = hourIndex(b.hourBlock);
    if (ha !== hb) return ha - hb;
    return a.sortOrder - b.sortOrder;
  });

  const startIdx = sorted.findIndex(
    (a) => a.hourBlock === fromHour && a.sortOrder === fromSortOrder
  );
  if (startIdx === -1) return assignments;

  const slotsById = new Map(effectiveSlots.map((s) => [s.id, s]));
  const poolByHour = new Map<number, ShiftSlot[]>();
  function poolFor(hour: number): ShiftSlot[] {
    let p = poolByHour.get(hour);
    if (!p) {
      p = onShiftSlots(effectiveSlots, roster, hour).filter((s) =>
        MAIN_ROTATION_TEAMS.includes(s.team)
      );
      poolByHour.set(hour, p);
    }
    return p;
  }

  // Walk forward and re-pick each rotation-team row using the cumulative
  // history of every row before it (including reshuffled picks).
  const history: Assignment[] = sorted.slice(0, startIdx + 1);
  for (let i = startIdx + 1; i < sorted.length; i++) {
    const r = sorted[i];
    const curSlot = slotsById.get(r.shiftSlotId);
    if (!curSlot || !MAIN_ROTATION_TEAMS.includes(curSlot.team)) {
      history.push(r);
      continue;
    }
    const pool = poolFor(r.hourBlock);
    const predicted = predictRotation(
      pool,
      effectiveSlots,
      history,
      r.hourBlock,
      0,
      roster
    );
    const updated = predicted ? { ...r, shiftSlotId: predicted } : r;
    sorted[i] = updated;
    history.push(updated);
  }

  return sorted;
}
