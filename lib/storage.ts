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

const KEY_PREFIX = "ed-board:v1:";

export function storageKey(siteCode: string, date: string): string {
  return `${KEY_PREFIX}${siteCode}:${date}`;
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
