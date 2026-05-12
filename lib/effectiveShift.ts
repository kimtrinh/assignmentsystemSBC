import type { ShiftSlot } from "./shiftTemplate";

// "Rongkavilit 5a-5p" -> {startTime: "05:00", endTime: "17:00"}.
// Returns null if no time range is present at the end of the name.
export function timeRangeFromName(
  name: string | undefined | null
): { startTime: string; endTime: string } | null {
  if (!name) return null;
  const m = name.trim().match(/(\d{1,2})([ap])-(\d{1,2})([ap])\s*$/i);
  if (!m) return null;
  const hh = (n: string, ap: string): number => {
    let h = parseInt(n, 10);
    if (Number.isNaN(h)) return -1;
    if (ap.toLowerCase() === "p" && h !== 12) h += 12;
    if (ap.toLowerCase() === "a" && h === 12) h = 0;
    return h;
  };
  const sH = hh(m[1], m[2]);
  const eH = hh(m[3], m[4]);
  if (sH < 0 || eH < 0) return null;
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return { startTime: fmt(sH), endTime: eH === 0 ? "00:00" : fmt(eH) };
}

// Returns a slot with its startTime/endTime overridden by the time range
// embedded in the provider's name (e.g. "Rongkavilit 5a-5p" extends the
// canonical Red 5a-3p slot to a full 12-hour shift). Falls back to the slot
// as-is when no time is parseable.
export function effectiveShift(slot: ShiftSlot, name?: string): ShiftSlot {
  const t = timeRangeFromName(name);
  if (!t) return slot;
  return { ...slot, startTime: t.startTime, endTime: t.endTime };
}
