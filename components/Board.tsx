"use client";

import { useEffect, useMemo, useState } from "react";
import { HOUR_BLOCKS, hourLabel } from "@/lib/hours";
import {
  SITES,
  TEAM_ORDER,
  getSite,
  type ShiftSlot,
  type SiteDef
} from "@/lib/shiftTemplate";
import {
  type Assignment,
  type ChooseIn,
  type DayState,
  emptyDay,
  loadDay,
  newId,
  saveDay
} from "@/lib/storage";

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

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">ED Assignment System</h1>
      <p className="mb-6 text-slate-600">
        Pick a site and a date to open that day&apos;s assignment board.
      </p>

      <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Single-user only.</strong> This build stores all data in your
        browser. Other people see their own empty boards — no live sync.
        Clearing browser data deletes your boards.
      </div>

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

type RowDraft = Partial<Pick<Assignment, "time" | "bed" | "shiftSlotId" | "comments">>;

function DayBoard({
  site,
  date,
  onLeave
}: {
  site: SiteDef;
  date: string;
  onLeave: () => void;
}) {
  const [state, setState] = useState<DayState>(() => emptyDay(site.code, date));
  const [rosterVersion, setRosterVersion] = useState(0);

  useEffect(() => {
    setState(loadDay(site.code, date));
    setRosterVersion((v) => v + 1);
  }, [site.code, date]);

  function update(mutator: (prev: DayState) => DayState) {
    setState((prev) => {
      const next = mutator(prev);
      saveDay(next);
      return next;
    });
  }

  const groupedRoster = useMemo(() => {
    const byTeam = new Map<string, ShiftSlot[]>();
    for (const s of site.slots) {
      if (!byTeam.has(s.team)) byTeam.set(s.team, []);
      byTeam.get(s.team)!.push(s);
    }
    const teams = Array.from(byTeam.keys()).sort((a, b) => {
      const ai = TEAM_ORDER.indexOf(a);
      const bi = TEAM_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return teams.map((t) => ({ team: t, slots: byTeam.get(t)! }));
  }, [site]);

  const assignmentsByHour = useMemo(() => {
    const m = new Map<number, Assignment[]>();
    for (const a of state.assignments) {
      if (!m.has(a.hourBlock)) m.set(a.hourBlock, []);
      m.get(a.hourBlock)!.push(a);
    }
    for (const v of m.values()) v.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [state.assignments]);

  function updateRow(id: string, patch: Partial<Assignment>) {
    update((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a))
    }));
  }

  function deleteRow(id: string) {
    update((prev) => ({
      ...prev,
      assignments: prev.assignments.filter((a) => a.id !== id)
    }));
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
    update((prev) => ({ ...prev, assignments: [...prev.assignments, row] }));
  }

  function updateRoster(slotId: string, providerName: string) {
    update((prev) => {
      const roster = { ...prev.roster };
      if (providerName.trim()) roster[slotId] = providerName.trim();
      else delete roster[slotId];
      return { ...prev, roster };
    });
  }

  function applyRosterPaste(updates: { slotId: string; provider: string }[]) {
    update((prev) => {
      const roster = { ...prev.roster };
      for (const { slotId, provider } of updates) {
        const trimmed = provider.trim();
        if (trimmed) roster[slotId] = trimmed;
        else delete roster[slotId];
      }
      return { ...prev, roster };
    });
    setRosterVersion((v) => v + 1);
  }

  function updateChooseIn(slotId: string, patch: Partial<ChooseIn>) {
    update((prev) => {
      const current = prev.chooseIns[slotId] ?? { timeBed: "", esiOrPatient: "" };
      const next: ChooseIn = { ...current, ...patch };
      const chooseIns = { ...prev.chooseIns };
      if (!next.timeBed && !next.esiOrPatient) delete chooseIns[slotId];
      else chooseIns[slotId] = next;
      return { ...prev, chooseIns };
    });
  }

  function updateNedocs(hour: number, value: string) {
    update((prev) => {
      const nedocs = { ...prev.nedocs };
      if (value.trim()) nedocs[hour] = value.trim();
      else delete nedocs[hour];
      return { ...prev, nedocs };
    });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-300 bg-white px-4 py-2">
        <div className="flex items-center justify-between gap-4">
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
          <button onClick={onLeave} className="text-sm text-slate-600 underline">
            Change site / date
          </button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <RotationSheet
            assignmentsByHour={assignmentsByHour}
            slots={site.slots}
            roster={state.roster}
            nedocs={state.nedocs}
            onUpdateRow={updateRow}
            onDeleteRow={deleteRow}
            onMaterialize={materializeRow}
            onUpdateNedocs={updateNedocs}
          />
        </section>

        <aside className="space-y-4">
          <PasteSchedulePanel
            slots={site.slots}
            onApply={applyRosterPaste}
          />
          <RosterPanel
            grouped={groupedRoster}
            roster={state.roster}
            version={rosterVersion}
            onUpdate={updateRoster}
          />
          <ChooseInPanel
            slots={site.slots}
            roster={state.roster}
            chooseIns={state.chooseIns}
            onUpdate={updateChooseIn}
          />
        </aside>
      </div>
    </div>
  );
}

