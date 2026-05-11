import { NextResponse } from "next/server";
import { getDayBundle } from "@/lib/day";

export async function GET(
  _req: Request,
  { params }: { params: { siteCode: string; date: string } }
) {
  const bundle = await getDayBundle(params.siteCode, params.date);
  if (!bundle) return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  return NextResponse.json(bundle);
}
