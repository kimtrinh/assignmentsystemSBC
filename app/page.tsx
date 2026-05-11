import Link from "next/link";
import { prisma } from "@/lib/db";

function todayInLA(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(new Date());
}

export default async function Home() {
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  const today = todayInLA();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold mb-1">ED Assignment System</h1>
      <p className="text-slate-600 mb-6">
        Pick a site and a date to open that day&apos;s assignment board.
      </p>

      {sites.length === 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No sites yet. Run <code className="font-mono">npm run db:seed</code> to
          create Fontana and Ontario.
        </div>
      ) : (
        <ul className="space-y-3">
          {sites.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border bg-white p-4"
            >
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-slate-500">{s.code}</div>
              </div>
              <form action={`/${s.code}/${today}`} className="flex items-center gap-2">
                <Link
                  href={`/${s.code}/${today}`}
                  className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  Open today ({today})
                </Link>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 rounded border bg-white p-4">
        <form action="/jump" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-slate-600">Site</div>
            <select name="site" className="rounded border px-2 py-1.5" defaultValue={sites[0]?.code ?? ""}>
              {sites.map((s) => (
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
              name="date"
              defaultValue={today}
              className="rounded border px-2 py-1.5"
            />
          </label>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
            Open
          </button>
        </form>
      </div>
    </main>
  );
}
