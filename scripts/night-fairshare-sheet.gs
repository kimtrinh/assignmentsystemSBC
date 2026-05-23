// Night Fair-Share Assignment Sheet
// Google Apps Script — paste into Extensions > Apps Script in any Google Sheet,
// then run setupNightSheet() from the menu bar or the script editor.
//
// Creates a self-contained night-rotation tab with:
//   - Roster of on-shift providers (editable)
//   - Assignment grid from 2200 through 0400 with PSG capacity per hour
//   - Fair-share tracker: counts who has been "first at top of hour" each night
//     hour so far and suggests the provider with the fewest tallies for the
//     next hour's position 1
//   - Dropdown data validation so the clerk picks from the active roster
//   - Color coding: position 1 of each hour is highlighted; bolus hours have
//     a separate accent
//
// The fair-share suggestion updates live as the clerk fills in assignments.

// ---------- Configuration ----------

var NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4];

var FMC_NIGHT_SLOTS = [
  { label: "Red 8p-8a",      team: "Red",  start: 20, end: 8,  shiftLen: 12 },
  { label: "Blue 8p-8a",     team: "Blue", start: 20, end: 8,  shiftLen: 12 },
  { label: "Blue 9p-7a",     team: "Blue", start: 21, end: 7,  shiftLen: 10 },
  { label: "Blue 10p-8a",    team: "Blue", start: 22, end: 8,  shiftLen: 10 }
];

var OMC_NIGHT_SLOTS = [
  { label: "OMC - (1) 8p-8a", team: "OMC", start: 20, end: 8, shiftLen: 12 },
  { label: "OMC - (2) 8p-8a", team: "OMC", start: 20, end: 8, shiftLen: 12 },
  { label: "OMC - 10p-8a",    team: "OMC", start: 22, end: 8, shiftLen: 10 }
];

// ---------- PSG taper ----------

function psgSchedule(shiftLen) {
  if (shiftLen === 10) return [3, 2, 2, 2, 2, 2, 1, 1, 0, 0];
  if (shiftLen === 12) return [3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0];
  var out = [];
  for (var i = 0; i < shiftLen; i++) out.push(2);
  if (shiftLen > 0) out[0] = 3;
  if (shiftLen >= 3) { out[shiftLen - 1] = 0; out[shiftLen - 2] = 0; }
  if (shiftLen >= 4) out[shiftLen - 3] = 1;
  return out;
}

function psgCapAt(slot, hour) {
  var offset = (hour - slot.start + 24) % 24;
  var sched = psgSchedule(slot.shiftLen);
  if (offset >= sched.length) return 0;
  var t = sched[offset];
  return t <= 0 ? 0 : t;
}

function isActiveAt(slot, hour) {
  return psgCapAt(slot, hour) > 0;
}

// ---------- Hour formatting ----------

function hourLabel(h) {
  if (h === 0) return "2400";
  return (h < 10 ? "0" : "") + h + "00";
}

// ---------- Colors ----------

var CLR_HEADER       = "#1a237e";
var CLR_HEADER_TEXT  = "#ffffff";
var CLR_HOUR_HEADER  = "#e8eaf6";
var CLR_FIRST_ROW    = "#fff9c4";
var CLR_BOLUS_ROW    = "#ffe0b2";
var CLR_SUGGEST_BG   = "#c8e6c9";
var CLR_TRACKER_HEAD = "#37474f";
var CLR_TRACKER_MIN  = "#a5d6a7";
var CLR_ROSTER_HEAD  = "#263238";
var CLR_LIGHT_BORDER = "#b0bec5";

// ---------- Main entry point ----------

function setupNightSheet() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    "Night Fair-Share Sheet",
    "Which site? Type FMC or OMC:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var site = result.getResponseText().trim().toUpperCase();
  var slots = (site === "OMC") ? OMC_NIGHT_SLOTS : FMC_NIGHT_SLOTS;

  var dateResult = ui.prompt(
    "Night Fair-Share Sheet",
    "Date label (e.g. 5/23/2026):",
    ui.ButtonSet.OK_CANCEL
  );
  if (dateResult.getSelectedButton() !== ui.Button.OK) return;
  var dateLabel = dateResult.getResponseText().trim() || "Tonight";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "Night " + dateLabel;
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(sheetName);

  buildSheet(sheet, slots, site, dateLabel);
  sheet.activate();
  SpreadsheetApp.flush();
  ui.alert("Night sheet created: " + sheetName);
}

