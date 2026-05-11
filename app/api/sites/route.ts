import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true }
  });
  return NextResponse.json(sites);
}
