import { prisma } from "./db";

export async function getOrCreateDay(siteCode: string, date: string) {
  const site = await prisma.site.findUnique({
    where: { code: siteCode },
    include: { shiftSlots: { orderBy: { sortOrder: "asc" } } }
  });
  if (!site) return null;

  let day = await prisma.day.findUnique({
    where: { siteId_date: { siteId: site.id, date } }
  });

  if (!day) {
    day = await prisma.day.create({ data: { siteId: site.id, date } });
    // Pre-create empty roster entries for every shift slot at this site.
    if (site.shiftSlots.length) {
      await prisma.rosterEntry.createMany({
        data: site.shiftSlots.map((s) => ({
          dayId: day!.id,
          shiftSlotId: s.id,
          providerName: null
        }))
      });
    }
  }

  return { site, day };
}

export async function getDayBundle(siteCode: string, date: string) {
  const result = await getOrCreateDay(siteCode, date);
  if (!result) return null;
  const { site, day } = result;

  const [rosterEntries, assignments, chooseIns] = await Promise.all([
    prisma.rosterEntry.findMany({
      where: { dayId: day.id },
      include: { shiftSlot: true }
    }),
    prisma.assignment.findMany({
      where: { dayId: day.id },
      orderBy: [{ hourBlock: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.chooseIn.findMany({ where: { dayId: day.id } })
  ]);

  rosterEntries.sort(
    (a, b) => (a.shiftSlot.sortOrder ?? 0) - (b.shiftSlot.sortOrder ?? 0)
  );

  return { site, day, rosterEntries, assignments, chooseIns };
}

export type DayBundle = NonNullable<Awaited<ReturnType<typeof getDayBundle>>>;
