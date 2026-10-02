// Reconstructs a schedule `state` object from a .xlsx this app itself
// generated (see excel.js for the exact layout this is the inverse of).
// Built for one specific situation: the database got wiped/lost, but a
// copy of the exported file survived somewhere else (email, OneDrive,
// a downloads folder) — reading it back is far less painful than
// re-typing an entire month's roster and shift assignments by hand.
//
// What this CAN fully recover: department name, month/year, the
// employee roster (code/name/note), and every day's actual shift-code
// text — this is the part that would be genuinely painful to retype.
//
// What this CANNOT recover: each shift code's own color and start/end
// time. Those were never written into the exported file as data (the
// legend text visible in the "หมายเหตุ" column in some exports is
// whatever the user personally typed there, not something this app
// generates) — only the cell's *fill color*, which a color picker chose
// and this code has no reliable way to reverse into the exact original
// hex value. Codes get a placeholder color assigned instead, and need a
// quick manual pass in "ตั้งค่า" afterward to fix colors/times — far
// quicker than retyping the whole month, but not fully lossless.

// xlsx-js-style is loaded dynamically here too (see excel.js for why) —
// this function is already async (reads the uploaded File), so the
// extra await costs nothing structurally.
import { THAI_MONTHS, daysInMonth, parseCellValue, defaultShiftCodes } from "./logic";

const PLACEHOLDER_PALETTE = [
  "#0369a1", "#b45309", "#15803d", "#6d28d9", "#be123c", "#0f766e", "#a16207", "#4338ca",
];

export class ImportError extends Error {}

function cellText(row, col){
  const v = row[col];
  if(v === undefined || v === null) return "";
  return String(v).trim();
}

export async function parseScheduleWorkbook(file){
  const XLSX = await import("xlsx-js-style");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) throw new ImportError("ไม่พบชีทข้อมูลในไฟล์นี้");

  // header:1 -> array-of-arrays, matching how excel.js originally built
  // the sheet via aoa_to_sheet — the exact inverse operation.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if(rows.length < 6) throw new ImportError("ไฟล์นี้ไม่ตรงกับรูปแบบตารางกะที่ระบบสร้าง");

  const department = cellText(rows[1], 0);
  const monthLine = cellText(rows[2], 0); // "ประจำเดือน {month} {yearBE}"
  const match = monthLine.match(/ประจำเดือน\s+(\S+)\s+(\d{4})/);
  if(!match) throw new ImportError('ไม่พบบรรทัด "ประจำเดือน ..." ที่แถว 3 — ไฟล์นี้อาจไม่ใช่ไฟล์ที่ระบบสร้างเอง');
  const monthIdx = THAI_MONTHS.indexOf(match[1]);
  if(monthIdx === -1) throw new ImportError(`ไม่รู้จักชื่อเดือน "${match[1]}"`);
  const month = monthIdx + 1;
  const yearBE = parseInt(match[2], 10);
  const nd = daysInMonth(yearBE, month);

  // Employee rows start at index 6 (0-based) — row 5 (index) is the
  // weekday-label header row. Each real employee row's "ลำดับ" column
  // (col 0) is a strictly sequential 1, 2, 3, ... — a blank group-
  // separator row (or the start of the signature block below) has col 0
  // empty, which is exactly the signal to stop.
  const employees = [];
  let r = 6;
  let expectedIndex = 1;
  while(r < rows.length){
    const row = rows[r];
    const idxCell = cellText(row, 0);
    if(idxCell === String(expectedIndex)){
      const empCode = cellText(row, 1);
      const name = cellText(row, 2);
      const note = cellText(row, nd + 3);
      const days = {};
      for(let d = 1; d <= nd; d++){
        const v = cellText(row, 2 + d);
        if(v) days[d] = v;
      }
      employees.push({
        id: `imp-${expectedIndex}-${Date.now()}`,
        empCode, name, note, days, autoFlags: {},
      });
      expectedIndex++;
      r++;
    } else if(idxCell === ""){
      // Could be a cosmetic group-separator row (keep scanning) or the
      // run of blank rows leading into the signature block (stop). The
      // signature block always starts several rows below the last real
      // employee, so require the row to be *entirely* empty (every
      // column, not just col 0) before treating it as "still separator" —
      // a signature-block row usually has *some* content (the underline
      // merge, labels) once we're deep enough, but to be safe just cap
      // how many blank rows we tolerate in a row before giving up.
      let blankRun = 0;
      let rr = r;
      while(rr < rows.length && cellText(rows[rr], 0) === "" && blankRun < 6){
        blankRun++;
        rr++;
      }
      if(blankRun >= 4) break; // this is the spacer before the signature block
      r++; // a single cosmetic separator row — skip and keep going
    } else {
      break; // anything else (non-sequential number, stray text) — stop
    }
  }
  if(employees.length === 0) throw new ImportError("ไม่พบข้อมูลพนักงานในไฟล์นี้");

  // Shift codes: start from the app's own defaults (covers the common
  // case — TH/LA/standard codes already have sensible colors and times),
  // then add a placeholder entry for any base code actually used in the
  // data that isn't already covered. Colors/times for anything new are
  // NOT recoverable from the file (see module docstring) — placeholders
  // only, fix these in "ตั้งค่า" after importing.
  const shiftCodes = defaultShiftCodes();
  const known = new Set(shiftCodes.map(c => c.code.toUpperCase()));
  const usedBases = new Set();
  employees.forEach(emp => {
    Object.values(emp.days).forEach(raw => {
      const { base } = parseCellValue(raw);
      if(base && base !== "WH") usedBases.add(base);
    });
  });
  let paletteIdx = 0;
  usedBases.forEach(base => {
    if(!known.has(base)){
      shiftCodes.push({ code: base, start: "", end: "", color: PLACEHOLDER_PALETTE[paletteIdx % PLACEHOLDER_PALETTE.length] });
      known.add(base);
      paletteIdx++;
    }
  });

  const placeholderCodes = shiftCodes
    .filter(c => usedBases.has(c.code.toUpperCase()) && !c.start && !c.end && PLACEHOLDER_PALETTE.includes(c.color))
    .map(c => c.code);

  return {
    state: {
      department, month, yearBE,
      autoGenerated: false,
      shiftCodes,
      otColor: "#c2517d",
      thColor: "#b45050",
      employees,
    },
    warnings: placeholderCodes.length
      ? [`รหัสกะต่อไปนี้กู้คืนได้แค่ตัวอักษร ยังไม่มีสี/เวลา ต้องตั้งเองใหม่ใน "ตั้งค่า": ${placeholderCodes.join(", ")}`]
      : [],
  };
}
