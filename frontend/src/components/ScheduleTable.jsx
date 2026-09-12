import { useState } from "react";
import {
  THAI_MONTHS, THAI_WEEKDAYS, PREV_TAIL_DAYS, SHORTCUT_MAP,
  daysInMonth, weekdayLabel, isWeekend, isHoliday, prevMonthOf,
  patternKeyFor, styleForCell, expandShortcut, computeOtCounts,
} from "../lib/logic";
import Button from "./ui/Button";

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
      <div className="flex items-start justify-end gap-1 py-1">
        <div className="flex-1 min-w-0">
          <input defaultValue={emp.name || ""}
            onBlur={e=>onEmployeeField(emp.id, "name", e.target.value)}
            className="w-full bg-transparent text-right text-[14.5px] font-semibold text-ink border-0 p-0 focus:outline-none focus:ring-0" />
          <div className="flex items-center justify-end flex-wrap gap-1 mt-1">
            {hasPattern && (
              <span title={`มีรูปแบบที่วิเคราะห์ไว้ — รอบ ${patternLib[key].length} วัน`}
                className={`inline-flex items-center rounded px-1 py-px text-[10px] font-sans font-medium leading-tight ${nameBadge.primary}`}>
                🔁 {patternLib[key].length}
              </span>
            )}
            {otCount > 0 && (
              <span title={`ทำ OT แล้ว ${otCount} วันเดือนนี้`}
                className={`inline-flex items-center rounded px-1 py-px text-[10px] font-sans font-medium leading-tight ${nameBadge.ot}`}>
                OT {otCount}
              </span>
            )}
            {emp.shiftGroup && (
              <span title="กลุ่มกะ" className={`inline-flex items-center rounded px-1 py-px text-[10px] font-sans font-medium leading-tight ${nameBadge.neutral}`}>
                {emp.shiftGroup}
              </span>
            )}
            {emp.excludeFromOt && (
              <span title="ไม่แนะนำให้ทำ OT" className={`inline-flex items-center rounded px-1 py-px text-[10px] font-sans leading-tight ${nameBadge.neutral}`}>
                🚫 OT
              </span>
            )}
          </div>
        </div>
        <button onClick={()=>setEditingSettings(v=>!v)} title="ตั้งค่ากลุ่มกะ / OT"
          className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded text-ink-faint hover:text-primary hover:bg-primary-soft text-[10px] leading-none no-print">
          ⚙
        </button>
      </div>
      {editingSettings && (
        <div className="flex items-center justify-end gap-2 pb-1 no-print">
          <label className="flex items-center gap-1 text-[11px] font-sans text-ink-soft whitespace-nowrap">
            <input type="checkbox" checked={!!emp.excludeFromOt}
              onChange={e=>onEmployeeField(emp.id, "excludeFromOt", e.target.checked)}
              className="w-3 h-3 rounded accent-primary" />
            ไม่ทำ OT
          </label>
          <input type="text" list="shiftGroupList" defaultValue={emp.shiftGroup || ""} placeholder="กลุ่ม"
            title="ระบุกลุ่มหมุนเวียนกะ (CT, PM, SES, SOE, Day) เพื่อให้ระบบตรวจสอบว่าแต่ละวันครบทั้ง 3 กะ ในกลุ่มเดียวกันหรือไม่"
            onBlur={e=>onEmployeeField(emp.id, "shiftGroup", e.target.value.trim())}
            className="w-16 h-5 rounded bg-white px-1.5 text-[11px] font-sans text-ink text-right ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      )}
    </td>
  );
}

