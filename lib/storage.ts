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

export type DayState = {
  siteCode: string;
  date: string;
  // shiftSlotId -> provider name
  roster: Record<string, string>;
  assignments: Assignment[];
  // shiftSlotId -> choose-in entry
  chooseIns: Record<string, ChooseIn>;
};

const KEY_PREFIX = "ed-board:v1:";

export function storageKey(siteCode: string, date: string): string {
  return `${KEY_PREFIX}${siteCode}:${date}`;
}

export function emptyDay(siteCode: string, date: string): DayState {
  return { siteCode, date, roster: {}, assignments: [], chooseIns: {} };
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
      chooseIns: parsed.chooseIns ?? {}
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
