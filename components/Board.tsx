"use client";

import { useContext, useEffect, useMemo, useReducer, useState } from "react";
import { IdentityContext, type SessionInfo } from "@/components/AuthGate";
import { HOUR_BLOCKS, hourLabel } from "@/lib/hours";
import {
  MAIN_ROTATION_TEAMS,
  SITES,
  TEAM_ORDER,
  getSite,
  type ShiftSlot,
  type SiteDef
} from "@/lib/shiftTemplate";
import {
  type Assignment,
  type AuditEntry,
  type ChooseIn,
  type DayState,
  type ExtraSlot,
  MAX_LOG_ENTRIES,
  emptyDay,
  loadAuditLog,
  loadDay,
  newId,
  saveAuditLog,
  saveDay
} from "@/lib/storage";
import {
  appendAuditEntry,
  fetchAuditLog,
  fetchDay,
  isSupabaseConfigured,
  persistDay,
  subscribeToDay
} from "@/lib/sync";
import {
  effectiveCapacity,
  onShiftSlots,
  predictRotation
} from "@/lib/rotation";
import {
  PSG_CHOOSE_IN,
  psgScheduleFor,
  taperState,
  type TaperState
} from "@/lib/psg";
import { effectiveShift } from "@/lib/effectiveShift";
import { combineTimeBed, splitTimeBed } from "@/lib/chooseIn";

const MIN_VISIBLE_ROWS_PER_HOUR = 4;

type ParsedShiftLine = { raw: string; name: string; timeRange: string };

function parseScheduleText(text: string): ParsedShiftLine[] {
  const out: ParsedShiftLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(.+?)\s+(\d{1,2}[ap]-\d{1,2}[ap])\s*$/i);
    if (!m) continue;
    out.push({ raw: trimmed, name: m[1].trim(), timeRange: m[2].toLowerCase() });
  }
  return out;
}

function slotTimeRange(label: string): string {
  const m = label.match(/(\d{1,2}[ap]-\d{1,2}[ap])\s*$/i);
  return m ? m[1].toLowerCase() : "";
}

