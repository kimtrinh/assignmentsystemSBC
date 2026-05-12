export type Assignment = {
  id: string;
  hourBlock: number;
  time: string;
  bed: string;
  shiftSlotId: string;
  comments: string;
  sortOrder: number;
};

export type ChooseIn = {
  timeBed: string;
  esiOrPatient: string;
};

// Same shape as ShiftSlot in shiftTemplate.ts, but stored on the day so
// the clerk can add ad-hoc providers (early arrivals, extra coverage)
// who aren't in the canonical template.
export type ExtraSlot = {
  id: string;
  label: string;
  team: string;
  startTime: string;
  endTime: string;
};

export type DayState = {
  siteCode: string;
  date: string;
  // shiftSlotId -> provider name
  roster: Record<string, string>;
  assignments: Assignment[];
  // shiftSlotId -> choose-in entry
  chooseIns: Record<string, ChooseIn>;
  // hourBlock -> NEDOCS reading at that hour
  nedocs: Record<number, string>;
  // Ad-hoc shift slots created on this day (in addition to the template).
  extraSlots: ExtraSlot[];
};

export type AuditEntry = {
  timestamp: number;
  description: string;
};

const KEY_PREFIX = "ed-board:v1:";
const LOG_PREFIX = "ed-board-log:v1:";

export const MAX_LOG_ENTRIES = 500;

export function storageKey(siteCode: string, date: string): string {
  return `${KEY_PREFIX}${siteCode}:${date}`;
}

export function auditLogKey(siteCode: string, date: string): string {
  return `${LOG_PREFIX}${siteCode}:${date}`;
}

export function loadAuditLog(siteCode: string, date: string): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(auditLogKey(siteCode, date));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveAuditLog(
  siteCode: string,
  date: string,
  log: AuditEntry[]
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(auditLogKey(siteCode, date), JSON.stringify(log));
}

export function emptyDay(siteCode: string, date: string): DayState {
  return {
    siteCode,
    date,
    roster: {},
    assignments: [],
    chooseIns: {},
    nedocs: {},
    extraSlots: []
  };
}

export function loadDay(siteCode: string, date: string): DayState {
  if (typeof window === "undefined") return emptyDay(siteCode, date);
  try {
    const raw = window.localStorage.getItem(storageKey(siteCode, date));
    if (!raw) return emptyDay(siteCode, date);
    const parsed = JSON.parse(raw) as Partial<DayState>;
    return {
      siteCode,
      date,
      roster: parsed.roster ?? {},
      assignments: parsed.assignments ?? [],
      chooseIns: parsed.chooseIns ?? {},
      nedocs: parsed.nedocs ?? {},
      extraSlots: parsed.extraSlots ?? []
    };
  } catch {
    return emptyDay(siteCode, date);
  }
}

export function saveDay(state: DayState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(state.siteCode, state.date), JSON.stringify(state));
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
