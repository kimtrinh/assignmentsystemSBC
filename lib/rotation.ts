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

  const remaining = new Map<string, number>();
  for (const s of pool) {
    remaining.set(s.id, effectiveCapacity(s, hour, roster, allAssignments));
  }
  for (const a of allAssignments) {
    if (a.hourBlock !== hour) continue;
    if (!remaining.has(a.shiftSlotId)) continue;
    remaining.set(a.shiftSlotId, remaining.get(a.shiftSlotId)! - 1);
  }

  let pickedId = "";
  for (let step = 0; step <= steps; step++) {
    let bestIdx = 0;
    let bestRemaining = remaining.get(pool[0].id)!;
    for (let i = 1; i < pool.length; i++) {
      const r = remaining.get(pool[i].id)!;
      if (r > bestRemaining) {
        bestRemaining = r;
        bestIdx = i;
      }
    }
    pickedId = pool[bestIdx].id;
    remaining.set(pickedId, remaining.get(pickedId)! - 1);
  }
  return pickedId;
}