function RotationSheet({
  assignmentsByHour,
  slots,
  roster,
  nedocs,
  onUpdateRow,
  onDeleteRow,
  onMaterialize,
  onUpdateNedocs
}: {
  assignmentsByHour: Map<number, Assignment[]>;
  slots: ShiftSlot[];
  roster: Record<string, string>;
  nedocs: Record<number, string>;
  onUpdateRow: (id: string, patch: Partial<Assignment>) => void;
  onDeleteRow: (id: string) => void;
  onMaterialize: (hourBlock: number, sortOrder: number, patch: RowDraft) => void;
  onUpdateNedocs: (hour: number, value: string) => void;
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
              slots={slots}
              roster={roster}
              nedocs={nedocs[hour] ?? ""}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onMaterialize={onMaterialize}
              onUpdateNedocs={onUpdateNedocs}
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
  slots,
  roster,
  nedocs,
  onUpdateRow,
  onDeleteRow,
  onMaterialize,
  onUpdateNedocs
}: {
  hour: number;
  rows: Assignment[];
  slots: ShiftSlot[];
  roster: Record<string, string>;
  nedocs: string;
  onUpdateRow: (id: string, patch: Partial<Assignment>) => void;
  onDeleteRow: (id: string) => void;
  onMaterialize: (hourBlock: number, sortOrder: number, patch: RowDraft) => void;
  onUpdateNedocs: (hour: number, value: string) => void;
}) {
  const maxSort = rows.reduce((acc, a) => Math.max(acc, a.sortOrder), -1);
  const placeholderCount = Math.max(MIN_VISIBLE_ROWS_PER_HOUR - rows.length, 1);
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => maxSort + 1 + i);
  const totalRows = rows.length + placeholders.length;

  return (
    <>
      {rows.map((row, idx) => (
        <SheetRow
          key={row.id}
          row={row}
          slots={slots}
          roster={roster}
          hour={hour}
          isFirst={idx === 0}
          totalRows={totalRows}
          nedocs={nedocs}
          onUpdate={(patch) => onUpdateRow(row.id, patch)}
          onDelete={() => onDeleteRow(row.id)}
          onUpdateNedocs={(v) => onUpdateNedocs(hour, v)}
        />
      ))}
      {placeholders.map((sortOrder, i) => {
        const idx = rows.length + i;
        return (
          <SheetRow
            key={`p-${hour}-${sortOrder}`}
            row={null}
            slots={slots}
            roster={roster}
            hour={hour}
            isFirst={idx === 0}
            totalRows={totalRows}
            nedocs={nedocs}
            onMaterialize={(patch) => onMaterialize(hour, sortOrder, patch)}
            onUpdateNedocs={(v) => onUpdateNedocs(hour, v)}
          />
        );
      })}
    </>
  );
}

