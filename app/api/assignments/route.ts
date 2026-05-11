import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    dayId: string;
    hourBlock: number;
    time?: string | null;
    bed?: string | null;
    rosterId?: string | null;
    comments?: string | null;
  };

  if (!body.dayId || typeof body.hourBlock !== "number") {
    return NextResponse.json({ error: "dayId and hourBlock required" }, { status: 400 });
  }

  const max = await prisma.assignment.aggregate({
    where: { dayId: body.dayId, hourBlock: body.hourBlock },
    _max: { sortOrder: true }
  });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;

  const created = await prisma.assignment.create({
    data: {
      dayId: body.dayId,
      hourBlock: body.hourBlock,
      time: body.time ?? null,
      bed: body.bed ?? null,
      rosterId: body.rosterId ?? null,
      comments: body.comments ?? null,
      sortOrder
    }
  });
  return NextResponse.json(created);
}
