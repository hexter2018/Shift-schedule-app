import * as XLSX from "xlsx-js-style";
import {
  THAI_MONTHS, daysInMonth, isHoliday, isWeekend, weekdayLabel,
  parseCellValue, tintHex, hexNoHash
} from "./logic";

// Matches the department's real template (see the uploaded reference
// workbook): TH Sarabun New, 18pt throughout, 27pt-tall rows, name column
// left-aligned, and a 3-row signature block (underline / label / date)
// with fixed-width 4-column blocks that end at the last day column
// (not the note column).
const FONT_NAME = "TH Sarabun New";
const FONT_SIZE = 18;

// Blank rows inserted after these 1-based employee positions to visually
// separate work groups (matches how this department splits its shift
// groups on the printed schedule).
const GROUP_SEPARATOR_AFTER = new Set([4, 9, 13, 17]);

export function buildStyledWorksheet(state, holidays){
  const nd = daysInMonth(state.yearBE, state.month);
  const lastCol = nd + 3; // 0-indexed: no(0), code(1), name(2), days(3..nd+2), note(nd+3)

  const headerRowA = ["ลำดับ", "รหัส", "ชื่อ-สกุล"];
  for(let d=1; d<=nd; d++) headerRowA.push(d);
  headerRowA.push("หมายเหตุ");
  const headerRowB = ["", "", ""];
  for(let d=1; d<=nd; d++) headerRowB.push(weekdayLabel(state.yearBE, state.month, d));
  headerRowB.push("");

  const aoa = [
    ["ตารางปฏิบัติงานประจำเดือน"],
    [state.department || ""],
    [`ประจำเดือน ${THAI_MONTHS[state.month-1]} ${state.yearBE}`],
    [],
    headerRowA,
    headerRowB,
  ];
  // Row heights track aoa rows 1:1 (index-aligned); {} = leave at default.
  const rowHeights = [{hpt:27}, {hpt:27}, {hpt:27}, {hpt:6}, {hpt:24}, {hpt:18}];

  const employeeRowIndex = []; // employee[idx] -> its actual aoa row index
  const separatorRowIndices = [];
  state.employees.forEach((emp, idx)=>{
    const row = [idx+1, emp.empCode || "", emp.name || ""];
    for(let d=1; d<=nd; d++) row.push(emp.days[d] || "");
    row.push(emp.note || "");
    employeeRowIndex.push(aoa.length);
    aoa.push(row);
    rowHeights.push({hpt:27});
    if(GROUP_SEPARATOR_AFTER.has(idx+1)){
      separatorRowIndices.push(aoa.length);
      aoa.push(new Array(lastCol+1).fill(""));
      rowHeights.push({hpt:27});
    }
  });

  const monthHolidays = [];
  for(let d=1; d<=nd; d++){
    const h = isHoliday(state.yearBE, state.month, d, holidays);
    if(h) monthHolidays.push({ d, name: h.name });
  }
  let holidayListStartRow = -1;
  if(monthHolidays.length){
    aoa.push([]); rowHeights.push({});
    holidayListStartRow = aoa.length;
    aoa.push(["วันหยุดในเดือนนี้"]); rowHeights.push({hpt:24});
    monthHolidays.forEach(h=>{
      aoa.push([`วันที่ ${h.d}`, h.name]);
      rowHeights.push({hpt:24});
    });
  }

  // Signature block: fixed 4-column-wide blocks, 2-column gap, the second
  // block's right edge sits on the last *day* column (not the note
  // column) — matches the reference template exactly for any month length.
  const sigBlockWidth = 4;
  const sigGap = 2;
  const block2End = lastCol - 1; // last day column
  const block2Start = Math.max(0, block2End - sigBlockWidth + 1);
  const block1End = Math.max(0, block2Start - sigGap - 1);
  const block1Start = Math.max(0, block1End - sigBlockWidth + 1);

  for(let i=0;i<4;i++){ aoa.push([]); rowHeights.push({}); } // 4 blank spacer rows
  const sigLineRow = aoa.length;
  aoa.push(new Array(lastCol+1).fill("")); rowHeights.push({hpt:26.1});
  const sigLabelRow = aoa.length;
  const labelRow = new Array(lastCol+1).fill("");
  labelRow[block1Start] = "ผู้จัดการแผนก";
  labelRow[block2Start] = "ผู้จัดการส่วน";
  aoa.push(labelRow); rowHeights.push({hpt:27});
  const sigDateRow = aoa.length;
  const dateRow = new Array(lastCol+1).fill("");
  dateRow[block1Start] = "……./……./……";
  dateRow[block2Start] = "……./……./……";
  aoa.push(dateRow); rowHeights.push({hpt:27});

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 6.02 }, { wch: 12.02 }, { wch: 33.16 },
    ...Array(nd).fill({ wch: 9.02 }),
    { wch: 47.02 },
  ];
  ws['!rows'] = rowHeights;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
    { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } },
    { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },
    { s: { r: 4, c: 2 }, e: { r: 5, c: 2 } },
    { s: { r: 4, c: lastCol }, e: { r: 5, c: lastCol } },
    { s: { r: sigLineRow, c: block1Start }, e: { r: sigLineRow, c: block1Start+sigBlockWidth-1 } },
    { s: { r: sigLineRow, c: block2Start }, e: { r: sigLineRow, c: block2Start+sigBlockWidth-1 } },
    { s: { r: sigLabelRow, c: block1Start }, e: { r: sigLabelRow, c: block1Start+sigBlockWidth-1 } },
    { s: { r: sigLabelRow, c: block2Start }, e: { r: sigLabelRow, c: block2Start+sigBlockWidth-1 } },
    { s: { r: sigDateRow, c: block1Start }, e: { r: sigDateRow, c: block1Start+sigBlockWidth-1 } },
    { s: { r: sigDateRow, c: block2Start }, e: { r: sigDateRow, c: block2Start+sigBlockWidth-1 } },
  ];

  const argb = (hex)=> ({ rgb: "FF" + hex.replace("#","").toUpperCase() });
  const gridBorder = { style: "thin", color: argb("D8D2C4") };
  const allSides = { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder };
  const baseFont = { name: FONT_NAME, sz: FONT_SIZE };
  const setStyle = (r, c, s)=>{
    const ref = XLSX.utils.encode_cell({ r, c });
    if(!ws[ref]) ws[ref] = { t: "s", v: "" };
    ws[ref].s = s;
  };

  setStyle(0, 0, { font: { ...baseFont, bold: true }, alignment: { horizontal: "center", vertical: "center" } });
  setStyle(1, 0, { font: { ...baseFont, bold: true }, alignment: { horizontal: "center", vertical: "center" } });
  setStyle(2, 0, { font: { ...baseFont, bold: true, color: argb("6B645C") }, alignment: { horizontal: "center", vertical: "center" } });

  for(let c=0; c<=lastCol; c++){
    const isDayCol = c>=3 && c<=lastCol-1;
    const dayNum = isDayCol ? (c-2) : null;
    const weekend = dayNum ? isWeekend(state.yearBE, state.month, dayNum) : false;
    const hol = dayNum ? isHoliday(state.yearBE, state.month, dayNum, holidays) : null;
    const fill = hol ? "FDEAEA" : (weekend ? "FAF6EE" : "FAF8F4");
    const wdColor = hol ? "B91C1C" : "B45309";
    setStyle(4, c, { font: { ...baseFont, bold: true }, fill: { patternType: "solid", fgColor: argb(fill) }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: allSides });
    setStyle(5, c, { font: { ...baseFont, bold: true, color: argb(wdColor) }, fill: { patternType: "solid", fgColor: argb(fill) }, alignment: { horizontal: "center", vertical: "center" }, border: allSides });
  }

  state.employees.forEach((emp, idx)=>{
    const r = employeeRowIndex[idx];
    setStyle(r, 0, { font: baseFont, alignment: { horizontal: "center", vertical: "center" }, border: allSides });
    setStyle(r, 1, { font: baseFont, alignment: { horizontal: "center", vertical: "center" }, border: allSides });
    setStyle(r, 2, { font: { ...baseFont, bold: true }, alignment: { horizontal: "left", vertical: "center" }, border: allSides });
    for(let d=1; d<=nd; d++){
      const c = 2 + d;
      const raw = emp.days[d] || "";
      const { base, wh, th, ot } = parseCellValue(raw);
      const def = state.shiftCodes.find(sc=>sc.code.toUpperCase()===base);
      let style;
      if(def){
        const bgHex = tintHex(def.color, (wh||th) ? 0.55 : 0.86);
        const fgHex = hexNoHash(def.color);
        let border = allSides;
        if(wh){ const b = { style: "dashed", color: argb(fgHex) }; border = { top: b, bottom: b, left: b, right: b }; }
        if(th){ const b = { style: "dotted", color: argb("B91C1C") }; border = { top: b, bottom: b, left: b, right: b }; }
        if(ot){ const b = { style: "medium", color: argb("DB2777") }; border = { top: b, bottom: b, left: b, right: b }; }
        style = { font: { ...baseFont, bold: true, color: argb(fgHex) }, fill: { patternType: "solid", fgColor: argb(bgHex) }, alignment: { horizontal: "center", vertical: "center" }, border };
      } else if(base === "WH"){
        style = { font: { ...baseFont, color: argb("6B645C") }, fill: { patternType: "solid", fgColor: argb("EFECE4") }, alignment: { horizontal: "center", vertical: "center" }, border: allSides };
      } else {
        const hol = isHoliday(state.yearBE, state.month, d, holidays);
        style = { font: baseFont, alignment: { horizontal: "center", vertical: "center" }, border: allSides };
        if(hol) style.fill = { patternType: "solid", fgColor: argb("FDEAEA") };
      }
      setStyle(r, c, style);
    }
    setStyle(r, lastCol, { font: baseFont, alignment: { horizontal: "left", vertical: "center" }, border: allSides });
  });

  separatorRowIndices.forEach(r=>{
    for(let c=0; c<=lastCol; c++){
      setStyle(r, c, { font: baseFont, border: allSides });
    }
  });

  if(holidayListStartRow >= 0){
    setStyle(holidayListStartRow, 0, { font: { ...baseFont, bold: true, color: argb("B91C1C") } });
    monthHolidays.forEach((h, i)=>{
      const r = holidayListStartRow + 1 + i;
      setStyle(r, 0, { font: { ...baseFont, bold: true, color: argb("B91C1C") }, fill: { patternType: "solid", fgColor: argb("FDEAEA") }, alignment: { horizontal: "center", vertical: "center" } });
      setStyle(r, 1, { font: baseFont });
    });
  }

  const sigLine = { style: "dashed", color: argb("6B645C") };
  [block1Start, block2Start].forEach(colStart=>{
    setStyle(sigLineRow, colStart, { border: { bottom: sigLine } } );
    setStyle(sigLabelRow, colStart, { font: { ...baseFont, color: argb("6B645C") }, alignment: { horizontal: "center", vertical: "center" } });
    setStyle(sigDateRow, colStart, { font: baseFont, alignment: { horizontal: "center", vertical: "center" } });
  });

  return ws;
}

export function exportExcel(state, holidays){
  const ws = buildStyledWorksheet(state, holidays);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ตารางกะ");
  const safeDept = (state.department || "ตารางกะ").replace(/[\\/:*?"<>|]/g, "");
  XLSX.writeFile(wb, `${safeDept}-${THAI_MONTHS[state.month-1]}-${state.yearBE}.xlsx`);
}
