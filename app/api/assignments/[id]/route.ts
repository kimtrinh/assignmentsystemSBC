import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as {
    time?: string | null;
    bed?: string | null;
    rosterId?: string | null;
    comments?: string | null;
  };

  const data: Record<string, unknown> = {};
  if ("time" in body) data.time = body.time ?? null;
  if ("bed" in body) data.bed = body.bed ?? null;
  if ("rosterId" in body) data.rosterId = body.rosterId ?? null;
  if ("comments" in body) data.comments = body.comments ?? null;

  const updated = await prisma.assignment.update({
    where: { id: params.id },
    data
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.assignment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
