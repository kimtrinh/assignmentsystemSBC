// Helpers for the Choose-in panel <-> rotation 1* row sync. The panel
// stores time and bed combined as "TIME/BED" (e.g. "1129/A09", "500/FX01")
// because that's how the source sheet records it. The rotation row stores
// them as separate columns. These two helpers translate between the forms.

export function splitTimeBed(timeBed: string): { time: string; bed: string } {
  if (!timeBed) return { time: "", bed: "" };
  const idx = timeBed.indexOf("/");
  if (idx < 0) return { time: timeBed, bed: "" };
  return { time: timeBed.slice(0, idx), bed: timeBed.slice(idx + 1) };
}

export function combineTimeBed(time: string, bed: string): string {
  const t = (time ?? "").trim();
  const b = (bed ?? "").trim();
  if (!t && !b) return "";
  if (!b) return t;
  return `${t}/${b}`;
}
