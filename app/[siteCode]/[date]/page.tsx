import Link from "next/link";
import { getDayBundle } from "@/lib/day";
import Board from "./Board";

export const dynamic = "force-dynamic";

export default async function DayPage({
  params
}: {
  params: { siteCode: string; date: string };
}) {
  const siteCode = decodeURIComponent(params.siteCode);
  const date = decodeURIComponent(params.date);
  const bundle = await getDayBundle(siteCode, date);

  if (!bundle) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-red-700">Unknown site code: {siteCode}.</p>
        <Link href="/" className="text-sm underline">
          Back
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{bundle.site.name}</div>
            <div className="text-xs text-slate-500">
              {date}
              {bundle.site.shiftSlots?.length === 0
                ? " · no shift template configured for this site yet"
                : ""}
            </div>
          </div>
          <Link href="/" className="text-sm text-slate-600 underline">
            Change site / date
          </Link>
        </div>
      </header>

      <Board initial={bundle} siteCode={siteCode} date={date} />
    </main>
  );
}