function startHourFromAmpm(piece: string): number | null {
  const m = piece.match(/^(\d{1,2})([ap])$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (Number.isNaN(h)) return null;
  const ampm = m[2].toLowerCase();
  if (ampm === "p" && h !== 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  return h;
}

function slotStartHour(label: string): number | null {
  const m = label.match(/(\d{1,2}[ap])-\d{1,2}[ap]\s*$/i);
  return m ? startHourFromAmpm(m[1]) : null;
}

function rangeStartHour(range: string): number | null {
  const m = range.match(/^(\d{1,2}[ap])-/i);
  return m ? startHourFromAmpm(m[1]) : null;
}

function parseTimeRangeToShift(
  range: string
): { startTime: string; endTime: string; canonical: string } | null {
  const m = range.trim().match(/^(\d{1,2})([ap])-(\d{1,2})([ap])$/i);
  if (!m) return null;
  const hh = (num: string, ampm: string): number => {
    let h = parseInt(num, 10);
    if (Number.isNaN(h)) return -1;
    if (ampm.toLowerCase() === "p" && h !== 12) h += 12;
    if (ampm.toLowerCase() === "a" && h === 12) h = 0;
    return h;
  };
  const start = hh(m[1], m[2]);
  const end = hh(m[3], m[4]);
  if (start < 0 || end < 0) return null;
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return {
    startTime: fmt(start),
    endTime: end === 0 ? "00:00" : fmt(end),
    canonical: `${parseInt(m[1], 10)}${m[2].toLowerCase()}-${parseInt(m[3], 10)}${m[4].toLowerCase()}`
  };
}

function autoMatchSchedule(
  parsed: ParsedShiftLine[],
  slots: ShiftSlot[]
): Map<number, string> {
  const result = new Map<number, string>();
  const taken = new Set<string>();

  parsed.forEach((entry, i) => {
    const exact = slots.find(
      (s) => !taken.has(s.id) && slotTimeRange(s.label) === entry.timeRange
    );
    if (exact) {
      taken.add(exact.id);
      result.set(i, exact.id);
    }
  });

  parsed.forEach((entry, i) => {
    if (result.has(i)) return;
    const start = rangeStartHour(entry.timeRange);
    if (start === null) return;
    const fallback = slots.find(
      (s) => !taken.has(s.id) && slotStartHour(s.label) === start
    );
    if (fallback) {
      taken.add(fallback.id);
      result.set(i, fallback.id);
    }
  });

  return result;
}

function todayInLA(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function parseHash(): { site?: string; date?: string } {
  if (typeof window === "undefined") return {};
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return {};
  const [site, date] = raw.split("/");
  return { site, date };
}

function setHash(site: string, date: string) {
  const next = `#/${site}/${date}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

function clearHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

export default function Board() {
  const [route, setRoute] = useState<{ site?: string; date?: string }>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const apply = () => setRoute(parseHash());
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  if (!hydrated) return null;

  const site = route.site ? getSite(route.site) : undefined;
  if (!site || !route.date) {
    return <Picker onOpen={(s, d) => setHash(s, d)} />;
  }

  const isPrint =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("print") === "1";

  if (isPrint) {
    return <PrintBoard site={site} date={route.date} />;
  }

  return (
    <DayBoard
      site={site}
      date={route.date}
      onLeave={() => {
        clearHash();
        setRoute({});
      }}
    />
  );
}

function Picker({ onOpen }: { onOpen: (site: string, date: string) => void }) {
  const today = todayInLA();
  const [site, setSite] = useState(SITES[0]?.code ?? "");
  const [date, setDate] = useState(today);
  const { session, sendMagicLink, signOut } = useContext(IdentityContext);
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [sendStatus, setSendStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSendLink() {
    setSendStatus({ kind: "sending" });
    const result = await sendMagicLink(email);
    if (result.ok) setSendStatus({ kind: "sent" });
    else setSendStatus({ kind: "error", message: result.error });
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">ED Assignment System</h1>
      <p className="mb-6 text-slate-600">
        Pick a site and a date to open that day&apos;s assignment board.
      </p>

      <SessionBanner
        session={session}
        showSignIn={showSignIn}
        toggleSignIn={() => {
          setShowSignIn((v) => !v);
          setSendStatus({ kind: "idle" });
        }}
        signOut={() => {
          setSendStatus({ kind: "idle" });
          void signOut();
        }}
      />

      {showSignIn && session.kind !== "no-backend" && session.kind !== "email" ? (
        <div className="mb-4 space-y-2 rounded border border-slate-300 bg-white p-3 text-sm">
          <div className="text-slate-700">
            Enter your work email — we&apos;ll send a one-time link. You can
            keep using the board anonymously meanwhile; the link just upgrades
            your session to a stable email identity.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[200px] text-xs">
              <div className="mb-1 text-slate-600">Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@kp.org"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              onClick={handleSendLink}
              disabled={!email.trim() || sendStatus.kind === "sending"}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sendStatus.kind === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
          </div>
          {sendStatus.kind === "sent" ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
              Check your inbox for a Supabase email. Open the link on this
              device to finish signing in.
            </div>
          ) : null}
          {sendStatus.kind === "error" ? (
            <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
              {sendStatus.message}
            </div>
          ) : null}
        </div>
      ) : null}

      <ul className="mb-6 space-y-3">
        {SITES.map((s) => (
          <li key={s.code} className="flex items-center justify-between rounded border bg-white p-4">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-slate-500">{s.code}</div>
            </div>
            <button
              onClick={() => onOpen(s.code, today)}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            >
              Open today ({today})
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded border bg-white p-4">
        <div className="mb-3 text-sm font-semibold">Open a specific day</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-slate-600">Site</div>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="rounded border bg-white px-2 py-1.5"
            >
              {SITES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-1 text-slate-600">Date</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border px-2 py-1.5"
            />
          </label>
          <button
            onClick={() => site && date && onOpen(site, date)}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          >
            Open
          </button>
        </div>
      </div>
    </main>
  );
}

function SessionBanner({
  session,
  showSignIn,
  toggleSignIn,
  signOut
}: {
  session: SessionInfo;
  showSignIn: boolean;
  toggleSignIn: () => void;
  signOut: () => void;
}) {
  if (session.kind === "loading") {
    return (
      <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        Connecting…
      </div>
    );
  }
  if (session.kind === "no-backend") {
    return (
      <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Single-user only.</strong> This build stores all data in your
        browser. Other people see their own empty boards — no live sync.
        Clearing browser data deletes your boards.
      </div>
    );
  }
  if (session.kind === "email") {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        <div>
          <strong>Signed in as {session.email}.</strong> Boards are shared with
          everyone signed in to this workspace.
        </div>
        <button onClick={signOut} className="text-xs underline">
          Sign out
        </button>
      </div>
    );
  }
  // anonymous
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
      <div>
        <strong>Shared board, signed in anonymously.</strong> Edits sync live to
        every browser on this app. Want a stable identity that follows you to
        other devices?
      </div>
      <button
        onClick={toggleSignIn}
        className="rounded border border-slate-400 bg-white px-3 py-1.5 text-xs"
      >
        {showSignIn ? "Hide" : "Sign in with email"}
      </button>
    </div>
  );
}

type RowDraft = Partial<Pick<Assignment, "time" | "bed" | "shiftSlotId" | "comments">>;
type RowField = "time" | "bed" | "comments";

const MAX_HISTORY = 50;

type History = {
  current: DayState;
  past: DayState[];
  future: DayState[];
};

type HistoryAction =
  | { type: "load"; state: DayState }
  | { type: "syncFromRemote"; state: DayState }
  | { type: "mutate"; mutator: (s: DayState) => DayState }
  | { type: "undo" }
  | { type: "redo" };

function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "load":
      return { current: action.state, past: [], future: [] };
    case "syncFromRemote":
      // External update from another browser. Don't pollute the local undo
      // stack — just replace `current` with what the server says.
      return { ...state, current: action.state };
    case "mutate": {
      const next = action.mutator(state.current);
      return {
        current: next,
        past: [...state.past, state.current].slice(-MAX_HISTORY),
        future: []
      };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        current: prev,
        past: state.past.slice(0, -1),
        future: [...state.future, state.current].slice(-MAX_HISTORY)
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[state.future.length - 1];
      return {
        current: next,
        past: [...state.past, state.current].slice(-MAX_HISTORY),
        future: state.future.slice(0, -1)
      };
    }
  }
}

function describeHour(hour: number): string {
  if (hour === 0) return "2400";
  return `${String(hour).padStart(2, "0")}00`;
}

function DayBoard({
  site,
  date,
  onLeave
}: {
  site: SiteDef;
  date: string;
  onLeave: () => void;
}) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({
    current: emptyDay(site.code, date),
    past: [],
    future: []
  }));
  const state = history.current;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const { displayName, setDisplayName } = useContext(IdentityContext);

  useEffect(() => {
    // Local-first: paint immediately from localStorage, then refresh from
    // Supabase when configured.
    dispatch({ type: "load", state: loadDay(site.code, date) });
    setAuditLog(loadAuditLog(site.code, date));
    setShowLog(false);
    setDataVersion((v) => v + 1);

    if (!isSupabaseConfigured) return;

    let cancelled = false;
    fetchDay(site.code, date).then((remote) => {
      if (cancelled) return;
      dispatch({ type: "syncFromRemote", state: remote });
      setDataVersion((v) => v + 1);
    });
    fetchAuditLog(site.code, date).then((log) => {
      if (cancelled) return;
      setAuditLog(log);
    });

    const unsubscribe = subscribeToDay(site.code, date, (remote) => {
      dispatch({ type: "syncFromRemote", state: remote });
      setDataVersion((v) => v + 1);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [site.code, date]);

  useEffect(() => {
    saveDay(state);
    if (isSupabaseConfigured) {
      void persistDay(state);
    }
  }, [state]);

  function appendLog(description: string) {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      description,
      user: displayName || undefined
    };
    setAuditLog((prev) => {
      const next = [...prev, entry].slice(-MAX_LOG_ENTRIES);
      saveAuditLog(site.code, date, next);
      if (isSupabaseConfigured) {
        void appendAuditEntry(site.code, date, entry, next);
      }
      return next;
    });
  }

  function update(
    mutator: (prev: DayState) => DayState,
    description: string,
    options: { bumpVersion?: boolean } = {}
  ) {
    dispatch({ type: "mutate", mutator });
    appendLog(description);
    if (options.bumpVersion) setDataVersion((v) => v + 1);
  }

  function undo() {
    if (!canUndo) return;
    dispatch({ type: "undo" });
    appendLog("Undid last change");
    setDataVersion((v) => v + 1);
  }

  function redo() {
    if (!canRedo) return;
    dispatch({ type: "redo" });
    appendLog("Redid change");
    setDataVersion((v) => v + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUndo, canRedo]);

  const effectiveSlots = useMemo<ShiftSlot[]>(
    () => [...site.slots, ...state.extraSlots],
    [site.slots, state.extraSlots]
  );
  const effectiveSlotsLookup = useMemo(
    () => new Map(effectiveSlots.map((s) => [s.id, s])),
    [effectiveSlots]
  );

  const groupedRoster = useMemo(() => {
    const byTeam = new Map<
      string,
      { templateSlots: ShiftSlot[]; extras: ExtraSlot[] }
    >();
    function getBucket(team: string) {
      if (!byTeam.has(team)) byTeam.set(team, { templateSlots: [], extras: [] });
      return byTeam.get(team)!;
    }
    for (const s of site.slots) getBucket(s.team).templateSlots.push(s);
    for (const e of state.extraSlots) getBucket(e.team).extras.push(e);
    const teams = Array.from(byTeam.keys()).sort((a, b) => {
      const ai = TEAM_ORDER.indexOf(a);
      const bi = TEAM_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return teams.map((t) => ({ team: t, ...byTeam.get(t)! }));
  }, [site, state.extraSlots]);

  const assignmentsByHour = useMemo(() => {
    const m = new Map<number, Assignment[]>();
    for (const a of state.assignments) {
      if (!m.has(a.hourBlock)) m.set(a.hourBlock, []);
      m.get(a.hourBlock)!.push(a);
    }
    for (const v of m.values()) v.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [state.assignments]);

  // Returns the clock hour at which `slot` is at its choose-in (1*) hour,
  // taking the provider's name-derived effective shift into account. Returns
  // null if the slot doesn't have a 1* hour in its taper.
  function chooseInHourFor(
    slot: ShiftSlot,
    name: string | undefined
  ): number | null {
    const eff = effectiveShift(slot, name);
    const startH = parseInt(eff.startTime.split(":")[0], 10);
    if (Number.isNaN(startH)) return null;
    const schedule = psgScheduleFor(eff);
    const offset = schedule.indexOf(PSG_CHOOSE_IN);
    if (offset < 0) return null;
    return (startH + offset) % 24;
  }

  // After a row in a 1* hour is written, mirror its values back into the
  // Choose-in panel so the two surfaces stay in sync.
  function syncRowToPanel(
    prev: DayState,
    row: Assignment
  ): Record<string, ChooseIn> {
    if (!row.shiftSlotId) return prev.chooseIns;
    const slot = effectiveSlotsLookup.get(row.shiftSlotId);
    if (!slot) return prev.chooseIns;
    const targetHour = chooseInHourFor(slot, prev.roster[slot.id]);
    if (targetHour === null || targetHour !== row.hourBlock) return prev.chooseIns;
    const timeBed = combineTimeBed(row.time, row.bed);
    const esiOrPatient = row.comments;
    const chooseIns = { ...prev.chooseIns };
    if (!timeBed && !esiOrPatient) delete chooseIns[slot.id];
    else chooseIns[slot.id] = { timeBed, esiOrPatient };
    return chooseIns;
  }

  function updateRow(id: string, patch: Partial<Assignment>) {
    const fields = Object.keys(patch).join(", ");
    update(
      (prev) => {
        const assignments = prev.assignments.map((a) =>
          a.id === id ? { ...a, ...patch } : a
        );
        const updated = assignments.find((a) => a.id === id);
        const chooseIns = updated
          ? syncRowToPanel(prev, updated)
          : prev.chooseIns;
        return { ...prev, assignments, chooseIns };
      },
      `Edited row (${fields || "row"})`
    );
  }

  function deleteRow(id: string) {
    const row = state.assignments.find((a) => a.id === id);
    const where = row ? ` at ${describeHour(row.hourBlock)}` : "";
    update(
      (prev) => ({
        ...prev,
        assignments: prev.assignments.filter((a) => a.id !== id)
      }),
      `Deleted row${where}`
    );
  }

  function materializeRow(hourBlock: number, sortOrder: number, patch: RowDraft) {
    const row: Assignment = {
      id: newId(),
      hourBlock,
      time: patch.time ?? "",
      bed: patch.bed ?? "",
      shiftSlotId: patch.shiftSlotId ?? "",
      comments: patch.comments ?? "",
      sortOrder
    };
    update(
      (prev) => ({
        ...prev,
        assignments: [...prev.assignments, row],
        chooseIns: syncRowToPanel(prev, row)
      }),
      `Added row at ${describeHour(hourBlock)}`
    );
  }

  // Paste from a spreadsheet (Google Sheets, Excel) into the rotation
  // grid. `startCol` says which column the user pasted into (Time, Bed,
  // or Comments). `rowsData` is the parsed TSV: outer array = lines,
  // inner = tab-separated values per line. The first paste line lands
  // at `startSortOrder`; subsequent lines land at successive sortOrders
  // within the same hour, materializing new rows as needed and
  // auto-predicting their physician.
  function bulkPasteIntoGrid(
    hour: number,
    startSortOrder: number,
    startCol: RowField,
    rowsData: string[][]
  ) {
    const fieldOrder: RowField[] = ["time", "bed", "comments"];
    const startColIdx = fieldOrder.indexOf(startCol);
    if (startColIdx < 0) return;

    update(
      (prev) => {
        const assignments = [...prev.assignments];
        const pool = onShiftSlots(effectiveSlots, prev.roster, hour).filter((s) =>
          MAIN_ROTATION_TEAMS.includes(s.team)
        );

        rowsData.forEach((cols, rowIdx) => {
          const targetSortOrder = startSortOrder + rowIdx;
          const patch: Partial<Assignment> = {};
          cols.forEach((value, colIdx) => {
            const fieldIdx = startColIdx + colIdx;
            if (fieldIdx >= fieldOrder.length) return;
            patch[fieldOrder[fieldIdx]] = value;
          });
          if (Object.keys(patch).length === 0) return;

          const existingIdx = assignments.findIndex(
            (a) => a.hourBlock === hour && a.sortOrder === targetSortOrder
          );

          if (existingIdx >= 0) {
            assignments[existingIdx] = { ...assignments[existingIdx], ...patch };
          } else {
            const predictedSlotId = predictRotation(
              pool,
              effectiveSlots,
              assignments,
              hour,
              0,
              prev.roster
            );
            assignments.push({
              id: newId(),
              hourBlock: hour,
              time: "",
              bed: "",
              shiftSlotId: predictedSlotId,
              comments: "",
              sortOrder: targetSortOrder,
              ...patch
            });
          }
        });

        return { ...prev, assignments };
      },
      `Pasted ${rowsData.length} row${rowsData.length === 1 ? "" : "s"} at ${describeHour(hour)}`,
      { bumpVersion: true }
    );
  }

  function updateRoster(slotId: string, providerName: string) {
    const trimmed = providerName.trim();
    const slot = effectiveSlotsLookup.get(slotId);
    const label = slot?.label ?? slotId;
    const description = trimmed
      ? `Set ${label} to ${trimmed}`
      : `Cleared ${label}`;
    update(
      (prev) => {
        const roster = { ...prev.roster };
        if (trimmed) roster[slotId] = trimmed;
        else delete roster[slotId];
        return { ...prev, roster };
      },
      description
    );
  }

  function applyRosterPaste(updates: { slotId: string; provider: string }[]) {
    update(
      (prev) => {
        const roster = { ...prev.roster };
        for (const { slotId, provider } of updates) {
          const trimmed = provider.trim();
          if (trimmed) roster[slotId] = trimmed;
          else delete roster[slotId];
        }
        return { ...prev, roster };
      },
      `Pasted schedule (${updates.length} provider${updates.length === 1 ? "" : "s"})`,
      { bumpVersion: true }
    );
  }

  function addExtraSlot(input: { name: string; timeRange: string; team: string }) {
    const parsed = parseTimeRangeToShift(input.timeRange);
    if (!parsed) return;
    const name = input.name.trim();
    if (!name) return;
    const id = `extra-${newId()}`;
    const slot: ExtraSlot = {
      id,
      label: parsed.canonical,
      team: input.team,
      startTime: parsed.startTime,
      endTime: parsed.endTime
    };
    update(
      (prev) => ({
        ...prev,
        extraSlots: [...prev.extraSlots, slot],
        roster: { ...prev.roster, [id]: name }
      }),
      `Added ad-hoc ${parsed.canonical} (${input.team}): ${name}`,
      { bumpVersion: true }
    );
  }

  function removeExtraSlot(slotId: string) {
    const slot = state.extraSlots.find((s) => s.id === slotId);
    const label = slot ? `${slot.label} (${slot.team})` : "shift";
    update(
      (prev) => {
        const roster = { ...prev.roster };
        delete roster[slotId];
        return {
          ...prev,
          extraSlots: prev.extraSlots.filter((s) => s.id !== slotId),
          roster
        };
      },
      `Removed ad-hoc ${label}`,
      { bumpVersion: true }
    );
  }

  function clearProvider(slotId: string) {
    const slot = effectiveSlotsLookup.get(slotId);
    const label = slot?.label ?? slotId;
    const previous = state.roster[slotId];
    update(
      (prev) => {
        const roster = { ...prev.roster };
        delete roster[slotId];
        return { ...prev, roster };
      },
      previous ? `Cleared ${previous} from ${label}` : `Cleared ${label}`,
      { bumpVersion: true }
    );
  }

  function updateChooseIn(slotId: string, patch: Partial<ChooseIn>) {
    const slot = effectiveSlotsLookup.get(slotId);
    const label = state.roster[slotId] ?? slot?.label ?? slotId;
    update(
      (prev) => {
        const current = prev.chooseIns[slotId] ?? { timeBed: "", esiOrPatient: "" };
        const next: ChooseIn = { ...current, ...patch };
        const chooseIns = { ...prev.chooseIns };
        if (!next.timeBed && !next.esiOrPatient) delete chooseIns[slotId];
        else chooseIns[slotId] = next;

        // If the slot has a materialized row at its 1* hour, sync the
        // panel values into that row so the two surfaces stay aligned.
        let assignments = prev.assignments;
        if (slot) {
          const targetHour = chooseInHourFor(slot, prev.roster[slot.id]);
          if (targetHour !== null) {
            const { time, bed } = splitTimeBed(next.timeBed);
            assignments = prev.assignments.map((a) => {
              if (a.shiftSlotId === slotId && a.hourBlock === targetHour) {
                return {
                  ...a,
                  time,
                  bed,
                  comments: next.esiOrPatient
                };
              }
              return a;
            });
          }
        }
        return { ...prev, chooseIns, assignments };
      },
      `Updated choose-in for ${label}`,
      { bumpVersion: true }
    );
  }

  function updateNedocs(hour: number, value: string) {
    const trimmed = value.trim();
    update(
      (prev) => {
        const nedocs = { ...prev.nedocs };
        if (trimmed) nedocs[hour] = trimmed;
        else delete nedocs[hour];
        return { ...prev, nedocs };
      },
      trimmed
        ? `Set NEDOCS at ${describeHour(hour)} to ${trimmed}`
        : `Cleared NEDOCS at ${describeHour(hour)}`
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-300 bg-white px-4 py-2 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              {site.name} <span className="font-normal text-slate-500">· {date}</span>
            </div>
            {site.slots.length === 0 ? (
              <div className="text-xs text-slate-500">
                No shift template configured for this site yet.
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <span>You:</span>
              <input
                defaultValue={displayName}
                onBlur={(e) => setDisplayName(e.target.value)}
                placeholder="your name"
                className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                title="Used to label your audit log entries"
              />
            </label>
            <button
              onClick={undo}
              disabled={!canUndo}
              className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              title="Undo (Ctrl/Cmd+Z)"
            >
              ↶ Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              ↷ Redo
            </button>
            <button
              onClick={() => setShowLog((v) => !v)}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              title="View change log"
              aria-expanded={showLog}
            >
              History ({auditLog.length})
            </button>
            <a
              href={`?print=1${typeof window !== "undefined" ? window.location.hash : ""}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              title="Open a print-friendly view in a new tab"
            >
              Print
            </a>
            <button onClick={onLeave} className="text-slate-600 underline">
              Change site / date
            </button>
          </div>
        </div>
        {showLog ? (
          <AuditLogPanel log={auditLog} onClose={() => setShowLog(false)} />
        ) : null}
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <RotationSheet
            assignmentsByHour={assignmentsByHour}
            allAssignments={state.assignments}
            slots={effectiveSlots}
            roster={state.roster}
            chooseIns={state.chooseIns}
            nedocs={state.nedocs}
            version={dataVersion}
            onUpdateRow={updateRow}
            onDeleteRow={deleteRow}
            onMaterialize={materializeRow}
            onUpdateNedocs={updateNedocs}
            onBulkPaste={bulkPasteIntoGrid}
          />
        </section>

        <aside className="space-y-4">
          <PasteSchedulePanel
            slots={effectiveSlots}
            onApply={applyRosterPaste}
          />
          <RosterPanel
            grouped={groupedRoster}
            roster={state.roster}
            version={dataVersion}
            onUpdateProvider={updateRoster}
            onClearProvider={clearProvider}
            onAddExtraSlot={addExtraSlot}
            onRemoveExtraSlot={removeExtraSlot}
          />
          <ChooseInPanel
            slots={effectiveSlots}
            roster={state.roster}
            chooseIns={state.chooseIns}
            version={dataVersion}
            onUpdate={updateChooseIn}
          />
        </aside>
      </div>
    </div>
  );
}

function RotationSheet({
  assignmentsByHour,
  allAssignments,
  slots,
  roster,
  chooseIns,
  nedocs,
  version,
  onUpdateRow,
  onDeleteRow,
  onMaterialize,
  onUpdateNedocs,
  onBulkPaste
}: {
  assignmentsByHour: Map<number, Assignment[]>;
  allAssignments: Assignment[];
  slots: ShiftSlot[];
  roster: Record<string, string>;
  chooseIns: Record<string, ChooseIn>;
  nedocs: Record<number, string>;
  version: number;
  onUpdateRow: (id: string, patch: Partial<Assignment>) => void;
  onDeleteRow: (id: string) => void;
  onMaterialize: (hourBlock: number, sortOrder: number, patch: RowDraft) => void;
  onUpdateNedocs: (hour: number, value: string) => void;
  onBulkPaste: (
    hour: number,
    startSortOrder: number,
    startCol: RowField,
    rowsData: string[][]
  ) => void;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-slate-400 bg-white shadow-sm">
      <table className="sheet w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col style={{ width: "64px" }} />
          <col style={{ width: "64px" }} />
          <col style={{ width: "72px" }} />
          <col />
          <col />
          <col style={{ width: "72px" }} />
        </colgroup>
        <thead>
          <tr className="sheet-head">
            <th>Hour</th>
            <th>Time</th>
            <th>Bed</th>
            <th>Physician</th>
            <th>Comments / ESI</th>
            <th>NEDOCS</th>
          </tr>
        </thead>
        <tbody>
          {HOUR_BLOCKS.map((hour) => (
            <HourBand
              key={hour}
              hour={hour}
              rows={assignmentsByHour.get(hour) ?? []}
              allAssignments={allAssignments}
              slots={slots}
              roster={roster}
              chooseIns={chooseIns}
              nedocs={nedocs[hour] ?? ""}
              version={version}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onMaterialize={onMaterialize}
              onUpdateNedocs={onUpdateNedocs}
              onBulkPaste={onBulkPaste}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HourBand({
  hour,
  rows,
  allAssignments,
  slots,
  roster,
  chooseIns,
  nedocs,
  version,
  onUpdateRow,
  onDeleteRow,
  onMaterialize,
  onUpdateNedocs,
  onBulkPaste
}: {
  hour: number;
  rows: Assignment[];
  allAssignments: Assignment[];
  slots: ShiftSlot[];
  roster: Record<string, string>;
  chooseIns: Record<string, ChooseIn>;
  nedocs: string;
  version: number;
  onUpdateRow: (id: string, patch: Partial<Assignment>) => void;
  onDeleteRow: (id: string) => void;
  onMaterialize: (hourBlock: number, sortOrder: number, patch: RowDraft) => void;
  onUpdateNedocs: (hour: number, value: string) => void;
  onBulkPaste: (
    hour: number,
    startSortOrder: number,
    startCol: RowField,
    rowsData: string[][]
  ) => void;
}) {
  const maxSort = rows.reduce((acc, a) => Math.max(acc, a.sortOrder), -1);

  const onShift = onShiftSlots(slots, roster, hour).filter((s) =>
    MAIN_ROTATION_TEAMS.includes(s.team)
  );
  const onShiftIds = new Set(onShift.map((s) => s.id));

  const totalCap = onShift.reduce(
    (sum, s) => sum + effectiveCapacity(s, hour, roster, allAssignments),
    0
  );

  const targetVisible = Math.max(
    MIN_VISIBLE_ROWS_PER_HOUR,
    totalCap > 0 ? totalCap + 1 : MIN_VISIBLE_ROWS_PER_HOUR
  );
  const placeholderCount = Math.max(targetVisible - rows.length, 1);
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => maxSort + 1 + i);

  const visibleSheetRows = rows.length + placeholders.length;
  const showCAP = totalCap > 0 && totalCap < visibleSheetRows;
  const totalRows = visibleSheetRows + (showCAP ? 1 : 0);

  function dropdownForRow(row: Assignment): ShiftSlot[] {
    if (row.shiftSlotId && !onShiftIds.has(row.shiftSlotId)) {
      const cur = slots.find((s) => s.id === row.shiftSlotId);
      return cur ? [...onShift, cur] : onShift;
    }
    return onShift;
  }

  const elements: React.ReactElement[] = [];
  let renderedIndex = 0;

  function emitCAPIfDue() {
    if (showCAP && renderedIndex === totalCap) {
      elements.push(
        <tr key={`cap-${hour}`} className="sheet-cap-row">
          <td colSpan={4} className="sheet-cap-cell">
            — CAP — rotation full for this hour
          </td>
        </tr>
      );
      renderedIndex++;
    }
  }

  rows.forEach((row) => {
    emitCAPIfDue();
    elements.push(
      <SheetRow
        key={row.id}
        row={row}
        dropdownSlots={dropdownForRow(row)}
        roster={roster}
        chooseIns={chooseIns}
        hour={hour}
        currentSortOrder={row.sortOrder}
        isFirst={renderedIndex === 0}
        totalRows={totalRows}
        nedocs={nedocs}
        version={version}
        onUpdate={(patch) => onUpdateRow(row.id, patch)}
        onDelete={() => onDeleteRow(row.id)}
        onUpdateNedocs={(v) => onUpdateNedocs(hour, v)}
        onBulkPaste={(startCol, rowsData) =>
          onBulkPaste(hour, row.sortOrder, startCol, rowsData)
        }
      />
    );
    renderedIndex++;
  });

  placeholders.forEach((sortOrder, i) => {
    emitCAPIfDue();
    const predictedSlotId = predictRotation(
      onShift,
      slots,
      allAssignments,
      hour,
      i,
      roster
    );
    elements.push(
      <SheetRow
        key={`p-${hour}-${sortOrder}`}
        row={null}
        dropdownSlots={onShift}
        roster={roster}
        chooseIns={chooseIns}
        hour={hour}
        currentSortOrder={sortOrder}
        isFirst={renderedIndex === 0}
        totalRows={totalRows}
        nedocs={nedocs}
        version={version}
        predictedSlotId={predictedSlotId}
        onMaterialize={(patch) => onMaterialize(hour, sortOrder, patch)}
        onUpdateNedocs={(v) => onUpdateNedocs(hour, v)}
        onBulkPaste={(startCol, rowsData) =>
          onBulkPaste(hour, sortOrder, startCol, rowsData)
        }
      />
    );
    renderedIndex++;
  });

  return <>{elements}</>;
}

function SheetRow({
  row,
  dropdownSlots,
  roster,
  chooseIns,
  hour,
  currentSortOrder,
  isFirst,
  totalRows,
  nedocs,
  version,
  predictedSlotId,
  onUpdate,
  onDelete,
  onMaterialize,
  onUpdateNedocs,
  onBulkPaste
}: {
  row: Assignment | null;
  dropdownSlots: ShiftSlot[];
  roster: Record<string, string>;
  chooseIns: Record<string, ChooseIn>;
  hour: number;
  currentSortOrder: number;
  isFirst: boolean;
  totalRows: number;
  nedocs: string;
  version: number;
  predictedSlotId?: string;
  onUpdate?: (patch: Partial<Assignment>) => void;
  onDelete?: () => void;
  onMaterialize?: (patch: RowDraft) => void;
  onUpdateNedocs: (value: string) => void;
  onBulkPaste: (startCol: RowField, rowsData: string[][]) => void;
}) {
  const prediction = predictedSlotId ?? "";
  const displayedSlotId = row ? row.shiftSlotId : prediction;
  const displayedSlot = displayedSlotId
    ? dropdownSlots.find((s) => s.id === displayedSlotId)
    : undefined;
  const effSlot = displayedSlot
    ? effectiveShift(displayedSlot, roster[displayedSlot.id])
    : undefined;
  const taper: TaperState = effSlot ? taperState(effSlot, hour) : "offShift";
  const chooseIn = taper === "chooseIn";
  const taperBadge =
    taper === "last"
      ? "last"
      : taper === "nxlast"
      ? "nxlast"
      : null;
  const bedIsSkip = (row?.bed ?? "").trim().toUpperCase() === "SKIP";

  // When this placeholder is at the displayed provider's choose-in (1*)
  // hour and that provider has a pre-filled Choose-in panel entry, pull
  // the time/bed/comments into the row as default values. Materialize
  // carries those defaults through too.
  const panelDefault =
    !row && chooseIn && displayedSlotId && chooseIns[displayedSlotId]
      ? (() => {
          const c = chooseIns[displayedSlotId];
          const { time, bed } = splitTimeBed(c.timeBed);
          return { time, bed, comments: c.esiOrPatient };
        })()
      : null;

  // Carry-over: row's time hour is two or more blocks earlier than the
  // current hour. Common for choose-in patients roomed hours earlier in
  // the shift.
  const carryOver = (() => {
    const raw = row?.time ?? panelDefault?.time ?? "";
    const t = parseInt(raw, 10);
    if (Number.isNaN(t) || t < 0) return false;
    const timeHour = Math.floor(t / 100);
    if (timeHour < 0 || timeHour > 23) return false;
    const HBlocks = HOUR_BLOCKS;
    const ti = HBlocks.indexOf(timeHour);
    const bi = HBlocks.indexOf(hour);
    if (ti < 0 || bi < 0) return false;
    return bi - ti >= 2;
  })();

  const timeIsValidFormat = (() => {
    const raw = row?.time ?? "";
    if (raw === "") return true;
    return /^\d{1,4}$/.test(raw.trim());
  })();

  function commit(patch: RowDraft) {
    if (row) {
      onUpdate?.(patch as Partial<Assignment>);
      return;
    }
    const finalPatch: RowDraft = { ...patch };
    if (finalPatch.shiftSlotId === undefined && prediction) {
      finalPatch.shiftSlotId = prediction;
    }
    if (panelDefault) {
      if (finalPatch.time === undefined && panelDefault.time)
        finalPatch.time = panelDefault.time;
      if (finalPatch.bed === undefined && panelDefault.bed)
        finalPatch.bed = panelDefault.bed;
      if (finalPatch.comments === undefined && panelDefault.comments)
        finalPatch.comments = panelDefault.comments;
    }
    onMaterialize?.(finalPatch);
  }

  // Intercept multi-cell pastes (TSV from Google Sheets / Excel) so the
  // pasted block lands across the correct cells. Plain single-cell pastes
  // (no tab, no newline) fall through to the browser's default behavior
  // so quick text pastes still work.
  function handlePaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    startCol: RowField
  ) {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();

    const lines = text.replace(/\r\n/g, "\n").split("\n");
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    if (lines.length === 0) return;
    const rowsData = lines.map((l) => l.split("\t"));
    onBulkPaste(startCol, rowsData);
  }

  return (
    <tr className="sheet-row">
      {isFirst ? (
        <td rowSpan={totalRows} className="sheet-hour">
          {hourLabel(hour)}
        </td>
      ) : null}
      <td
        className={`sheet-cell sheet-cell-mono${
          !timeIsValidFormat ? " sheet-cell-invalid" : ""
        }`}
      >
        <div className="flex items-center">
          {carryOver ? (
            <span
              className="sheet-carry-badge"
              title="Carry-over: patient roomed in an earlier hour"
            >
              ↩
            </span>
          ) : null}
          <input
            key={`${row ? `t-${row.id}` : `tp-${hour}`}-v${version}`}
            defaultValue={row?.time ?? panelDefault?.time ?? ""}
            placeholder="HHMM"
            inputMode="numeric"
            onPaste={(e) => handlePaste(e, "time")}
            onBlur={(e) => {
              const v = e.target.value;
              if (v === (row?.time ?? "")) return;
              commit({ time: v });
            }}
            className="sheet-input sheet-input-mono"
          />
        </div>
      </td>
      <td
        className={`sheet-cell sheet-cell-mono${bedIsSkip ? " sheet-cell-skip" : ""}`}
      >
        <input
          key={`${row ? `b-${row.id}` : `bp-${hour}`}-v${version}`}
          defaultValue={row?.bed ?? panelDefault?.bed ?? ""}
          onPaste={(e) => handlePaste(e, "bed")}
          onBlur={(e) => {
            const v = e.target.value;
            if (v === (row?.bed ?? "")) return;
            commit({ bed: v });
          }}
          className="sheet-input sheet-input-mono"
        />
      </td>
      <td
        className={`sheet-cell${
          displayedSlot ? ` sheet-team-stripe sheet-team-stripe-${displayedSlot.team}` : ""
        }`}
      >
        <div className="flex items-center" style={{ paddingLeft: displayedSlot ? 3 : 0 }}>
          {taperBadge ? (
            <span
              className="sheet-taper-badge"
              title={
                taperBadge === "last"
                  ? "Last main patient before choose-in"
                  : "Next-to-last main patient"
              }
            >
              {taperBadge}
            </span>
          ) : null}
          <select
            value={displayedSlotId}
            onChange={(e) => commit({ shiftSlotId: e.target.value })}
            className={`sheet-input sheet-select${
              !row && prediction ? " sheet-input-predicted" : ""
            }`}
          >
            <option value="">—</option>
            {dropdownSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {roster[s.id]?.trim() ? `${roster[s.id]} (${s.label})` : s.label}
              </option>
            ))}
          </select>
          {chooseIn ? (
            <span
              className="sheet-chooseIn-badge"
              title="Choose-in hour (any ESI, longest waiting)"
            >
              ★
            </span>
          ) : null}
        </div>
      </td>
      <td className="sheet-cell">
        <div className="flex items-center">
          <input
            key={`${row ? `c-${row.id}` : `cp-${hour}`}-v${version}`}
            defaultValue={row?.comments ?? panelDefault?.comments ?? ""}
            onPaste={(e) => handlePaste(e, "comments")}
            onBlur={(e) => {
              const v = e.target.value;
              if (v === (row?.comments ?? "")) return;
              commit({ comments: v });
            }}
            className="sheet-input"
          />
          {row ? (
            <button
              onClick={onDelete}
              className="sheet-row-delete"
              aria-label="Delete row"
              title="Delete row"
            >
              ×
            </button>
          ) : null}
        </div>
      </td>
      {isFirst ? (
        <td rowSpan={totalRows} className="sheet-cell sheet-cell-mono sheet-nedocs">
          <input
            key={`n-${hour}-v${version}`}
            defaultValue={nedocs}
            onBlur={(e) => {
              if (e.target.value === nedocs) return;
              onUpdateNedocs(e.target.value);
            }}
            className="sheet-input sheet-input-mono"
          />
        </td>
      ) : null}
    </tr>
  );
}

function PasteSchedulePanel({
  slots,
  onApply
}: {
  slots: ShiftSlot[];
  onApply: (updates: { slotId: string; provider: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const parsed = useMemo(() => parseScheduleText(text), [text]);
  const auto = useMemo(() => autoMatchSchedule(parsed, slots), [parsed, slots]);

  function effectiveSlotId(i: number): string {
    if (overrides[i] !== undefined) return overrides[i];
    return auto.get(i) ?? "";
  }

  function apply() {
    const seen = new Set<string>();
    const updates: { slotId: string; provider: string }[] = [];
    parsed.forEach((entry, i) => {
      const slotId = effectiveSlotId(i);
      if (!slotId || seen.has(slotId)) return;
      seen.add(slotId);
      updates.push({ slotId, provider: `${entry.name} ${entry.timeRange}` });
    });
    if (updates.length === 0) return;
    onApply(updates);
    setText("");
    setOverrides({});
    setOpen(false);
  }

  function reset() {
    setText("");
    setOverrides({});
  }

  if (slots.length === 0) return null;

  const totalLines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const unparsed = totalLines - parsed.length;
  const matched = parsed.filter((_, i) => effectiveSlotId(i)).length;

  return (
    <div className="overflow-hidden rounded-sm border border-slate-400 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-slate-300 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-100"
        aria-expanded={open}
      >
        <span>Paste schedule</span>
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="space-y-2 p-2">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOverrides({});
            }}
            placeholder={"Joshi 6a-4p\nCarr 10a-10p\nKhauv 1p-11p\n..."}
            rows={8}
            className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-[12px] leading-snug"
            spellCheck={false}
          />

          {parsed.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              Paste lines like <span className="font-mono">Joshi 6a-4p</span>.
            </div>
          ) : (
            <>
              <div className="text-[11px] text-slate-600">
                {matched} of {parsed.length} auto-matched
                {unparsed > 0 ? ` · ${unparsed} unrecognized line${unparsed === 1 ? "" : "s"}` : ""}
                . Review and edit before applying.
              </div>
              <div className="max-h-80 overflow-y-auto rounded border border-slate-200">
                <table className="w-full table-fixed border-collapse text-[12px]">
                  <colgroup>
                    <col style={{ width: "45%" }} />
                    <col />
                  </colgroup>
                  <tbody>
                    {parsed.map((entry, i) => {
                      const slotId = effectiveSlotId(i);
                      return (
                        <tr key={i} className="border-t border-slate-200">
                          <td className="px-2 py-1 align-middle">
                            <div className="truncate font-medium text-slate-800">
                              {entry.name}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {entry.timeRange}
                            </div>
                          </td>
                          <td className="px-1 py-1">
                            <select
                              value={slotId}
                              onChange={(e) =>
                                setOverrides((o) => ({ ...o, [i]: e.target.value }))
                              }
                              className={`w-full rounded border px-1 py-0.5 text-[12px] ${
                                slotId
                                  ? "border-slate-300"
                                  : "border-amber-400 bg-amber-50"
                              }`}
                            >
                              <option value="">— skip —</option>
                              {slots.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  onClick={reset}
                  className="text-[12px] text-slate-500 underline"
                >
                  Clear
                </button>
                <button
                  onClick={apply}
                  disabled={matched === 0}
                  className="rounded bg-slate-900 px-3 py-1 text-[12px] text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply {matched} to schedule
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RosterPanel({
  grouped,
  roster,
  version,
  onUpdateProvider,
  onClearProvider,
  onAddExtraSlot,
  onRemoveExtraSlot
}: {
  grouped: {
    team: string;
    templateSlots: ShiftSlot[];
    extras: ExtraSlot[];
  }[];
  roster: Record<string, string>;
  version: number;
  onUpdateProvider: (slotId: string, providerName: string) => void;
  onClearProvider: (slotId: string) => void;
  onAddExtraSlot: (input: { name: string; timeRange: string; team: string }) => void;
  onRemoveExtraSlot: (slotId: string) => void;
}) {
  const teams = grouped.map((g) => g.team);
  if (grouped.length === 0) {
    return (
      <div className="rounded-sm border border-slate-400 bg-white p-3 text-sm text-slate-500">
        No shift template configured for this site yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-sm border border-slate-400 bg-white">
      <div className="sheet-section-title">Provider Schedule</div>
      <table className="sheet w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col style={{ width: "52%" }} />
          <col />
          <col style={{ width: "24px" }} />
        </colgroup>
        <tbody>
          {grouped.map(({ team, templateSlots, extras }) => (
            <FragmentTeam
              key={team}
              team={team}
              templateSlots={templateSlots}
              extras={extras}
              roster={roster}
              version={version}
              onUpdateProvider={onUpdateProvider}
              onClearProvider={onClearProvider}
              onRemoveExtraSlot={onRemoveExtraSlot}
            />
          ))}
        </tbody>
      </table>
      <AddProviderForm teams={teams} onAdd={onAddExtraSlot} />
    </div>
  );
}

function FragmentTeam({
  team,
  templateSlots,
  extras,
  roster,
  version,
  onUpdateProvider,
  onClearProvider,
  onRemoveExtraSlot
}: {
  team: string;
  templateSlots: ShiftSlot[];
  extras: ExtraSlot[];
  roster: Record<string, string>;
  version: number;
  onUpdateProvider: (slotId: string, providerName: string) => void;
  onClearProvider: (slotId: string) => void;
  onRemoveExtraSlot: (slotId: string) => void;
}) {
  return (
    <>
      <tr className={`sheet-subhead sheet-subhead-${team}`}>
        <td colSpan={3}>{team}</td>
      </tr>
      {templateSlots.map((s) => {
        const filled = (roster[s.id] ?? "").trim() !== "";
        return (
          <tr key={s.id} className="sheet-row">
            <td className="sheet-cell sheet-cell-label">{s.label}</td>
            <td className="sheet-cell">
              <input
                key={`r-${s.id}-v${version}`}
                defaultValue={roster[s.id] ?? ""}
                onBlur={(e) => onUpdateProvider(s.id, e.target.value)}
                className="sheet-input"
                placeholder="provider"
              />
            </td>
            <td className="sheet-cell text-center">
              {filled ? (
                <button
                  onClick={() => onClearProvider(s.id)}
                  className="sheet-row-clear"
                  aria-label="Clear provider (sick / off)"
                  title="Clear provider (sick / off)"
                >
                  ×
                </button>
              ) : null}
            </td>
          </tr>
        );
      })}
      {extras.map((e) => (
        <tr key={e.id} className="sheet-row sheet-row-extra">
          <td className="sheet-cell sheet-cell-label sheet-cell-extra">
            <span className="sheet-extra-badge">+</span> {e.label}
          </td>
          <td className="sheet-cell">
            <input
              key={`r-${e.id}-v${version}`}
              defaultValue={roster[e.id] ?? ""}
              onBlur={(ev) => onUpdateProvider(e.id, ev.target.value)}
              className="sheet-input"
              placeholder="provider"
            />
          </td>
          <td className="sheet-cell text-center">
            <button
              onClick={() => onRemoveExtraSlot(e.id)}
              className="sheet-row-clear"
              aria-label="Remove this ad-hoc shift"
              title="Remove this ad-hoc shift"
            >
              ×
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

function AddProviderForm({
  teams,
  onAdd
}: {
  teams: string[];
  onAdd: (input: { name: string; timeRange: string; team: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [timeRange, setTimeRange] = useState("");
  const defaultTeam =
    teams.find((t) => MAIN_ROTATION_TEAMS.includes(t)) ?? teams[0] ?? "Red";
  const [team, setTeam] = useState(defaultTeam);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setTimeRange("");
    setTeam(defaultTeam);
    setError(null);
  }

  function submit() {
    const parsed = parseTimeRangeToShift(timeRange);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!parsed) {
      setError("Time range looks like 4a-2p, 7a-7p, 8p-8a.");
      return;
    }
    onAdd({ name, timeRange, team });
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full border-t border-slate-300 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-100"
      >
        + Add provider (early / ad-hoc)
      </button>
    );
  }
  return (
    <div className="space-y-2 border-t border-slate-300 bg-slate-50 p-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-600">
        Add provider
      </div>
      <div className="grid grid-cols-[1fr_72px_72px] gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Provider name"
          className="rounded border border-slate-300 px-2 py-1 text-[12px]"
        />
        <input
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          placeholder="4a-2p"
          className="rounded border border-slate-300 px-2 py-1 text-center font-mono text-[12px]"
        />
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="rounded border border-slate-300 bg-white px-1 py-1 text-[12px]"
        >
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {error ? <div className="text-[11px] text-red-600">{error}</div> : null}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-[12px] text-slate-500 underline"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="rounded bg-slate-900 px-3 py-1 text-[12px] text-white"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ChooseInPanel({
  slots,
  roster,
  chooseIns,
  version,
  onUpdate
}: {
  slots: ShiftSlot[];
  roster: Record<string, string>;
  chooseIns: Record<string, ChooseIn>;
  version: number;
  onUpdate: (slotId: string, patch: Partial<ChooseIn>) => void;
}) {
  const filled = slots.filter((s) => roster[s.id]?.trim());
  if (filled.length === 0) {
    return (
      <div className="rounded-sm border border-slate-400 bg-white p-3 text-sm text-slate-500">
        Choose-in opens once a provider is named in the schedule.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-sm border border-slate-400 bg-white">
      <div className="sheet-section-title">Choose-in Patient</div>
      <table className="sheet w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "30%" }} />
          <col />
        </colgroup>
        <thead>
          <tr className="sheet-head">
            <th>Provider</th>
            <th>Time / Bed</th>
            <th>ESI / Patient</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((s) => {
            const c = chooseIns[s.id];
            return (
              <tr key={s.id} className="sheet-row">
                <td className="sheet-cell sheet-cell-label" title={s.label}>
                  {roster[s.id]}
                </td>
                <td className="sheet-cell">
                  <input
                    key={`ct-${s.id}-v${version}`}
                    defaultValue={c?.timeBed ?? ""}
                    onBlur={(e) => onUpdate(s.id, { timeBed: e.target.value })}
                    className="sheet-input sheet-input-mono"
                  />
                </td>
                <td className="sheet-cell">
                  <input
                    key={`ce-${s.id}-v${version}`}
                    defaultValue={c?.esiOrPatient ?? ""}
                    onBlur={(e) => onUpdate(s.id, { esiOrPatient: e.target.value })}
                    className="sheet-input"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function AuditLogPanel({
  log,
  onClose
}: {
  log: AuditEntry[];
  onClose: () => void;
}) {
  if (log.length === 0) {
    return (
      <div className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-500">
        No changes recorded yet.
        <button onClick={onClose} className="float-right text-slate-500 underline">
          close
        </button>
      </div>
    );
  }
  const reversed = [...log].reverse();
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded border border-slate-300 bg-slate-50 text-xs">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-1">
        <span className="font-semibold text-slate-600">
          Change history (newest first)
        </span>
        <button onClick={onClose} className="text-slate-500 underline">
          close
        </button>
      </div>
      <ul className="divide-y divide-slate-200">
        {reversed.map((entry, i) => (
          <li key={`${entry.timestamp}-${i}`} className="flex gap-3 px-3 py-1">
            <span className="w-16 shrink-0 font-mono text-slate-500">
              {formatLogTime(entry.timestamp)}
            </span>
            {entry.user ? (
              <span className="w-24 shrink-0 truncate font-medium text-slate-700">
                {entry.user}
              </span>
            ) : (
              <span className="w-24 shrink-0 text-slate-400">—</span>
            )}
            <span className="text-slate-800">{entry.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrintBoard({ site, date }: { site: SiteDef; date: string }) {
  const [state, setState] = useState<DayState>(() => emptyDay(site.code, date));

  useEffect(() => {
    setState(loadDay(site.code, date));
  }, [site.code, date]);

  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, []);

  const effectiveSlots = useMemo<ShiftSlot[]>(
    () => [...site.slots, ...state.extraSlots],
    [site.slots, state.extraSlots]
  );

  const assignmentsByHour = useMemo(() => {
    const m = new Map<number, Assignment[]>();
    for (const a of state.assignments) {
      if (!m.has(a.hourBlock)) m.set(a.hourBlock, []);
      m.get(a.hourBlock)!.push(a);
    }
    for (const v of m.values()) v.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [state.assignments]);

  const rosteredSlots = effectiveSlots.filter(
    (s) => (state.roster[s.id]?.trim() ?? "") !== ""
  );

  return (
    <div className="print-view">
      <h1>
        {site.name} <span className="print-meta">— {date}</span>
      </h1>

      <section>
        <h2>Provider Schedule</h2>
        {rosteredSlots.length === 0 ? (
          <p className="print-empty">No providers rostered.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Team</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {rosteredSlots.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{s.team}</td>
                  <td>{state.roster[s.id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Main ED Rotation</h2>
        <table>
          <thead>
            <tr>
              <th className="print-col-hour">Hour</th>
              <th className="print-col-time">Time</th>
              <th className="print-col-bed">Bed</th>
              <th>Physician</th>
              <th>Comments / ESI</th>
              <th className="print-col-nedocs">NEDOCS</th>
            </tr>
          </thead>
          <tbody>
            {HOUR_BLOCKS.map((hour) => {
              const rows = assignmentsByHour.get(hour) ?? [];
              if (rows.length === 0) {
                return (
                  <tr key={hour}>
                    <td className="print-hour">{hourLabel(hour)}</td>
                    <td colSpan={4} className="print-empty">
                      —
                    </td>
                    <td>{state.nedocs[hour] ?? ""}</td>
                  </tr>
                );
              }
              return rows.map((row, idx) => (
                <tr key={row.id}>
                  {idx === 0 ? (
                    <td rowSpan={rows.length} className="print-hour">
                      {hourLabel(hour)}
                    </td>
                  ) : null}
                  <td>{row.time}</td>
                  <td>{row.bed}</td>
                  <td>
                    {state.roster[row.shiftSlotId] ??
                      effectiveSlots.find((s) => s.id === row.shiftSlotId)?.label ??
                      ""}
                  </td>
                  <td>{row.comments}</td>
                  {idx === 0 ? (
                    <td rowSpan={rows.length} className="print-nedocs">
                      {state.nedocs[hour] ?? ""}
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Choose-in</h2>
        {rosteredSlots.length === 0 ? (
          <p className="print-empty">No providers rostered.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Time / Bed</th>
                <th>ESI / Patient</th>
              </tr>
            </thead>
            <tbody>
              {rosteredSlots.map((s) => {
                const c = state.chooseIns[s.id];
                return (
                  <tr key={s.id}>
                    <td>{state.roster[s.id]}</td>
                    <td>{c?.timeBed ?? ""}</td>
                    <td>{c?.esiOrPatient ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <footer className="print-footer">
        Generated {new Date().toLocaleString()} · single-browser snapshot
      </footer>
    </div>
  );
}
