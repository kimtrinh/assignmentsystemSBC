export type ShiftSlot = {
  id: string;
  label: string;
  team: string;
  startTime: string;
  endTime: string;
};

export type SiteDef = {
  code: string;
  name: string;
  slots: ShiftSlot[];
};

const FMC_SLOTS: ShiftSlot[] = [
  { id: "fmc-red-5a-3p",   label: "Red 5a-3p",      team: "Red",  startTime: "05:00", endTime: "15:00" },
  { id: "fmc-blue-5a-3p",  label: "Blue 5a-3p",     team: "Blue", startTime: "05:00", endTime: "15:00" },
  { id: "fmc-red-6a-4p",   label: "Red 6a-4p",      team: "Red",  startTime: "06:00", endTime: "16:00" },
  { id: "fmc-blue-6a-4p",  label: "Blue 6a-4p",     team: "Blue", startTime: "06:00", endTime: "16:00" },
  { id: "fmc-blue-8a-6p",  label: "Blue 8a-6p",     team: "Blue", startTime: "08:00", endTime: "18:00" },
  { id: "fmc-red-10a-10p", label: "Red 10a-10p",    team: "Red",  startTime: "10:00", endTime: "22:00" },
  { id: "fmc-red-12p-10p", label: "Red 12p-10p",    team: "Red",  startTime: "12:00", endTime: "22:00" },
  { id: "fmc-blue-1p-11p", label: "Blue 1p-11p",    team: "Blue", startTime: "13:00", endTime: "23:00" },
  { id: "fmc-red-2p-12a",  label: "Red 2p-12a",     team: "Red",  startTime: "14:00", endTime: "00:00" },
  { id: "fmc-blue-3p-1a",  label: "Blue 3p-1a",     team: "Blue", startTime: "15:00", endTime: "01:00" },
  { id: "fmc-red-8p-8a",   label: "Red 8p-8a",      team: "Red",  startTime: "20:00", endTime: "08:00" },
  { id: "fmc-blue-8p-8a",  label: "Blue 8p-8a",     team: "Blue", startTime: "20:00", endTime: "08:00" },
  { id: "fmc-blue-9p-7a",  label: "Blue 9p-7a",     team: "Blue", startTime: "21:00", endTime: "07:00" },
  { id: "fmc-blue-10p-8a", label: "Blue 10p-8a",    team: "Blue", startTime: "22:00", endTime: "08:00" },
  { id: "fmc-peds-3p-1a",  label: "PEDS 3p-1a",     team: "PEDS", startTime: "15:00", endTime: "01:00" },
  { id: "fmc-peds-11a-11p",label: "PEDS 2 11a-11p", team: "PEDS", startTime: "11:00", endTime: "23:00" },
  { id: "fmc-pitt-10a-10p",label: "PITT 10a-10p",   team: "PITT", startTime: "10:00", endTime: "22:00" },
  { id: "fmc-flex-7a-7p",  label: "FLEX 7a-7p",     team: "FLEX", startTime: "07:00", endTime: "19:00" },
  { id: "fmc-flex-8a-8p",  label: "FLEX 8a-8p",     team: "FLEX", startTime: "08:00", endTime: "20:00" },
  { id: "fmc-flex-1p-1a",  label: "FLEX 1p-1a",     team: "FLEX", startTime: "13:00", endTime: "01:00" },
  { id: "fmc-flex-2p-2a",  label: "FLEX 2p-2a",     team: "FLEX", startTime: "14:00", endTime: "02:00" },
  { id: "fmc-flex-6p-6a",  label: "FLEX 6p-6a",     team: "FLEX", startTime: "18:00", endTime: "06:00" },
  { id: "fmc-dod-1",       label: "DOD 1 6a-10a",   team: "DOD",  startTime: "06:00", endTime: "10:00" },
  { id: "fmc-dod-2",       label: "DOD 2 10a-9p",   team: "DOD",  startTime: "10:00", endTime: "21:00" },
  { id: "fmc-dod-3",       label: "DOD 3 9p-12a",   team: "DOD",  startTime: "21:00", endTime: "00:00" },
  { id: "fmc-dod-4",       label: "DOD 4 12a-6a",   team: "DOD",  startTime: "00:00", endTime: "06:00" }
];