function DayCell({ emp, day, state, holidays, onChangeDay }){
  // Fully controlled from the store (not local component state): cells can
  // change programmatically — holiday overrides, OT assignment, gap-fix,
  // next-month generation — and must always reflect that, the same way the
  // original always read/wrote the single shared `state` object.
  const val = emp.days[day] || "";
  const predicted = !!emp.autoFlags[day];
  const hol = isHoliday(state.yearBE, state.month, day, holidays);
  const style = styleForCell(val, state.shiftCodes);
  const className = "day-cell"
    + (isWeekend(state.yearBE, state.month, day) ? " weekend" : "")
    + (hol ? " holiday" : "")
    + (predicted ? " predicted" : "");

  const commit = (rawVal, expand)=>{
    let v = rawVal.trim().toUpperCase();
    if(expand) v = expandShortcut(v);
    onChangeDay(emp.id, day, v);
  };

  return (
    <td className={className} title={hol ? hol.name : undefined}>
      <input
        list="shiftDatalist"
        value={val}
        style={{background:style.bg, color:style.fg, border:style.border}}
        onChange={e=>commit(e.target.value, false)}
        onBlur={e=>commit(e.target.value, true)}
        onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); e.target.blur(); } }}
      />
      {predicted && <span className="predict-dot" title="คำนวณจากรูปแบบอัตโนมัติ ยังไม่ได้ตรวจสอบ"></span>}
    </td>
  );
}

export default function ScheduleTable({
  state, holidays, patternLib, prevTail,
  onChangeDay, onEmployeeField, onRemoveEmployee, onAddEmployee,
  captureRef,
}){
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

        <div className="table-wrap w-full">
          <table>
            <thead>
              <tr>
                <th className="col-no">ลำดับ</th>
                <th className="col-code">รหัส</th>
                <th className="col-name">ชื่อ-สกุล</th>
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
                    <td className="col-name">
                      <input defaultValue={emp.empCode || ""}
                        style={{width:"100%", border:"none", background:"transparent", textAlign:"center", padding:"8px 2px", fontFamily:"inherit", fontSize:15.5}}
                        onBlur={e=>onEmployeeField(emp.id, "empCode", e.target.value)} />
                    </td>
                    <EmployeeNameCell emp={emp} patternLib={patternLib} otCount={otCount} onEmployeeField={onEmployeeField} />
                    {tailDays.length > 0 ? tailDays.map(({day, value}, i)=>{
                      const st = value ? styleForCell(value, state.shiftCodes) : null;
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
                      <DayCell key={d} emp={emp} day={d} state={state} holidays={holidays} onChangeDay={onChangeDay} />
                    ))}
                    <td className="col-note">
                      <input defaultValue={emp.note || ""}
                        onBlur={e=>onEmployeeField(emp.id, "note", e.target.value)} />
                    </td>
                    <td className="col-rm no-print">
                      <button className="rm-row" title="ลบพนักงานแถวนี้" onClick={()=>onRemoveEmployee(emp.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-3 px-3 py-2.5 border-t border-line bg-[#fafbfc] no-print rounded-b-xl">
            <Button variant="secondary" size="sm" onClick={onAddEmployee}>+ เพิ่มพนักงาน</Button>
            <span className="text-[12.5px] font-sans text-ink-faint">แก้ไขรหัสกะได้จากแผง "รหัสกะ" ด้านบน</span>
          </div>
        </div>

        <div className="footer-note" id="footerNote">
          {state.shiftCodes.map(c=>{
            const time = (c.start && c.end) ? `${c.start} – ${c.end}` : "";
            return `${c.code}${time ? " = " + time : ""}`;
          }).map((text, i)=>(
            <span key={i}>{i>0 && <>&nbsp;&nbsp;|&nbsp;&nbsp;</>}<b>{text}</b></span>
          ))}
          <span>&nbsp;&nbsp;|&nbsp;&nbsp;<b>WH</b> = วันหยุดประจำสัปดาห์ (เติมต่อท้ายรหัสกะ เช่น N10WH)</span>
          <span>&nbsp;&nbsp;|&nbsp;&nbsp;<b>TH</b> = วันหยุดนักขัตฤกษ์ (เติมต่อท้ายรหัสกะ เช่น N10TH)</span>
          <span>&nbsp;&nbsp;|&nbsp;&nbsp;<b>OT</b> = บังคับทำโอที (เติมต่อท้ายรหัสกะ เช่น N10OT)</span>
          <span>&nbsp;&nbsp;|&nbsp;&nbsp;<b>LA</b> = ลาพักร้อน</span>
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
    </>
  );
}
