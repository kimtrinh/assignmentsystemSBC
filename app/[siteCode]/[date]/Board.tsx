"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { HOUR_BLOCKS, hourLabel } from "@/lib/hours";

type ShiftSlot = {
  id: string;
  label: string;
  team: string | null;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

type RosterEntry = {
  id: string;
  shiftSlotId: string;
  providerName: string | null;
  shiftSlot: ShiftSlot;
};

type Assignment = {
  id: string;
  dayId: string;
  hourBlock: number;
  time: string | null;
  bed: string | null;
  rosterId: string | null;
  comments: string | null;
  sortOrder: number;
};

type ChooseIn = {
  id: string;
  rosterId: string;
  timeBed: string | null;
  esiOrPatient: string | null;
};

type Bundle = {
  site: { id: string; code: string; name: string };
  day: { id: string; siteId: string; date: string };
  rosterEntries: RosterEntry[];
  assignments: Assignment[];
  chooseIns: ChooseIn[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TEAM_ORDER = ["Red", "Blue", "PEDS", "PITT", "FLEX", "DOD"];

function rosterDisplay(r: RosterEntry): string {
  return r.providerName?.trim() ? r.providerName : r.shiftSlot.label;
}

export default function Board({
  initial,
  siteCode,
  date
}: {
  initial: Bundle;
  siteCode: string;
  date: string;
}) {
  const key = `/api/days/${siteCode}/${date}`;
  const { data, mutate, isValidating } = useSWR<Bundle>(key, fetcher, {
    fallbackData: initial,
    refreshInterval: 2000,
    revalidateOnFocus: true
  });

  const bundle = data ?? initial;

  const grouped = useMemo(() => {
    const byTeam = new Map<string, RosterEntry[]>();
    for (const r of bundle.rosterEntries) {
      const t = r.shiftSlot.team ?? "Other";
      if (!byTeam.has(t)) byTeam.set(t, []);
      byTeam.get(t)!.push(r);
    }
    const teams = Array.from(byTeam.keys()).sort((a, b) => {
      const ai = TEAM_ORDER.indexOf(a);
      const bi = TEAM_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return teams.map((t) => ({ team: t, entries: byTeam.get(t)! }));
  }, [bundle.rosterEntries]);

  const assignmentsByHour = useMemo(() => {
    const map = new Map<number, Assignment[]>();
    for (const a of bundle.assignments) {
      if (!map.has(a.hourBlock)) map.set(a.hourBlock, []);
      map.get(a.hourBlock)!.push(a);
    }
    for (const v of map.values()) {
      v.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [bundle.assignments]);

  const chooseInByRoster = useMemo(() => {
    const m = new Map<string, ChooseIn>();
    for (const c of bundle.chooseIns) m.set(c.rosterId, c);
    return m;
  }, [bundle.chooseIns]);

  async function refresh() {
    await mutate();
  }

  async function addRow(hourBlock: number) {
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayId: bundle.day.id, hourBlock })
    });
    refresh();
  }

  async function updateAssignment(id: string, patch: Partial<Assignment>) {
    await fetch(`/api/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    refresh();
  }

  async function deleteAssignment(id: string) {
    await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    refresh();
  }

  async function updateRoster(id: string, providerName: string | null) {
    await fetch(`/api/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerName })
    });
    refresh();
  }

  async function updateChooseIn(
    rosterId: string,
    patch: { timeBed?: string | null; esiOrPatient?: string | null }
  ) {
    await fetch(`/api/choose-in/${rosterId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    refresh();
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Main ED Rotation</h2>
          <span className="text-xs text-slate-500">
            Live · refreshing every 2s {isValidating ? "…" : ""}
          </span>
        </div>

        <div className="space-y-3">
          {HOUR_BLOCKS.map((hour) => {
            const rows = assignmentsByHour.get(hour) ?? [];
            return (
              <HourBlock
                key={hour}
                hour={hour}
                rows={rows}
                roster={bundle.rosterEntries}
                onAdd={() => addRow(hour)}
                onUpdate={updateAssignment}
                onDelete={deleteAssignment}
              />
            );
          })}
        </div>
      </section>

      <aside className="space-y-4">
        <RosterPanel grouped={grouped} onUpdate={updateRoster} />
        <ChooseInPanel
          roster={bundle.rosterEntries}
          chooseIns={chooseInByRoster}
          onUpdate={updateChooseIn}
        />
      </aside>
    </div>
  );
}

function HourBlock({
  hour,
  rows,
  roster,
  onAdd,
  onUpdate,
  onDelete
}: {
  hour: number;
  rows: Assignment[];
  roster: RosterEntry[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Assignment>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded border bg-white">
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
        <div className="font-mono text-sm font-semibold">{hourLabel(hour)}</div>
        <button
          onClick={onAdd}
          className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
        >
          + Add row
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-400">No patients yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-1 w-20">Time</th>
              <th className="px-3 py-1 w-20">Bed</th>
              <th className="px-3 py-1">Physician</th>
              <th className="px-3 py-1">Comments (ESI / skip reason)</th>
              <th className="px-3 py-1 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
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

function Row({
  row,
  roster,
  onUpdate,
  onDelete
}: {
  row: Assignment;
  roster: RosterEntry[];
  onUpdate: (patch: Partial<Assignment>) => void;
  onDelete: () => void;
}) {
  const [time, setTime] = useState(row.time ?? "");
  const [bed, setBed] = useState(row.bed ?? "");
  const [rosterId, setRosterId] = useState(row.rosterId ?? "");
  const [comments, setComments] = useState(row.comments ?? "");

  return (
    <tr className="border-t align-top">
      <td className="px-2 py-1">
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => time !== (row.time ?? "") && onUpdate({ time: time || null })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. 642"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={bed}
          onChange={(e) => setBed(e.target.value)}
          onBlur={() => bed !== (row.bed ?? "") && onUpdate({ bed: bed || null })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. AH2"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={rosterId}
          onChange={(e) => {
            const v = e.target.value;
            setRosterId(v);
            onUpdate({ rosterId: v || null });
          }}
          className="w-full rounded border bg-white px-2 py-1 text-sm"
        >
          <option value="">— unassigned —</option>
          {roster.map((r) => (
            <option key={r.id} value={r.id}>
              {rosterDisplay(r)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <input
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          onBlur={() =>
            comments !== (row.comments ?? "") &&
            onUpdate({ comments: comments || null })
          }
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="ESI level or skip reason"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          onClick={onDelete}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
          title="Delete row"
          aria-label="Delete row"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function RosterPanel({
  grouped,
  onUpdate
}: {
  grouped: { team: string; entries: RosterEntry[] }[];
  onUpdate: (id: string, providerName: string | null) => void;
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
        {grouped.map(({ team, entries }) => (
          <div key={team} className="px-3 py-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {team}
            </div>
            <ul className="space-y-1">
              {entries.map((r) => (
                <RosterRow key={r.id} entry={r} onUpdate={onUpdate} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function RosterRow({
  entry,
  onUpdate
}: {
  entry: RosterEntry;
  onUpdate: (id: string, providerName: string | null) => void;
}) {
  const [value, setValue] = useState(entry.providerName ?? "");
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="w-44 shrink-0 text-xs text-slate-600">
        {entry.shiftSlot.label.replace(/^FMC\s*[–-]\s*/, "")}
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== (entry.providerName ?? "")) {
            onUpdate(entry.id, value.trim() || null);
          }
        }}
        placeholder="provider"
        className="w-full rounded border px-2 py-1 text-sm"
      />
    </li>
  );
}

function ChooseInPanel({
  roster,
  chooseIns,
  onUpdate
}: {
  roster: RosterEntry[];
  chooseIns: Map<string, ChooseIn>;
  onUpdate: (
    rosterId: string,
    patch: { timeBed?: string | null; esiOrPatient?: string | null }
  ) => void;
}) {
  const filled = roster.filter((r) => r.providerName?.trim());
  if (filled.length === 0) {
    return (
      <div className="rounded border bg-white p-3 text-sm text-slate-500">
        Choose-in opens once a provider is named in the roster.
      </div>
    );
  }
  return (
    <div className="rounded border bg-white">
      <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
        Choose-in
      </div>
      <ul className="divide-y">
        {filled.map((r) => (
          <ChooseInRow
            key={r.id}
            entry={r}
            current={chooseIns.get(r.id)}
            onUpdate={onUpdate}
          />
        ))}
      </ul>
    </div>
  );
}

function ChooseInRow({
  entry,
  current,
  onUpdate
}: {
  entry: RosterEntry;
  current: ChooseIn | undefined;
  onUpdate: (
    rosterId: string,
    patch: { timeBed?: string | null; esiOrPatient?: string | null }
  ) => void;
}) {
  const [timeBed, setTimeBed] = useState(current?.timeBed ?? "");
  const [esiOrPatient, setEsiOrPatient] = useState(current?.esiOrPatient ?? "");
  return (
    <li className="px-3 py-2">
      <div className="mb-1 text-xs text-slate-600">{rosterDisplay(entry)}</div>
      <div className="flex gap-2">
        <input
          value={timeBed}
          onChange={(e) => setTimeBed(e.target.value)}
          onBlur={() =>
            timeBed !== (current?.timeBed ?? "") &&
            onUpdate(entry.id, { timeBed: timeBed || null })
          }
          placeholder="time / bed"
          className="w-1/2 rounded border px-2 py-1 text-sm"
        />
        <input
          value={esiOrPatient}
          onChange={(e) => setEsiOrPatient(e.target.value)}
          onBlur={() =>
            esiOrPatient !== (current?.esiOrPatient ?? "") &&
            onUpdate(entry.id, { esiOrPatient: esiOrPatient || null })
          }
          placeholder="ESI / patient"
          className="w-1/2 rounded border px-2 py-1 text-sm"
        />
      </div>
    </li>
  );
}
