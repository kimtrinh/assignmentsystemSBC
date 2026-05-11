import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as { providerName?: string | null };
  const providerName =
    typeof body.providerName === "string"
      ? body.providerName.trim() || null
      : body.providerName ?? null;

  const updated = await prisma.rosterEntry.update({
    where: { id: params.id },
    data: { providerName }
  });
  return NextResponse.json(updated);
}
