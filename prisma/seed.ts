import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SlotSeed = { label: string; team: string; startTime: string; endTime: string };

const FMC_SLOTS: SlotSeed[] = [
  { label: "FMC – Red 5a-3p",   team: "Red",  startTime: "05:00", endTime: "15:00" },
  { label: "FMC – Red 6a-4p",   team: "Red",  startTime: "06:00", endTime: "16:00" },
  { label: "FMC – Blue 6a-4p",  team: "Blue", startTime: "06:00", endTime: "16:00" },
  { label: "FMC – Blue 8a-6p",  team: "Blue", startTime: "08:00", endTime: "18:00" },
  { label: "FMC – Red 10a-10p", team: "Red",  startTime: "10:00", endTime: "22:00" },
  { label: "FMC – Red 12p-10p", team: "Red",  startTime: "12:00", endTime: "22:00" },
  { label: "FMC – Blue 1p-11p", team: "Blue", startTime: "13:00", endTime: "23:00" },
  { label: "FMC – Red 2p-12a",  team: "Red",  startTime: "14:00", endTime: "00:00" },
  { label: "FMC – Blue 3p-1a",  team: "Blue", startTime: "15:00", endTime: "01:00" },
  { label: "FMC – Red 8p-8a",   team: "Red",  startTime: "20:00", endTime: "08:00" },
  { label: "FMC – Blue 8p-8a",  team: "Blue", startTime: "20:00", endTime: "08:00" },
  { label: "FMC – Blue 9p-7a",  team: "Blue", startTime: "21:00", endTime: "07:00" },
  { label: "FMC – Blue 10p-8a", team: "Blue", startTime: "22:00", endTime: "08:00" },
  { label: "FMC – PEDS 3p-1a",  team: "PEDS", startTime: "15:00", endTime: "01:00" },
  { label: "FMC – PEDS 2 11a-11p", team: "PEDS", startTime: "11:00", endTime: "23:00" },
  { label: "FMC – PITT 10a-10p", team: "PITT", startTime: "10:00", endTime: "22:00" },
  { label: "FMC – FLEX 7a-7p",  team: "FLEX", startTime: "07:00", endTime: "19:00" },
  { label: "FMC – FLEX 8a-8p",  team: "FLEX", startTime: "08:00", endTime: "20:00" },
  { label: "FMC – FLEX 1p-1a",  team: "FLEX", startTime: "13:00", endTime: "01:00" },
  { label: "FMC – FLEX 2p-2a",  team: "FLEX", startTime: "14:00", endTime: "02:00" },
  { label: "FMC – FLEX 6p-6a",  team: "FLEX", startTime: "18:00", endTime: "06:00" },
  { label: "FMC – DOD 1 6a-10a", team: "DOD", startTime: "06:00", endTime: "10:00" },
  { label: "FMC – DOD 2 10a-9p", team: "DOD", startTime: "10:00", endTime: "21:00" },
  { label: "FMC – DOD 3 9p-12a", team: "DOD", startTime: "21:00", endTime: "00:00" },
  { label: "FMC – DOD 4 12a-6a", team: "DOD", startTime: "00:00", endTime: "06:00" }
];

async function upsertSite(code: string, name: string, slots: SlotSeed[]) {
  const site = await prisma.site.upsert({
    where: { code },
    update: { name },
    create: { code, name }
  });

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const existing = await prisma.shiftSlot.findFirst({
      where: { siteId: site.id, label: s.label }
    });
    if (existing) {
      await prisma.shiftSlot.update({
        where: { id: existing.id },
        data: { team: s.team, startTime: s.startTime, endTime: s.endTime, sortOrder: i }
      });
    } else {
      await prisma.shiftSlot.create({
        data: { siteId: site.id, sortOrder: i, ...s }
      });
    }
  }
}

async function main() {
  await upsertSite("FMC", "Kaiser Fontana", FMC_SLOTS);
  await upsertSite("ONT", "Kaiser Ontario", []);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
