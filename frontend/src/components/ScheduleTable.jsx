import { useState, useEffect } from "react";
import { IconAlert, IconCheck, IconTool } from "./ui/Icon";
import ShiftDetailDrawer from "./ShiftDetailDrawer";
import {
  THAI_MONTHS, THAI_WEEKDAYS, PREV_TAIL_DAYS, SHORTCUT_MAP,
  daysInMonth, weekdayLabel, isWeekend, isHoliday, prevMonthOf,
  patternKeyFor, styleForCell, expandShortcut, computeOtCounts, contrastText,
} from "../lib/logic";
import Button from "./ui/Button";
import { IconPlus } from "./ui/Icon";

const nameBadge = {
  primary: "bg-primary-soft text-primary",
  ot: "bg-[#fce7f3] text-[#be185d]",
  neutral: "bg-canvas text-ink-soft ring-1 ring-inset ring-line",
};

// Secondary employee attributes (rotation pattern, OT count, shift group,
// OT-exclude flag) used to render as four stacked full-width labeled rows
// under every name — cluttered even when most of them are empty. Now:
// small always-visible badges for at-a-glance info (readable, not
// editable), plus an explicit toggle (not hover-only — hover doesn't
// exist on touch/tablet, and hiding an editable control behind hover is
// an accessibility trap for what's actual data entry, not decoration)
// that reveals the two editable controls (group, OT-exclude) inline.
function EmployeeNameCell({ emp, patternLib, otCount, onEmployeeField }){
  const [editingSettings, setEditingSettings] = useState(false);
  const key = patternKeyFor(emp);
  const hasPattern = key && patternLib[key];

  return (
    <td className="col-name align-top">
      <div className="flex items-start justify-center gap-1 py-1">
        <div className="flex-1 min-w-0">
          <input defaultValue={emp.name || ""}
            onBlur={e=>onEmployeeField(emp.id, "name", e.target.value)}
            className="w-full bg-transparent text-center text-[16px] font-semibold text-ink border-0 p-0 focus:outline-none focus:ring-0" />
          <div className="flex items-center justify-center flex-wrap gap-1 mt-1">
            {hasPattern && (
              <span title={`มีรูปแบบที่วิเคราะห์ไว้ — รอบ ${patternLib[key].length} วัน`}
                className={`inline-flex items-center rounded px-1 py-px text-[11px] font-sans font-medium leading-tight ${nameBadge.primary}`}>
                🔁 {patternLib[key].length}
              </span>
            )}
            {otCount > 0 && (
              <span title={`ทำ OT แล้ว ${otCount} วันเดือนนี้`}
                className={`inline-flex items-center rounded px-1 py-px text-[11px] font-sans font-medium leading-tight ${nameBadge.ot}`}>
                OT {otCount}
              </span>
            )}
            {emp.shiftGroup && (
              <span title="กลุ่มกะ" className={`inline-flex items-center rounded px-1 py-px text-[11px] font-sans font-medium leading-tight ${nameBadge.neutral}`}>
                {emp.shiftGroup}
              </span>
            )}
            {emp.excludeFromOt && (
              <span title="ไม่แนะนำให้ทำ OT" className={`inline-flex items-center rounded px-1 py-px text-[11px] font-sans leading-tight ${nameBadge.neutral}`}>
                🚫 OT
              </span>
            )}
          </div>
        </div>
        <button onClick={()=>setEditingSettings(v=>!v)} title="ตั้งค่ากลุ่มกะ / OT"
          className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded text-ink-faint hover:text-primary hover:bg-primary-soft text-[11px] leading-none no-print">
          ⚙
        </button>
      </div>
      {editingSettings && (
        <div className="flex items-center justify-center gap-2 pb-1 no-print">
          <label className="flex items-center gap-1 text-[12px] font-sans text-ink-soft whitespace-nowrap">
            <input type="checkbox" checked={!!emp.excludeFromOt}
              onChange={e=>onEmployeeField(emp.id, "excludeFromOt", e.target.checked)}
              className="w-3 h-3 rounded accent-primary" />
            ไม่ทำ OT
          </label>
          <input type="text" list="shiftGroupList" defaultValue={emp.shiftGroup || ""} placeholder="กลุ่ม"
            title="ระบุกลุ่มหมุนเวียนกะ (CT, PM, SES, SOE, Day) เพื่อให้ระบบตรวจสอบว่าแต่ละวันครบทั้ง 3 กะ ในกลุ่มเดียวกันหรือไม่"
            onBlur={e=>onEmployeeField(emp.id, "shiftGroup", e.target.value.trim())}
            className="w-16 h-5 rounded bg-white dark:bg-surface px-1.5 text-[12px] font-sans text-ink text-center ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      )}
    </td>
  );
}

function DayCell({ emp, day, state, holidays, onChangeDay, onOpenColorMenu, onOpenDetail, dragState, setDragState, selectionMode, selected, onToggleSelection }){
  const val = emp.days[day] || "";
  const predicted = !!emp.autoFlags[day];
  const hol = isHoliday(state.yearBE, state.month, day, holidays);
  const style = styleForCell(val, state.shiftCodes, state.otColor, state.thColor);
  const highlight = emp.cellColors && emp.cellColors[day];
  const bg = highlight || style.bg;
  const fg = highlight ? contrastText(highlight) : style.fg;
  const knownCodes = new Set(state.shiftCodes.map(c=>c.code.toUpperCase()));
  const base = val.replace(/(OT|TH|WH)$/i, "").toUpperCase();
  const isLeave = base === "LA";
  const isInvalid = !!val && base !== "LA" && base !== "O" && !knownCodes.has(base);
  const isDropTarget = dragState?.target?.empId === emp.id && dragState?.target?.day === day;
  const className = "day-cell"
    + (isWeekend(state.yearBE, state.month, day) ? " weekend" : "")
    + (hol ? " holiday" : "")
    + (predicted ? " predicted" : "")
    + (isInvalid ? " conflict" : "")
    + (isDropTarget ? " drop-target" : "")
    + (selected ? " bulk-selected" : "");

  const commit = (rawVal, expand)=>{
    let v = rawVal.trim().toUpperCase();
    if(expand) v = expandShortcut(v);
    onChangeDay(emp.id, day, v);
  };

  const handleDrop = e => {
    e.preventDefault();
    if(!dragState?.source || (dragState.source.empId === emp.id && dragState.source.day === day)) return;
    if(val) {
      setDragState(null);
      return; // Occupied cells are protected: no silent overwrite.
    }
    const sourceEmp = state.employees.find(x=>x.id===dragState.source.empId);
    const sourceVal = sourceEmp?.days?.[dragState.source.day] || "";
    if(sourceVal) {
      onChangeDay(emp.id, day, sourceVal);
      onChangeDay(dragState.source.empId, dragState.source.day, "");
    }
    setDragState(null);
  };

  return (
    <td id={`schedule-cell-${emp.id}-${day}`} className={className} title={isInvalid ? `ไม่พบรหัสกะ ${base} ใน Master` : hol ? hol.name : undefined}
      onDragOver={e=>{ e.preventDefault(); if(dragState?.source) setDragState(v=>({...v,target:{empId:emp.id,day}})); }}
      onDrop={handleDrop}
      onClick={e=>{
        if(dragState?.source) return;
        if(selectionMode){
          if(e.target.tagName !== "INPUT" && !e.target.closest("button")) onToggleSelection(emp.id, day);
          return;
        }
        if(e.target.tagName !== "INPUT") onOpenDetail(emp.id, day);
      }}
      onContextMenu={e=>{ e.preventDefault(); onOpenColorMenu(emp.id, day, e.clientX, e.clientY); }}>
      <div className="day-cell-inner">
        {selectionMode && (
          <button type="button" className={`cell-select-btn no-print${selected ? " selected" : ""}`}
            aria-label={`${selected ? "ยกเลิกการเลือก" : "เลือก"} ${emp.name || emp.empCode || "พนักงาน"} วันที่ ${day}`}
            onClick={e=>{e.stopPropagation(); onToggleSelection(emp.id, day);}}>
            {selected ? "✓" : ""}
          </button>
        )}
        {val && <span className="drag-grip no-print" aria-hidden="true">⋮⋮</span>}
        <input
          list="shiftDatalist"
          value={val}
          draggable={!!val}
          spellCheck={false}
          aria-label={`${emp.name || emp.empCode || "พนักงาน"} วันที่ ${day}`}
          style={{background:bg, color:fg, border:style.border}}
          onDragStart={e=>{
            e.stopPropagation();
            setDragState({source:{empId:emp.id,day},target:null});
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={()=>setDragState(null)}
          onChange={e=>commit(e.target.value, false)}
          onBlur={e=>commit(e.target.value, true)}
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); e.target.blur(); } }}
        />
        {predicted && <span className="predict-dot" title="คำนวณจากรูปแบบอัตโนมัติ ยังไม่ได้ตรวจสอบ"></span>}
        <button type="button" className="cell-detail-btn no-print" title="ดูรายละเอียดกะ" aria-label="ดูรายละเอียดกะ" onClick={e=>{e.stopPropagation(); onOpenDetail(emp.id, day);}}><IconTool size={10}/></button>
        {isLeave && <span className="status-icon status-leave" aria-label="ลาพักร้อน">✈</span>}
        {isInvalid && <IconAlert size={11} className="status-icon status-conflict" />}
      </div>
    </td>
  );
}