// ---------- Sheet builder ----------

function buildSheet(sheet, slots, site, dateLabel) {
  sheet.setColumnWidth(1, 40);   // #
  sheet.setColumnWidth(2, 70);   // Time
  sheet.setColumnWidth(3, 60);   // Bed
  sheet.setColumnWidth(4, 180);  // Provider
  sheet.setColumnWidth(5, 140);  // ESI / Comments
  sheet.setColumnWidth(6, 20);   // spacer
  sheet.setColumnWidth(7, 180);  // tracker: Provider
  for (var c = 8; c <= 8 + NIGHT_HOURS.length; c++) {
    sheet.setColumnWidth(c, 50);
  }

  var row = 1;

  // ---- Title ----
  sheet.getRange(row, 1, 1, 5).merge()
    .setValue("NIGHT ROTATION — " + site + " — " + dateLabel)
    .setFontSize(14).setFontWeight("bold")
    .setBackground(CLR_HEADER).setFontColor(CLR_HEADER_TEXT)
    .setHorizontalAlignment("center");
  row += 2;

  // ---- Roster ----
  var rosterStartRow = row;
  sheet.getRange(row, 1, 1, 5).merge()
    .setValue("ROSTER (edit provider names)")
    .setFontWeight("bold").setFontSize(11)
    .setBackground(CLR_ROSTER_HEAD).setFontColor(CLR_HEADER_TEXT);
  row++;

  var rosterHeaders = ["Slot", "Provider", "Team", "PSG/hr caps", ""];
  sheet.getRange(row, 1, 1, 5).setValues([rosterHeaders])
    .setFontWeight("bold").setBackground("#eceff1");
  row++;

  var providerNameRows = [];
  for (var si = 0; si < slots.length; si++) {
    var s = slots[si];
    var capStr = NIGHT_HOURS.map(function(h) {
      var cap = psgCapAt(s, h);
      return hourLabel(h) + ":" + cap;
    }).join("  ");
    sheet.getRange(row, 1).setValue(s.label);
    sheet.getRange(row, 2).setValue("").setBackground("#fffde7");
    sheet.getRange(row, 3).setValue(s.team);
    sheet.getRange(row, 4, 1, 2).merge().setValue(capStr).setFontSize(9)
      .setFontColor("#616161");
    providerNameRows.push(row);
    row++;
  }
  var rosterEndRow = row - 1;

  sheet.getRange(rosterStartRow, 1, row - rosterStartRow, 5)
    .setBorder(true, true, true, true, false, false, CLR_LIGHT_BORDER,
      SpreadsheetApp.BorderStyle.SOLID);

  row += 1;

  // ---- Fair-Share Tracker ----
  var trackerStartRow = row;
  sheet.getRange(row, 7, 1, NIGHT_HOURS.length + 2).merge()
    .setValue("FAIR-SHARE FIRST-UP TRACKER")
    .setFontWeight("bold").setFontSize(11)
    .setBackground(CLR_TRACKER_HEAD).setFontColor(CLR_HEADER_TEXT);
  row++;

  var trackerHeaderValues = ["Provider"];
  for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
    trackerHeaderValues.push(hourLabel(NIGHT_HOURS[hi]));
  }
  trackerHeaderValues.push("Total");
  sheet.getRange(row, 7, 1, trackerHeaderValues.length)
    .setValues([trackerHeaderValues])
    .setFontWeight("bold").setBackground("#eceff1")
    .setHorizontalAlignment("center");
  var trackerHeaderRow = row;
  row++;

  var trackerDataStartRow = row;
  var trackerProviderCol = 7;
  var trackerFirstHourCol = 8;
  var trackerTotalCol = trackerFirstHourCol + NIGHT_HOURS.length;

  for (var si = 0; si < slots.length; si++) {
    var provRef = "B" + providerNameRows[si];
    sheet.getRange(row, trackerProviderCol)
      .setFormula("=IF(" + provRef + '="","",' + provRef + ")")
      .setFontWeight("bold");
    // hour columns filled by the onEdit / manual formulas
    for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
      sheet.getRange(row, trackerFirstHourCol + hi)
        .setValue("")
        .setHorizontalAlignment("center");
    }
    // Total = count of non-empty hour cells
    var totalRange = getColLetter(trackerFirstHourCol) + row + ":" +
      getColLetter(trackerFirstHourCol + NIGHT_HOURS.length - 1) + row;
    sheet.getRange(row, trackerTotalCol)
      .setFormula('=COUNTA(' + totalRange + ')')
      .setFontWeight("bold").setHorizontalAlignment("center");
    row++;
  }
  var trackerDataEndRow = row - 1;

  // Suggestion row
  row++;
  sheet.getRange(row, trackerProviderCol)
    .setValue("SUGGESTED NEXT →")
    .setFontWeight("bold").setFontColor("#1b5e20")
    .setBackground(CLR_SUGGEST_BG);
  var suggestRow = row;
  for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
    var col = trackerFirstHourCol + hi;
    var providerRange = getColLetter(trackerProviderCol) + trackerDataStartRow +
      ":" + getColLetter(trackerProviderCol) + trackerDataEndRow;
    var totalRange2 = getColLetter(trackerTotalCol) + trackerDataStartRow +
      ":" + getColLetter(trackerTotalCol) + trackerDataEndRow;

    // For each hour column, count how many prior hours (to the left) each
    // provider appears in. Then pick the provider with the min count. If the
    // cell for this hour is already filled (provider was assigned), just
    // mirror that value. Otherwise, suggest the fair-share pick.
    //
    // We use a helper approach: the SUGGESTED row for hour H looks at all
    // the tally cells for that hour and prior hours to compute counts, then
    // picks the INDEX with MIN total. Since this is complex for a pure
    // formula and the tally cells are manually filled, we'll use a simpler
    // approach: suggest based on Total column (which updates as tallies are
    // entered).
    //
    // Formula: =INDEX(providerCol, MATCH(MIN(totalCol), totalCol, 0))
    // But this doesn't filter for empty provider names. Use AGGREGATE:
    sheet.getRange(row, col)
      .setFormula(
        '=IFERROR(INDEX(' + providerRange + ', MATCH(MIN(IF(' +
        providerRange + '<>"",' + totalRange2 + ',9999)), IF(' +
        providerRange + '<>"",' + totalRange2 + ',9999), 0)), "")'
      )
      .setBackground(CLR_SUGGEST_BG)
      .setFontWeight("bold").setFontColor("#1b5e20")
      .setHorizontalAlignment("center");
  }
  // Mark that these are array formulas (Ctrl+Shift+Enter in Sheets)
  // Actually, we need to handle this differently for Google Sheets.
  // Let's use a simpler approach with ARRAYFORMULA wrapper.
  for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
    var col = trackerFirstHourCol + hi;
    var providerRange = getColLetter(trackerProviderCol) + trackerDataStartRow +
      ":" + getColLetter(trackerProviderCol) + trackerDataEndRow;
    var totalRange2 = getColLetter(trackerTotalCol) + trackerDataStartRow +
      ":" + getColLetter(trackerTotalCol) + trackerDataEndRow;
    sheet.getRange(suggestRow, col)
      .setFormula(
        '=IFERROR(INDEX(' + providerRange +
        ',MATCH(MINIFS(' + totalRange2 + ',' + providerRange + ',"<>"),' +
        totalRange2 + ',0)),"")'
      );
  }

  row += 2;

  // ---- Assignment Grid ----
  var gridStartRow = row;

  // Build the list of first-row references so we can wire up the tracker
  var firstRowRefs = {};  // hour -> row number of position-1 assignment

  for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
    var h = NIGHT_HOURS[hi];
    var activeSlots = slots.filter(function(s) { return isActiveAt(s, h); });
    var totalCap = 0;
    activeSlots.forEach(function(s) { totalCap += psgCapAt(s, h); });
    var numRows = Math.max(totalCap, 1);

    var isBolus = activeSlots.some(function(s) { return psgCapAt(s, h) >= 3; });

    // Hour header
    sheet.getRange(row, 1, 1, 5).merge()
      .setValue(hourLabel(h) + "     (" + activeSlots.length +
        " providers, " + totalCap + " slots" +
        (isBolus ? ", BOLUS active" : "") + ")")
      .setFontWeight("bold").setFontSize(11)
      .setBackground(CLR_HOUR_HEADER)
      .setFontColor(CLR_HEADER);
    // Show suggestion in the header
    var sugRef = getColLetter(trackerFirstHourCol + hi) + suggestRow;
    sheet.getRange(row, 4, 1, 2).breakApart()
      .getCell(1, 1).clearContent();
    sheet.getRange(row, 4, 1, 2).merge()
      .setFormula('=IF(' + sugRef + '="","","Suggested 1st: " & ' + sugRef + ')')
      .setFontColor("#1b5e20").setBackground(CLR_HOUR_HEADER)
      .setHorizontalAlignment("right");
    // Need to re-set the hour label since we merged then broke apart
    sheet.getRange(row, 1, 1, 3).merge()
      .setValue(hourLabel(h) + "     (" + activeSlots.length +
        " providers, " + totalCap + " slots" +
        (isBolus ? ", BOLUS active" : "") + ")")
      .setFontWeight("bold").setFontSize(11)
      .setBackground(CLR_HOUR_HEADER)
      .setFontColor(CLR_HEADER);
    row++;

    // Column headers
    sheet.getRange(row, 1, 1, 5)
      .setValues([["#", "Time", "Bed", "Provider", "ESI / Comments"]])
      .setFontWeight("bold").setFontSize(9).setBackground("#f5f5f5");
    row++;

    // Provider name list for validation
    var providerListRange = "B" + providerNameRows[0] + ":B" + providerNameRows[providerNameRows.length - 1];
    var validation = SpreadsheetApp.newDataValidation()
      .requireValueInRange(sheet.getRange(providerListRange), true)
      .setAllowInvalid(true)
      .build();

    for (var r = 0; r < numRows; r++) {
      var pos = r + 1;
      sheet.getRange(row, 1).setValue(pos).setFontColor("#9e9e9e")
        .setHorizontalAlignment("center");
      sheet.getRange(row, 2).setNumberFormat("@");  // time as text
      sheet.getRange(row, 3).setNumberFormat("@");  // bed as text
      sheet.getRange(row, 4).setDataValidation(validation);
      sheet.getRange(row, 5).setNumberFormat("@");

      if (pos === 1) {
        sheet.getRange(row, 1, 1, 5)
          .setBackground(isBolus ? CLR_BOLUS_ROW : CLR_FIRST_ROW);
        firstRowRefs[h] = row;
      }
      row++;
    }

    // Thin border around the hour block
    sheet.getRange(row - numRows - 1, 1, numRows + 1, 5)
      .setBorder(true, true, true, true, false, false, CLR_LIGHT_BORDER,
        SpreadsheetApp.BorderStyle.SOLID);

    row++;  // blank row between hours
  }

  // ---- Wire up the tracker tallies ----
  // Each tracker cell (provider × hour) should show a checkmark if that
  // provider was the one entered in position 1 of that hour.
  for (var si = 0; si < slots.length; si++) {
    var provRow = trackerDataStartRow + si;
    var provRef = getColLetter(trackerProviderCol) + provRow;
    for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
      var h = NIGHT_HOURS[hi];
      var firstRow = firstRowRefs[h];
      if (!firstRow) continue;
      var assignedProvRef = "D" + firstRow;
      var col = trackerFirstHourCol + hi;
      sheet.getRange(provRow, col)
        .setFormula(
          '=IF(AND(' + provRef + '<>"",' + assignedProvRef + '<>"",' +
          assignedProvRef + '=' + provRef + '),"✓","")'
        )
        .setHorizontalAlignment("center")
        .setFontSize(12);
    }
  }

  // ---- Re-do total column to count checkmarks ----
  for (var si = 0; si < slots.length; si++) {
    var provRow = trackerDataStartRow + si;
    var rangeStr = getColLetter(trackerFirstHourCol) + provRow + ":" +
      getColLetter(trackerFirstHourCol + NIGHT_HOURS.length - 1) + provRow;
    sheet.getRange(provRow, trackerTotalCol)
      .setFormula('=COUNTIF(' + rangeStr + ',"✓")')
      .setFontWeight("bold").setHorizontalAlignment("center");
  }

  // ---- Re-do suggestion row with proper MINIFS against checkmark counts ----
  for (var hi = 0; hi < NIGHT_HOURS.length; hi++) {
    var col = trackerFirstHourCol + hi;
    var provRng = getColLetter(trackerProviderCol) + trackerDataStartRow +
      ":" + getColLetter(trackerProviderCol) + trackerDataEndRow;
    var totRng = getColLetter(trackerTotalCol) + trackerDataStartRow +
      ":" + getColLetter(trackerTotalCol) + trackerDataEndRow;

    // Only count tallies from hours BEFORE this one (columns to the left).
    // Build a COUNTIF range for prior-hour checkmarks only.
    if (hi === 0) {
      // First night hour: no prior history. Suggest first provider in roster.
      sheet.getRange(suggestRow, col)
        .setFormula('=IFERROR(INDEX(' + provRng + ',MATCH(TRUE,INDEX(' +
          provRng + '<>"",0),0)),"")');
    } else {
      // Sum checkmarks in columns to the LEFT of this one for each provider.
      // Use a per-row COUNTIF across prior hour columns.
      var priorCols = [];
      for (var pi = 0; pi < hi; pi++) {
        priorCols.push(getColLetter(trackerFirstHourCol + pi));
      }
      // Build a helper: for each provider row, count checkmarks in prior cols.
      // Then pick the provider with the minimum such count.
      // Since we can't easily do this in a single formula, we'll use the
      // Total column but subtract checkmarks from THIS hour and later hours.
      // Simpler: compute "prior count" = sum of checkmarks in cols before hi.
      //
      // Use: COUNTIF across a range of prior columns for each provider row.
      // Formula approach: INDEX/MATCH with a computed partial sum.
      //
      // Cleanest approach: use a helper column? No — let's use MMULT.
      // Actually simplest: for each suggestion cell, build an array formula
      // that sums prior columns per provider and picks the min.
      var priorRange = getColLetter(trackerFirstHourCol) + trackerDataStartRow +
        ":" + getColLetter(trackerFirstHourCol + hi - 1) + trackerDataEndRow;
      var numProviders = slots.length;
      sheet.getRange(suggestRow, col)
        .setFormula(
          '=IFERROR(INDEX(' + provRng +
          ',MATCH(MIN(IF(' + provRng + '<>"",' +
          'MMULT(IF(' + priorRange + '="✓",1,0),' +
          'SEQUENCE(' + hi + ',1,1,0)),9999)),' +
          'IF(' + provRng + '<>"",' +
          'MMULT(IF(' + priorRange + '="✓",1,0),' +
          'SEQUENCE(' + hi + ',1,1,0)),9999),0)),"")'
        );
    }
    sheet.getRange(suggestRow, col)
      .setBackground(CLR_SUGGEST_BG)
      .setFontWeight("bold").setFontColor("#1b5e20")
      .setHorizontalAlignment("center");
  }

  // ---- Instructions ----
  row += 1;
  sheet.getRange(row, 1, 1, 5).merge()
    .setValue("HOW TO USE")
    .setFontWeight("bold").setFontSize(11)
    .setBackground("#263238").setFontColor("#ffffff");
  row++;
  var instructions = [
    "1. Fill in provider names in the ROSTER section (column B, yellow cells).",
    "2. For each hour, the yellow row (#1) is the first patient — the sickest walk-in.",
    '3. Check the FAIR-SHARE TRACKER (right side) for the "SUGGESTED NEXT" row.',
    "4. Pick the suggested provider for row #1 to share the sickest-patient load fairly.",
    "5. Orange rows (#1 at 2200) indicate bolus — the new 10pm provider gets those.",
    "6. The tracker auto-updates: ✓ marks appear as you assign providers to row #1.",
    "7. Suggestion = provider with fewest ✓ marks in prior night hours. Ties → roster order."
  ];
  for (var i = 0; i < instructions.length; i++) {
    sheet.getRange(row, 1, 1, 5).merge()
      .setValue(instructions[i]).setFontSize(9).setFontColor("#546e7a");
    row++;
  }

  // Freeze title
  sheet.setFrozenRows(1);
}

// ---------- Helpers ----------

function getColLetter(colNum) {
  var letter = "";
  while (colNum > 0) {
    var mod = (colNum - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colNum = Math.floor((colNum - 1) / 26);
  }
  return letter;
}

// ---------- Menu ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Night Rotation")
    .addItem("Create Night Sheet", "setupNightSheet")
    .addToUi();
}
