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

  useEffect(() => {
    setState(loadDay(site.code, date));
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

  function addRow(hourBlock: number) {
    update((prev) => {
      const maxSort = prev.assignments
        .filter((a) => a.hourBlock === hourBlock)
        .reduce((acc, a) => Math.max(acc, a.sortOrder), -1);
      const row: Assignment = {
        id: newId(),
        hourBlock,
        time: "",
        bed: "",
        shiftSlotId: "",
        comments: "",
        sortOrder: maxSort + 1
      };
      return { ...prev, assignments: [...prev.assignments, row] };
    });
  }

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

  function updateRoster(slotId: string, providerName: string) {
    update((prev) => {
      const roster = { ...prev.roster };
      if (providerName.trim()) roster[slotId] = providerName.trim();
      else delete roster[slotId];
      return { ...prev, roster };
    });
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

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{site.name}</div>
            <div className="text-xs text-slate-500">
              {date}
              {site.slots.length === 0 ? " · no shift template configured for this site yet" : ""}
            </div>
          </div>
          <button onClick={onLeave} className="text-sm text-slate-600 underline">
            Change site / date
          </button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Main ED Rotation</h2>
            <span className="text-xs text-slate-500">Saved locally in this browser</span>
          </div>

          <div className="space-y-3">
            {HOUR_BLOCKS.map((hour) => (
              <HourBlockView
                key={hour}
                hour={hour}
                rows={assignmentsByHour.get(hour) ?? []}
                slots={site.slots}
                roster={state.roster}
                onAdd={() => addRow(hour)}
                onUpdate={updateRow}
                onDelete={deleteRow}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <RosterPanel
            grouped={groupedRoster}
            roster={state.roster}
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

function HourBlockView({
  hour,
  rows,
  slots,
  roster,
  onAdd,
  onUpdate,
  onDelete
}: {
  hour: number;
  rows: Assignment[];
  slots: ShiftSlot[];
  roster: Record<string, string>;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Assignment>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded border bg-white">
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
        <div className="font-mono text-sm font-semibold">{hourLabel(hour)}</div>
        <button onClick={onAdd} className="rounded bg-slate-900 px-2 py-1 text-xs text-white">
          + Add row
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-400">No patients yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="w-20 px-3 py-1">Time</th>
              <th className="w-20 px-3 py-1">Bed</th>
              <th className="px-3 py-1">Physician</th>
              <th className="px-3 py-1">Comments (ESI / skip reason)</th>
              <th className="w-8 px-3 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowView
                key={row.id}
                row={row}
                slots={slots}
                roster={roster}
                onUpdate={(patch) => onUpdate(row.id, patch)}
                onDelete={() => onDelete(row.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RowView({
  row,
  slots,
  roster,
  onUpdate,
  onDelete
}: {
  row: Assignment;
  slots: ShiftSlot[];
  roster: Record<string, string>;
  onUpdate: (patch: Partial<Assignment>) => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-t align-top">
      <td className="px-2 py-1">
        <input
          value={row.time}
          onChange={(e) => onUpdate({ time: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. 642"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={row.bed}
          onChange={(e) => onUpdate({ bed: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. AH2"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={row.shiftSlotId}
          onChange={(e) => onUpdate({ shiftSlotId: e.target.value })}
          className="w-full rounded border bg-white px-2 py-1 text-sm"
        >
          <option value="">— unassigned —</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {roster[s.id]?.trim() ? `${roster[s.id]} (${s.label})` : s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <input
          value={row.comments}
          onChange={(e) => onUpdate({ comments: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="ESI level or skip reason"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          onClick={onDelete}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
          aria-label="Delete row"
          title="Delete row"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function RosterPanel({
  grouped,
  roster,
  onUpdate
}: {
  grouped: { team: string; slots: ShiftSlot[] }[];
  roster: Record<string, string>;
  onUpdate: (slotId: string, providerName: string) => void;
}) {
  if (grouped.length === 0) {
    return (
      <div className="rounded border bg-white p-3 text-sm text-slate-500">
        No shift template configured for this site yet.
      </div>
    );
  }
  return (
    <div className="rounded border bg-white">
      <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
        Today&apos;s Roster
      </div>
      <div className="divide-y">
        {grouped.map(({ team, slots }) => (
          <div key={team} className="px-3 py-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {team}
            </div>
            <ul className="space-y-1">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 text-xs text-slate-600">{s.label}</span>
                  <input
                    defaultValue={roster[s.id] ?? ""}
                    onBlur={(e) => onUpdate(s.id, e.target.value)}
                    placeholder="provider"
                    className="w-full rounded border px-2 py-1 text-sm"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
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
      <div className="rounded border bg-white p-3 text-sm text-slate-500">
        Choose-in opens once a provider is named in the roster.
      </div>
    );
  }
  return (
    <div className="rounded border bg-white">
      <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Choose-in</div>
      <ul className="divide-y">
        {filled.map((s) => {
          const c = chooseIns[s.id];
          return (
            <li key={s.id} className="px-3 py-2">
              <div className="mb-1 text-xs text-slate-600">
                {roster[s.id]} <span className="text-slate-400">· {s.label}</span>
              </div>
              <div className="flex gap-2">
                <input
                  defaultValue={c?.timeBed ?? ""}
                  onBlur={(e) => onUpdate(s.id, { timeBed: e.target.value })}
                  placeholder="time / bed"
                  className="w-1/2 rounded border px-2 py-1 text-sm"
                />
                <input
                  defaultValue={c?.esiOrPatient ?? ""}
                  onBlur={(e) => onUpdate(s.id, { esiOrPatient: e.target.value })}
                  placeholder="ESI / patient"
                  className="w-1/2 rounded border px-2 py-1 text-sm"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
