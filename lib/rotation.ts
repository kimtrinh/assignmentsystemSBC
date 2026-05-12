import type { Assignment } from "./storage";
import type { ShiftSlot } from "./shiftTemplate";
import { effectiveShift } from "./effectiveShift";
import { isRotationActive, psgCapacityAt } from "./psg";

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
// `steps` is the placeholder's position (0 = the very next one up).
export function predictRotation(
  pool: ShiftSlot[],
  allAssignments: Assignment[],
  hour: number,
  steps: number,
  roster: Record<string, string>
): string {
  if (pool.length === 0) return "";

  // Per-provider capacity for this hour, and remaining capacity after the
  // assignments already entered. Capacity > 2 means the provider is in a
  // bolus hour: their first hour of shift (3) or the catch-up hour after
  // a zero-patient first hour (3). Bolus providers keep priority over
  // regular round-robin until they exhaust their bolus, so two providers
  // starting the same hour land their 3 patients each interleaved before
  // anyone else gets one.
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

  function priorityFor(id: string): [number, number] {
    const cap = caps.get(id) ?? 0;
    const rem = remaining.get(id) ?? 0;
    const inBolus = cap > 2 && rem > 0 ? 1 : 0;
    return [inBolus, rem];
  }

  let pickedId = "";
  for (let step = 0; step <= steps; step++) {
    let bestIdx = 0;
    let best = priorityFor(pool[0].id);
    for (let i = 1; i < pool.length; i++) {
      const p = priorityFor(pool[i].id);
      // Compare lexicographically: bolus-active first, then remaining
      // capacity (descending). Strict greater-than preserves canonical
      // pool order on ties.
      if (p[0] > best[0] || (p[0] === best[0] && p[1] > best[1])) {
        best = p;
        bestIdx = i;
      }
    }
    pickedId = pool[bestIdx].id;
    remaining.set(pickedId, remaining.get(pickedId)! - 1);
  }
  return pickedId;
}