function EmployeeStatus({ emp, state, otCount }){
  const known = new Set(state.shiftCodes.map(c=>c.code.toUpperCase()));
  const values = Object.values(emp.days || {}).map(v=>String(v || "").trim().toUpperCase()).filter(Boolean);
  const invalid = values.filter(v=>{
    const base=v.replace(/(OT|TH|WH)$/i,"");
    return base !== "LA" && base !== "O" && !known.has(base);
  }).length;
  const leave = values.filter(v=>v.replace(/(OT|TH|WH)$/i,"")==="LA").length;
  if(invalid) return <span className="roster-status conflict"><IconAlert size={12}/> {invalid} ผิด</span>;
  if(leave) return <span className="roster-status leave"><span aria-hidden="true">✈</span> ลา {leave}</span>;
  if(otCount > 0) return <span className="roster-status approved"><IconCheck size={12}/> OT {otCount}</span>;
  return <span className="roster-status neutral"><IconCheck size={12}/> ปกติ</span>;
}

export default function ScheduleTable({
  state, holidays, patternLib, prevTail,
  onChangeDay, onEmployeeField, onRemoveEmployee, onAddEmployee,
  onChangeCode, onChangeModifierColor, onChangeCellColor, onChangeNoteColor,
  captureRef, focusTarget, onBulkAction, onUndoBulk, bulkUndoAvailable,
}){
  const [colorMenu, setColorMenu] = useState(null); // {empId, day, x, y} | null
  const [dragState, setDragState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState([]);
  const [bulkAction, setBulkAction] = useState("set-shift");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkPreview, setBulkPreview] = useState(false);
  const openDetail = (empId, day)=>{
    const emp = state.employees.find(e=>e.id===empId);
    if(emp) setDetail({emp, day});
  };
  const openColorMenu = (empId, day, x, y)=> setColorMenu({empId, day, x, y});
  const closeColorMenu = ()=> setColorMenu(null);
  const cellKey = (empId, day)=>`${empId}::${day}`;
  const toggleSelection = (empId, day)=>{
    const key = cellKey(empId, day);
    setSelectedCells(v=>v.includes(key) ? v.filter(x=>x!==key) : [...v, key]);
  };
  const clearSelection = ()=>{ setSelectedCells([]); setBulkPreview(false); };
  const selectedItems = selectedCells.map(key=>{
    const idx=key.lastIndexOf("::");
    return {empId:key.slice(0,idx), day:Number(key.slice(idx+2))};
  });
  const selectedRows = selectedItems.map(x=>{
    const emp=state.employees.find(e=>e.id===x.empId);
    return { ...x, emp, value:emp?.days?.[x.day] || "" };
  });
  const bulkLabel = bulkAction === "set-shift" ? `เปลี่ยนเป็น ${bulkValue || "—"}` : bulkAction === "clear" ? "ล้างกะที่เลือก" : "ทำเครื่องหมายตรวจแล้ว";
  const runBulkAction = ()=>{
    if(!selectedItems.length) return;
    if(bulkAction === "set-shift" && !bulkValue) return;
    onBulkAction?.(bulkAction, selectedItems, bulkValue);
    clearSelection();
    setSelectionMode(false);
  };

  useEffect(()=>{
    if(!colorMenu) return;
    const close = ()=> closeColorMenu();
    // A right-click that opens the menu also fires its own "click" via the
    // browser in some setups — listening on the *next* tick (not this same
    // event loop turn) avoids the menu closing itself the instant it opens.
    const id = setTimeout(()=>{
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
      window.addEventListener("keydown", onEsc);
    }, 0);
    function onEsc(e){ if(e.key === "Escape") close(); }
    return ()=>{
      clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [colorMenu]);

  useEffect(()=>{
    if(!focusTarget?.empId || !focusTarget?.day) return;
    const id = `schedule-cell-${focusTarget.empId}-${focusTarget.day}`;
    const el = document.getElementById(id);
    if(!el) return;
    requestAnimationFrame(()=>{
      el.scrollIntoView({behavior:"smooth", block:"center", inline:"center"});
      el.classList.add("action-focus-pulse");
      const input = el.querySelector("input");
      window.setTimeout(()=>input?.focus({preventScroll:true}), 180);
      window.setTimeout(()=>el.classList.remove("action-focus-pulse"), 1500);
    });
  }, [focusTarget]);

  const nd = daysInMonth(state.yearBE, state.month);
  const {month: pm, yearBE: py} = prevMonthOf(state.month, state.yearBE);
  const pLastDay = daysInMonth(py, pm);
  const pStartDay = Math.max(1, pLastDay - PREV_TAIL_DAYS + 1);
  const prevDays = [];
  for(let d=pStartDay; d<=pLastDay; d++) prevDays.push(d);

  const otCounts = computeOtCounts(state);

  const seenDatalist = new Set();
  const datalistOpts = [];
  const addOpt = (v, label)=>{
    if(!v || seenDatalist.has(v)) return;
    seenDatalist.add(v);
    datalistOpts.push({value:v, label});
  };
  state.shiftCodes.forEach(c=>{
    addOpt(c.code);
    addOpt(c.code+"WH");
    addOpt(c.code+"TH");
  });
  addOpt("WH");
  Object.entries(SHORTCUT_MAP).forEach(([short, full])=> addOpt(short, `${short} → ${full}`));

  return (
    <>
      <div id="captureArea" ref={captureRef}>
        <div className="print-title" id="printTitle">
          <h2>ตารางปฏิบัติงาน</h2>
          <div>{state.department}</div>
          <div>ประจำเดือน {THAI_MONTHS[state.month-1]} {state.yearBE}</div>
        </div>

        <div className="roster-toolbar no-print">
          <div>
            <div className="text-sm font-semibold text-ink">ตารางปฏิบัติงาน</div>
            <div className="text-xs text-ink-soft">ลากกะไปยังช่องว่างเพื่อย้ายกะ · ช่องที่มีข้อมูลจะไม่ถูกเขียนทับอัตโนมัติ</div>
          </div>
          <div className="roster-legend" aria-label="คำอธิบายสถานะ">
            <span><span className="legend-dot approved"></span>ปกติ</span>
            <span><span className="legend-dot predicted"></span>คาดการณ์</span>
            <span><span className="legend-dot leave"></span>ลา</span>
            <span><span className="legend-dot conflict"></span>ตรวจสอบ</span>
          </div>
        </div>

        <div className="bulk-toolbar no-print">
          <button type="button" className={`bulk-select-toggle${selectionMode ? " active" : ""}`}
            onClick={()=>{setSelectionMode(v=>{const next=!v; if(!next) clearSelection(); return next;});}}>
            {selectionMode ? "ยกเลิกเลือกหลายช่อง" : "เลือกหลายช่อง"}
          </button>
          {selectionMode && (
            <>
              <span className="bulk-count">เลือกแล้ว <b>{selectedCells.length}</b> ช่อง</span>
              <button type="button" className="bulk-link" onClick={()=>setSelectedCells(state.employees.flatMap(emp=>Array.from({length:nd},(_,i)=>cellKey(emp.id,i+1))))}>เลือกทั้งเดือน</button>
              <button type="button" className="bulk-link" disabled={!selectedCells.length} onClick={clearSelection}>ล้างการเลือก</button>
              <div className="bulk-actions">
                <select value={bulkAction} onChange={e=>{setBulkAction(e.target.value);setBulkPreview(false);}} aria-label="การทำงานหลายช่อง">
                  <option value="set-shift">เปลี่ยนรหัสกะ</option>
                  <option value="clear">ล้างกะ</option>
                  <option value="review">ทำเครื่องหมายตรวจแล้ว</option>
                </select>
                {bulkAction === "set-shift" && (
                  <select value={bulkValue} onChange={e=>setBulkValue(e.target.value)} aria-label="รหัสกะใหม่">
                    <option value="">เลือกกะ…</option>
                    {state.shiftCodes.map(c=><option key={c.code} value={c.code}>{c.code}{c.start&&c.end?` · ${c.start}-${c.end}`:""}</option>)}
                    <option value="LA">LA · ลา</option>
                    <option value="O">O · หยุด</option>
                  </select>
                )}
                <button type="button" className="bulk-preview-btn" disabled={!selectedCells.length || (bulkAction === "set-shift" && !bulkValue)} onClick={()=>setBulkPreview(true)}>ดูตัวอย่าง</button>
                {bulkUndoAvailable && <button type="button" className="bulk-undo-btn" onClick={onUndoBulk}>↶ Undo</button>}
              </div>
            </>
          )}
        </div>
        {bulkPreview && (
          <div className="bulk-preview no-print">
            <div>
              <b>ตัวอย่างการเปลี่ยนแปลง</b>
              <span>{selectedRows.length} ช่อง · {bulkLabel}</span>
            </div>
            <div className="bulk-preview-list">
              {selectedRows.slice(0,6).map((x,i)=><span key={i}>{x.emp?.name || x.emp?.empCode || "พนักงาน"} · วันที่ {x.day} <b>{x.value || "ว่าง"} → {bulkAction === "set-shift" ? bulkValue : bulkAction === "clear" ? "ว่าง" : "ตรวจแล้ว"}</b></span>)}
              {selectedRows.length>6 && <span>… และอีก {selectedRows.length-6} ช่อง</span>}
            </div>
            <div className="bulk-preview-actions">
              <button type="button" className="bulk-cancel-btn" onClick={()=>setBulkPreview(false)}>ยกเลิก</button>
              <button type="button" className="bulk-apply-btn" onClick={runBulkAction}>ใช้การเปลี่ยนแปลง</button>
            </div>
          </div>
        )}

        <div className="table-wrap w-full">
          <table>
            <thead>
              <tr>
                <th className="col-no">ลำดับ</th>
                <th className="col-code">รหัส</th>
                <th className="col-name">ชื่อ-สกุล</th>
                <th className="col-status no-print">สถานะ</th>
                {prevDays.map(d=>(
                  <th key={`p${d}`} className={"col-prev no-print"+(d===pLastDay?" prev-last":"")}
                    title={`วันที่ ${d} ${THAI_MONTHS[pm-1]} ${py} (เดือนก่อนหน้า) — แสดงเพื่ออ้างอิงเท่านั้น`}>
                    {d}<span className="wd">{weekdayLabel(py, pm, d)}</span>
                    {d===pStartDay && <span className="prevtag">เดือนก่อน</span>}
                  </th>
                ))}
                {Array.from({length:nd}, (_,i)=>i+1).map(d=>{
                  const hol = isHoliday(state.yearBE, state.month, d, holidays);
                  return (
                    <th key={d} className={hol ? "holiday" : undefined} title={hol ? hol.name : undefined}>
                      {d}<span className="wd">{weekdayLabel(state.yearBE, state.month, d)}</span>
                    </th>
                  );
                })}
                <th className="col-note">หมายเหตุ</th>
                <th className="col-rm no-print"></th>
              </tr>
            </thead>
            <tbody>
              {state.employees.map((emp, idx)=>{
                if(!emp.autoFlags) emp.autoFlags = {};
                const key = patternKeyFor(emp);
                const tail = key ? prevTail[key] : null;
                const tailDays = tail ? tail.days : [];
                const otCount = otCounts[key || emp.id] || 0;
                return (
                  <tr key={emp.id}>
                    <td className="col-no">{idx+1}</td>
                    <td className="col-code">
                      <input defaultValue={emp.empCode || ""}
                        style={{width:"100%", border:"none", background:"transparent", textAlign:"center", padding:"8px 2px", fontFamily:"inherit", fontSize:17, fontWeight:600}}
                        onBlur={e=>onEmployeeField(emp.id, "empCode", e.target.value)} />
                    </td>
                    <EmployeeNameCell emp={emp} patternLib={patternLib} otCount={otCount} onEmployeeField={onEmployeeField} />
                    <td className="col-status no-print"><EmployeeStatus emp={emp} state={state} otCount={otCount} /></td>
                    {tailDays.length > 0 ? tailDays.map(({day, value}, i)=>{
                      const st = value ? styleForCell(value, state.shiftCodes, state.otColor, state.thColor) : null;
                      return (
                        <td key={`t${day}`} className={"day-cell prev-day no-print"+(i===tailDays.length-1?" prev-last":"")}
                          title={`วันที่ ${day} ${THAI_MONTHS[tail.month-1]} ${tail.yearBE} (เดือนก่อนหน้า)`}>
                          <span className={"prevval"+(value?"":" empty")} style={st?{background:st.bg, color:st.fg}:undefined}>
                            {value || "–"}
                          </span>
                        </td>
                      );
                    }) : Array.from({length:PREV_TAIL_DAYS}, (_,i)=>i).map(i=>(
                      <td key={`t${i}`} className={"day-cell prev-day no-print"+(i===PREV_TAIL_DAYS-1?" prev-last":"")}
                        title="ไม่มีข้อมูลของเดือนก่อนหน้า">
                        <span className="prevval empty">–</span>
                      </td>
                    ))}
                    {Array.from({length:nd}, (_,i)=>i+1).map(d=>(
                      <DayCell key={d} emp={emp} day={d} state={state} holidays={holidays} onChangeDay={onChangeDay} onOpenColorMenu={openColorMenu} onOpenDetail={openDetail} dragState={dragState} setDragState={setDragState} selectionMode={selectionMode} selected={selectedCells.includes(cellKey(emp.id,d))} onToggleSelection={toggleSelection} />
                    ))}
                    <td className="col-note"
                      onContextMenu={e=>{ e.preventDefault(); openColorMenu(emp.id, null, e.clientX, e.clientY); }}>
                      <input defaultValue={emp.note || ""}
                        spellCheck={false}
                        onBlur={e=>onEmployeeField(emp.id, "note", e.target.value)}
                        style={emp.noteColor ? {background:emp.noteColor, color:contrastText(emp.noteColor)} : undefined} />
                    </td>
                    <td className="col-rm no-print">
                      <button className="rm-row" title="ลบพนักงานแถวนี้" onClick={()=>onRemoveEmployee(emp.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-3 px-3 py-2.5 border-t border-line bg-[#fafbfc] dark:bg-[#161c28] no-print rounded-b-xl">
            <Button variant="secondary" size="sm" onClick={onAddEmployee}><IconPlus size={13} />เพิ่มพนักงาน</Button>
            <span className="text-[12.5px] font-sans text-ink-faint">แก้ไขรหัสกะได้จากแผง "รหัสกะ" ด้านบน</span>
          </div>
        </div>

        <div className="footer-note" id="footerNote">
          {state.shiftCodes.map((c, i)=>{
            const time = (c.start && c.end) ? `${c.start} – ${c.end}`
              : c.code.toUpperCase() === "LA" ? "ลาพักร้อน" : "";
            return (
              <span key={i} className="inline-flex items-center">
                {i>0 && <>&nbsp;&nbsp;|&nbsp;&nbsp;</>}
                <input type="color" value={c.color} title={`เปลี่ยนสี ${c.code}`}
                  onChange={e=>onChangeCode(i, {...c, color:e.target.value})}
                  className="no-print w-3 h-3 rounded-full border-0 p-0 mr-1 cursor-pointer align-middle" style={{background:c.color}} />
                <b>{c.code}{time ? " = " + time : ""}</b>
              </span>
            );
          })}
          <span className="inline-flex items-center">
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <input type="color" value={state.otColor} title="เปลี่ยนสี OT"
              onChange={e=>onChangeModifierColor("otColor", e.target.value)}
              className="no-print w-3 h-3 rounded-full border-0 p-0 mr-1 cursor-pointer align-middle" style={{background:state.otColor}} />
            <b>OT</b>&nbsp;= บังคับทำโอที (เติมต่อท้ายรหัสกะ เช่น N10OT)
          </span>
          <span className="inline-flex items-center">
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <input type="color" value={state.thColor} title="เปลี่ยนสี TH"
              onChange={e=>onChangeModifierColor("thColor", e.target.value)}
              className="no-print w-3 h-3 rounded-full border-0 p-0 mr-1 cursor-pointer align-middle" style={{background:state.thColor}} />
            <b>TH</b>&nbsp;= วันหยุดนักขัตฤกษ์ (เติมต่อท้ายรหัสกะ เช่น N10TH)
          </span>
          <span>&nbsp;&nbsp;|&nbsp;&nbsp;<b>WH</b> = วันหยุดประจำสัปดาห์ (เติมต่อท้ายรหัสกะ เช่น N10WH — สีกรอบปรับตามรหัสกะฐานอัตโนมัติ)</span>
        </div>

        <div className="sign-block">
          <div>
            <div className="line"></div>
            <div className="label">ผู้ตรวจสอบ &nbsp;&nbsp;……./……./……</div>
          </div>
          <div>
            <div className="line"></div>
            <div className="label">ผู้จัดการส่วน &nbsp;&nbsp;……./……./……</div>
          </div>
        </div>
      </div>

      <datalist id="shiftDatalist">
        {datalistOpts.map(o=>(<option key={o.value} value={o.value} label={o.label}></option>))}
      </datalist>
      <datalist id="shiftGroupList">
        <option value="CT"></option>
        <option value="PM"></option>
        <option value="SES"></option>
        <option value="SOE"></option>
        <option value="Day"></option>
      </datalist>

      {colorMenu && (
        <CellColorMenu
          x={colorMenu.x} y={colorMenu.y}
          current={(()=>{
            const emp = state.employees.find(e=>e.id===colorMenu.empId);
            if(!emp) return undefined;
            return colorMenu.day === null ? emp.noteColor : (emp.cellColors ? emp.cellColors[colorMenu.day] : undefined);
          })()}
          onPick={color=>{
            if(colorMenu.day === null) onChangeNoteColor(colorMenu.empId, color);
            else onChangeCellColor(colorMenu.empId, colorMenu.day, color);
            closeColorMenu();
          }}
          onClear={()=>{
            if(colorMenu.day === null) onChangeNoteColor(colorMenu.empId, null);
            else onChangeCellColor(colorMenu.empId, colorMenu.day, null);
            closeColorMenu();
          }}
        />
      )}
      <ShiftDetailDrawer open={!!detail} onOpenChange={open=>{ if(!open) setDetail(null); }} detail={detail} state={state} holidays={holidays} />

    </>
  );
}

const HIGHLIGHT_PRESETS = ["#fef08a", "#fdba74", "#86efac", "#93c5fd", "#f9a8d4", "#d1d5db"];

function CellColorMenu({ x, y, current, onPick, onClear }){
  // Positioned at the cursor (clientX/clientY from the contextmenu event),
  // clamped so it doesn't run off the right/bottom edge on a cell near the
  // table's border — 220/180 below are this menu's own approximate size.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 180);
  return (
    <div
      className="no-print fixed z-50 w-[200px] rounded-lg bg-white dark:bg-surface ring-1 ring-inset ring-line shadow-lg p-2.5"
      style={{ left, top }}
      onClick={e=>e.stopPropagation()}
      onContextMenu={e=>e.preventDefault()}
    >
      <div className="text-[12px] font-sans font-medium text-ink-soft mb-1.5">ไฮไลท์สีช่องนี้</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {HIGHLIGHT_PRESETS.map(c=>(
          <button key={c} title={c} onClick={()=>onPick(c)}
            className="w-6 h-6 rounded-full ring-1 ring-inset ring-black/10 hover:scale-110 transition-transform"
            style={{background:c}} />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[12.5px] font-sans text-ink-soft cursor-pointer mb-1.5">
        <input type="color" value={current || "#ffffff"} onChange={e=>onPick(e.target.value)}
          className="w-6 h-6 rounded border-0 p-0 cursor-pointer" />
        สีกำหนดเอง
      </label>
      {current && (
        <button onClick={onClear}
          className="w-full text-left text-[12.5px] font-sans text-danger hover:bg-danger-soft rounded px-1.5 py-1 transition-colors">
          ล้างไฮไลท์
        </button>
      )}
    </div>
  );
}
