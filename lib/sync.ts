import {
  type AuditEntry,
  type DayState,
  emptyDay,
  loadDay as loadDayLocal,
  loadAuditLog as loadAuditLogLocal,
  saveAuditLog as saveAuditLogLocal,
  saveDay as saveDayLocal,
  MAX_LOG_ENTRIES
} from "./storage";
import { getSupabase, isSupabaseConfigured } from "./supabase";

// Row shape returned by Supabase for the `days` table.
type DayRow = {
  site_code: string;
  date: string;
  roster: Record<string, string>;
  assignments: DayState["assignments"];
  choose_ins: Record<string, DayState["chooseIns"][string]>;
  nedocs: Record<string, string>;
  extra_slots: DayState["extraSlots"];
  updated_at: string | null;
};

function rowToDayState(row: DayRow): DayState {
  const nedocs: Record<number, string> = {};
  for (const [k, v] of Object.entries(row.nedocs ?? {})) {
    const n = parseInt(k, 10);
    if (!Number.isNaN(n)) nedocs[n] = v;
  }
  return {
    siteCode: row.site_code,
    date: row.date,
    roster: row.roster ?? {},
    assignments: row.assignments ?? [],
    chooseIns: row.choose_ins ?? {},
    nedocs,
    extraSlots: row.extra_slots ?? []
  };
}

function dayStateToRow(state: DayState): Omit<DayRow, "updated_at"> {
  const nedocs: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.nedocs ?? {})) nedocs[String(k)] = v;
  return {
    site_code: state.siteCode,
    date: state.date,
    roster: state.roster ?? {},
    assignments: state.assignments ?? [],
    choose_ins: state.chooseIns ?? {},
    nedocs,
    extra_slots: state.extraSlots ?? []
  };
}

export async function fetchDay(
  siteCode: string,
  date: string
): Promise<DayState> {
  const supabase = getSupabase();
  if (!supabase) return loadDayLocal(siteCode, date);

  const { data, error } = await supabase
    .from("days")
    .select("*")
    .eq("site_code", siteCode)
    .eq("date", date)
    .maybeSingle();

  if (error) {
    console.error("fetchDay failed:", error);
    return loadDayLocal(siteCode, date);
  }
  if (!data) return emptyDay(siteCode, date);
  return rowToDayState(data as DayRow);
}

export async function persistDay(state: DayState): Promise<void> {
  // Always write through to localStorage so refresh works offline / pre-auth.
  saveDayLocal(state);

  const supabase = getSupabase();
  if (!supabase) return;

  const row = dayStateToRow(state);
  const { error } = await supabase
    .from("days")
    .upsert(row, { onConflict: "site_code,date" });
  if (error) console.error("persistDay failed:", error);
}

export async function fetchAuditLog(
  siteCode: string,
  date: string
): Promise<AuditEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return loadAuditLogLocal(siteCode, date);

  const { data, error } = await supabase
    .from("audit_log")
    .select("ts, description, user_name")
    .eq("site_code", siteCode)
    .eq("date", date)
    .order("ts", { ascending: true })
    .limit(MAX_LOG_ENTRIES);

  if (error) {
    console.error("fetchAuditLog failed:", error);
    return loadAuditLogLocal(siteCode, date);
  }
  return (data ?? []).map(
    (row: { ts: string; description: string; user_name: string | null }) => ({
      timestamp: new Date(row.ts).getTime(),
      description: row.description,
      user: row.user_name ?? undefined
    })
  );
}

export async function appendAuditEntry(
  siteCode: string,
  date: string,
  entry: AuditEntry,
  fullLog: AuditEntry[]
): Promise<void> {
  // Always mirror to localStorage so offline keeps working.
  saveAuditLogLocal(siteCode, date, fullLog);

  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("audit_log").insert({
    site_code: siteCode,
    date,
    ts: new Date(entry.timestamp).toISOString(),
    description: entry.description,
    user_name: entry.user ?? null
  });
  if (error) console.error("appendAuditEntry failed:", error);
}

export function subscribeToDay(
  siteCode: string,
  date: string,
  onUpdate: (state: DayState) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel(`day:${siteCode}:${date}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "days",
        filter: `site_code=eq.${siteCode}`
      },
      (payload) => {
        const row = payload.new as DayRow | undefined;
        if (!row || row.date !== date) return;
        onUpdate(rowToDayState(row));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export { isSupabaseConfigured };
