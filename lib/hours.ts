// Hour blocks for the daily rotation grid.
// The day starts at 05:00 and wraps through 04:00 the next morning,
// matching the existing spreadsheet (500, 600, ..., 2400, 100, ..., 400).
export const HOUR_BLOCKS: number[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  0, 1, 2, 3, 4
];

// First hour (inclusive) at which the night top-of-hour fair-share rule
// kicks in. From this hour through the end of the day's HOUR_BLOCKS wrap
// (22, 23, 0, 1, 2, 3, 4), the position-0 prediction at each new hour is
// the on-shift rotation provider who has been "first up at top of hour"
// the fewest times so far that night.
export const NIGHT_FAIRSHARE_HOUR = 22;

export function hourLabel(hour: number): string {
  // Display 0 as "2400" to match the existing sheet convention; the rest as HHMM.
  if (hour === 0) return "2400";
  return `${String(hour).padStart(2, "0")}00`;
}
