import type { Assignment } from "./storage";
import type { ShiftSlot } from "./shiftTemplate";

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
    (s) => (roster[s.id]?.trim() ?? "") !== "" && coversHour(s, hour)
  );
}

// Round-robin pick. `pool` is the canonical provider order at this hour;
// `assignmentsThisHour` are existing assignments already entered. `steps`
// is the placeholder's position (0 = the next one up).
export function predictRotation(
  pool: ShiftSlot[],
  assignmentsThisHour: Assignment[],
  steps: number
): string {
  if (pool.length === 0) return "";
  const counts = new Map<string, number>();
  for (const s of pool) counts.set(s.id, 0);
  for (const a of assignmentsThisHour) {
    if (counts.has(a.shiftSlotId)) {
      counts.set(a.shiftSlotId, counts.get(a.shiftSlotId)! + 1);
    }
  }
  let pickedId = "";
  for (let step = 0; step <= steps; step++) {
    let bestIdx = 0;
    for (let i = 1; i < pool.length; i++) {
      if (counts.get(pool[i].id)! < counts.get(pool[bestIdx].id)!) bestIdx = i;
    }
    pickedId = pool[bestIdx].id;
    counts.set(pickedId, counts.get(pickedId)! + 1);
  }
  return pickedId;
}