function SheetRow({
  row,
  slots,
  roster,
  hour,
  isFirst,
  totalRows,
  nedocs,
  onUpdate,
  onDelete,
  onMaterialize,
  onUpdateNedocs
}: {
  row: Assignment | null;
  slots: ShiftSlot[];
  roster: Record<string, string>;
  hour: number;
  isFirst: boolean;
  totalRows: number;
  nedocs: string;
  onUpdate?: (patch: Partial<Assignment>) => void;
  onDelete?: () => void;
  onMaterialize?: (patch: RowDraft) => void;
  onUpdateNedocs: (value: string) => void;
}) {
  function commit(patch: RowDraft) {
    if (row) onUpdate?.(patch as Partial<Assignment>);
    else onMaterialize?.(patch);
  }

  return (
    <tr className="sheet-row">
      {isFirst ? (
        <td rowSpan={totalRows} className="sheet-hour">
          {hourLabel(hour)}
        </td>
      ) : null}
      <td className="sheet-cell sheet-cell-mono">
        <input
          key={row ? `t-${row.id}` : `tp-${hour}`}
          defaultValue={row?.time ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v === (row?.time ?? "")) return;
            commit({ time: v });
          }}
          className="sheet-input sheet-input-mono"
        />
      </td>
      <td className="sheet-cell sheet-cell-mono">
        <input
          key={row ? `b-${row.id}` : `bp-${hour}`}
          defaultValue={row?.bed ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v === (row?.bed ?? "")) return;
            commit({ bed: v });
          }}
          className="sheet-input sheet-input-mono"
        />
      </td>
      <td className="sheet-cell">
        <select
          value={row?.shiftSlotId ?? ""}
          onChange={(e) => commit({ shiftSlotId: e.target.value })}
          className="sheet-input sheet-select"
        >
          <option value="">—</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {roster[s.id]?.trim() ? `${roster[s.id]} (${s.label})` : s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="sheet-cell">
        <div className="flex items-center">
          <input
            key={row ? `c-${row.id}` : `cp-${hour}`}
            defaultValue={row?.comments ?? ""}
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
            key={`n-${hour}`}
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
  onUpdate
}: {
  grouped: { team: string; slots: ShiftSlot[] }[];
  roster: Record<string, string>;
  version: number;
  onUpdate: (slotId: string, providerName: string) => void;
}) {
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
          <col style={{ width: "55%" }} />
          <col />
        </colgroup>
        <tbody>
          {grouped.map(({ team, slots }) => (
            <FragmentTeam
              key={team}
              team={team}
              slots={slots}
              roster={roster}
              version={version}
              onUpdate={onUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentTeam({
  team,
  slots,
  roster,
  version,
  onUpdate
}: {
  team: string;
  slots: ShiftSlot[];
  roster: Record<string, string>;
  version: number;
  onUpdate: (slotId: string, providerName: string) => void;
}) {
  return (
    <>
      <tr className="sheet-subhead">
        <td colSpan={2}>{team}</td>
      </tr>
      {slots.map((s) => (
        <tr key={s.id} className="sheet-row">
          <td className="sheet-cell sheet-cell-label">{s.label}</td>
          <td className="sheet-cell">
            <input
              key={`r-${s.id}-v${version}`}
              defaultValue={roster[s.id] ?? ""}
              onBlur={(e) => onUpdate(s.id, e.target.value)}
              className="sheet-input"
              placeholder="provider"
            />
          </td>
        </tr>
      ))}
    </>
  );
}

function ChooseInPanel({
  slots,
  roster,
  chooseIns,
  onUpdate
}: {
  slots: ShiftSlot[];
  roster: Record<string, string>;
  chooseIns: Record<string, ChooseIn>;
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
                    key={`ct-${s.id}`}
                    defaultValue={c?.timeBed ?? ""}
                    onBlur={(e) => onUpdate(s.id, { timeBed: e.target.value })}
                    className="sheet-input sheet-input-mono"
                  />
                </td>
                <td className="sheet-cell">
                  <input
                    key={`ce-${s.id}`}
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
