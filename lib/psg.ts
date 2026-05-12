import type { ShiftSlot } from "./shiftTemplate";

// Special target value: this hour is the choose-in slot for the provider.
// Functionally one patient, marked as "1*" in the FMC PSG sheet.
export const PSG_CHOOSE_IN = -1;

export function shiftLengthHours(slot: ShiftSlot): number {
  const sH = parseInt(slot.startTime.split(":")[0], 10);
  let eH = parseInt(slot.endTime.split(":")[0], 10);
  if (Number.isNaN(sH) || Number.isNaN(eH)) return 0;
  if (eH === 0) eH = 24;
  if (eH === sH) return 0;
  if (eH > sH) return eH - sH;
  return 24 - sH + eH;
}

// Returns the per-hour PSG target indexed by hours-since-shift-start.
// Positive integer = patient cap. PSG_CHOOSE_IN = choose-in hour (1*).
// 0 = X (wrap-up, no new assignments).
// Source: FMC Shift PSG Assignments printout.
export function psgScheduleFor(slot: ShiftSlot): number[] {
  const len = shiftLengthHours(slot);
  // Main 10h: 3, 2, 2, 2, 2, 2, 1, 1*, X, X
  if (len === 10) return [3, 2, 2, 2, 2, 2, 1, PSG_CHOOSE_IN, 0, 0];
  // Main 12h: 3, 2, 2, 2, 2, 2, 2, 1, 1, 1*, X, X (8p-8a, 10a-10p, ...)
  if (len === 12) return [3, 2, 2, 2, 2, 2, 2, 1, 1, PSG_CHOOSE_IN, 0, 0];
  // Generic fallback: 3 first hour, 2 thereafter, 1, 1*, X, X tail.
  if (len <= 0) return [];
  const out: number[] = new Array(len).fill(2);
  out[0] = 3;
  if (out.length >= 3) {
    out[out.length - 2] = 0;
    out[out.length - 1] = 0;
    out[out.length - 3] = PSG_CHOOSE_IN;
  }
  if (out.length >= 4) out[out.length - 4] = 1;
  return out;
}

// Target at a given clock hour, or null if the hour is outside the shift's
// length entirely. 0 means the provider is in their wrap-up (X) window.
export function psgTargetAt(slot: ShiftSlot, hour: number): number | null {
  const startH = parseInt(slot.startTime.split(":")[0], 10);
  if (Number.isNaN(startH)) return null;
  const offset = (hour - startH + 24) % 24;
  const schedule = psgScheduleFor(slot);
  if (offset >= schedule.length) return null;
  return schedule[offset];
}

// Numeric capacity (>= 0). Treats choose-in as 1, wrap-up/off-shift as 0.
export function psgCapacityAt(slot: ShiftSlot, hour: number): number {
  const t = psgTargetAt(slot, hour);
  if (t === null || t === 0) return 0;
  if (t === PSG_CHOOSE_IN) return 1;
  return t;
}

export function isChooseInHour(slot: ShiftSlot, hour: number): boolean {
  return psgTargetAt(slot, hour) === PSG_CHOOSE_IN;
}

// Active = in shift AND not in wrap-up (X). Used to gate the rotation pool.
export function isRotationActive(slot: ShiftSlot, hour: number): boolean {
  const t = psgTargetAt(slot, hour);
  return t !== null && t !== 0;
}

export type TaperState =
  | "offShift"
  | "first"
  | "regular"
  | "nxlast"
  | "last"
  | "chooseIn"
  | "wrapUp";

// Where the provider is in their per-hour PSG taper. Used to surface the
// last--, nxlast--, choose-in (1*), and wrap-up (X) markers from the source
// sheet onto the rotation grid.
export function taperState(slot: ShiftSlot, hour: number): TaperState {
  const target = psgTargetAt(slot, hour);
  if (target === null) return "offShift";
  if (target === 0) return "wrapUp";
  if (target === PSG_CHOOSE_IN) return "chooseIn";

  const startH = parseInt(slot.startTime.split(":")[0], 10);
  if (Number.isNaN(startH)) return "regular";
  const offset = (hour - startH + 24) % 24;
  if (offset === 0) return "first";

  const schedule = psgScheduleFor(slot);
  const chooseInIdx = schedule.indexOf(PSG_CHOOSE_IN);
  if (chooseInIdx >= 0) {
    if (offset === chooseInIdx - 1) return "last";
    if (offset === chooseInIdx - 2 && schedule[offset] === 1) return "nxlast";
  }
  return "regular";
}
