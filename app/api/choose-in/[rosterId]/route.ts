import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: { rosterId: string } }
) {
  const body = (await req.json()) as {
    timeBed?: string | null;
    esiOrPatient?: string | null;
  };

  const roster = await prisma.rosterEntry.findUnique({
    where: { id: params.rosterId }
  });
  if (!roster) return NextResponse.json({ error: "Unknown roster" }, { status: 404 });

  const upserted = await prisma.chooseIn.upsert({
    where: { rosterId: params.rosterId },
    update: {
      timeBed: body.timeBed ?? null,
      esiOrPatient: body.esiOrPatient ?? null
    },
    create: {
      dayId: roster.dayId,
      rosterId: params.rosterId,
      timeBed: body.timeBed ?? null,
      esiOrPatient: body.esiOrPatient ?? null
    }
  });
  return NextResponse.json(upserted);
}