const OMC_SLOTS: ShiftSlot[] = [
  { id: "omc-5a-3p",       label: "OMC - 5a-3p",        team: "OMC",  startTime: "05:00", endTime: "15:00" },
  { id: "omc-6a-4p",       label: "OMC - 6a-4p",        team: "OMC",  startTime: "06:00", endTime: "16:00" },
  { id: "omc-8a-8p",       label: "OMC - 8a-8p",        team: "OMC",  startTime: "08:00", endTime: "20:00" },
  { id: "omc-10a-10p",     label: "OMC - 10a-10p",      team: "OMC",  startTime: "10:00", endTime: "22:00" },
  { id: "omc-12p-12a",     label: "OMC - 12p-12a",      team: "OMC",  startTime: "12:00", endTime: "00:00" },
  { id: "omc-3p-1a",       label: "OMC - 3p-1a",        team: "OMC",  startTime: "15:00", endTime: "01:00" },
  { id: "omc-4p-2a",       label: "OMC - 4p-2a",        team: "OMC",  startTime: "16:00", endTime: "02:00" },
  { id: "omc-1-8p-8a",     label: "OMC - (1) 8p-8a",    team: "OMC",  startTime: "20:00", endTime: "08:00" },
  { id: "omc-2-8p-8a",     label: "OMC - (2) 8p-8a",    team: "OMC",  startTime: "20:00", endTime: "08:00" },
  { id: "omc-10p-8a",      label: "OMC - 10p-8a",       team: "OMC",  startTime: "22:00", endTime: "08:00" },
  { id: "omc-dod-1",       label: "OMC - DOD 1 6a-12p", team: "DOD",  startTime: "06:00", endTime: "12:00" },
  { id: "omc-dod-2",       label: "OMC - DOD 2 12p-6p", team: "DOD",  startTime: "12:00", endTime: "18:00" },
  { id: "omc-dod-3",       label: "OMC - DOD 3 6p-12a", team: "DOD",  startTime: "18:00", endTime: "00:00" },
  { id: "omc-dod-4",       label: "OMC - DOD 4 12a-6a", team: "DOD",  startTime: "00:00", endTime: "06:00" },
  { id: "omc-flex-9a-9p",  label: "OMC - Flex 9a-9p",   team: "FLEX", startTime: "09:00", endTime: "21:00" },
  { id: "omc-flex-2p-2a",  label: "OMC - Flex 2p-2a",   team: "FLEX", startTime: "14:00", endTime: "02:00" },
  { id: "omc-mp-3p-3a",    label: "OMC - MP 3p-3a",     team: "MP",   startTime: "15:00", endTime: "03:00" }
];

export const SITES: SiteDef[] = [
  { code: "FMC", name: "Kaiser Fontana", slots: FMC_SLOTS },
  { code: "ONT", name: "Kaiser OMC",     slots: OMC_SLOTS }
];

export const TEAM_ORDER = ["Red", "Blue", "OMC", "PEDS", "PITT", "FLEX", "MP", "DOD"];

// Teams whose providers participate in the Main ED rotation grid.
// FLEX / PEDS / PITT / DOD / MP cover different patient pools and are not
// part of the round-robin (see docs/current-system.md §5.1). OMC is the
// catch-all team for Kaiser OMC, which doesn't split into Red/Blue.
export const MAIN_ROTATION_TEAMS = ["Red", "Blue", "OMC"];

export function getSite(code: string): SiteDef | undefined {
  return SITES.find((s) => s.code === code);
}
