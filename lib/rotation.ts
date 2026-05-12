import type { Assignment } from "./storage";
import type { ShiftSlot } from "./shiftTemplate";
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

export function onShiftSlots(
  slots: ShiftSlot[],
  roster: Record<string, string>,
  hour: number
): ShiftSlot[] {
  return slots.filter(
    (s) => (roster[s.id]?.trim() ?? "") !== "" && isRotationActive(s, hour)
  );
}

// Round-robin pick driven by the per-hour PSG taper from the FMC PSG sheet.
// `pool` is the canonical provider order at this clock hour; `steps` is the
// placeholder's position (0 = the very next one up).
//
// Soft cap: providers with remaining capacity > 0 are preferred. When everyone
// in the pool is at or past their target, the algorithm still suggests
// somebody (the next in canonical order with the most negative deficit) so the
// dropdown never goes blank — the clerk can override.
export function predictRotation(
  pool: ShiftSlot[],
  assignmentsThisHour: Assignment[],
  hour: number,
  steps: number
): string {
  if (pool.length === 0) return "";

  const remaining = new Map<string, number>();
  for (const s of pool) remaining.set(s.id, psgCapacityAt(s, hour));
  for (const a of assignmentsThisHour) {
    if (remaining.has(a.shiftSlotId)) {
      remaining.set(a.shiftSlotId, remaining.get(a.shiftSlotId)! - 1);
    }
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
