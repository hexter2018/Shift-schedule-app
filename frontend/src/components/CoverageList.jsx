import { useState } from "react";
import {
  daysInMonth, weekdayLabel, patternKeyFor, vacatedShiftFor, findOtCandidates,
} from "../lib/logic";
import Card from "./ui/Card";
import Button from "./ui/Button";
import Tooltip from "./ui/Tooltip";
import { inputClass } from "./ui/Field";

function LeaveRowNoPattern({ emp, day, dateLabel, reason, pickableCodes, onUseVacated }){
  const [pick, setPick] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-[13.5px] font-sans">
      <span className="font-semibold text-ink min-w-[160px]">{emp.name || emp.empCode}</span>
      <span className="text-ink-soft flex items-center gap-1.5 flex-wrap">
        {dateLabel} — ลา ({reason}) เลือกกะที่ต้องหาคนแทนเอง:
        <select value={pick} onChange={e=>setPick(e.target.value)} className={inputClass + " h-7 w-28 text-[13px]"}>
          <option value="">-- เลือกกะ --</option>
          {pickableCodes.map(c=>(<option key={c.code} value={c.code}>{c.code}</option>))}
        </select>
        <Button variant="secondary" size="sm" onClick={()=>{ if(pick) onUseVacated(emp.id, day, pick); }}>ใช้กะนี้</Button>
      </span>
    </div>
  );
}

export default function CoverageList({ state, patternLib, manualVacated, onUseVacated, onAssignOt }){
  const nd = daysInMonth(state.yearBE, state.month);
  const entries = [];
  state.employees.forEach(emp=>{
    for(let d=1; d<=nd; d++){
      if((emp.days[d]||"").trim().toUpperCase() === "LA") entries.push({emp, day:d});
    }
  });

  const pickableCodes = state.shiftCodes.filter(c=>{
    const u = c.code.toUpperCase();
    return u !== "TH" && u !== "LA";
  });

  return (
    <Card noPrint
      title={
        <span className="inline-flex items-center gap-1.5">
          วันลา &amp; ข้อเสนอคนมาทำ OT แทน
          <Tooltip width="26rem">
            เมื่อพิมพ์ LA ในช่องวันของพนักงานคนใด ระบบจะเทียบกับรูปแบบกะที่วิเคราะห์ไว้ของคนนั้น หาว่าวันนั้นเดิมต้องทำกะอะไร แล้วเสนอชื่อคนมาทำ OT แทนให้อัตโนมัติ
            โดยพิจารณาจาก: อยู่ในกลุ่มกะเดียวกัน, อยู่ในวันหยุดของตัวเอง (WH) ก่อน, ไม่ได้เพิ่งลงกะดึกจนพักผ่อนไม่พอ, และหมุนเวียนคนที่ทำ OT น้อยที่สุดก่อน —
            ติ๊ก "ไม่แนะนำให้ทำ OT" ใต้ชื่อพนักงานในตารางเพื่อไม่ให้ระบบแนะนำคนนั้นเลย
          </Tooltip>
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {entries.length===0 && (
          <div className="text-[13.5px] font-sans text-ink-faint">ยังไม่มีวันลาที่ต้องหาคนแทนในเดือนนี้ — พิมพ์ LA ในช่องวันที่พนักงานลา</div>
        )}
        {entries.map(({emp, day}, i)=>{
          const overrideKey = `${emp.id}:${day}`;
          const key = patternKeyFor(emp);
          const hasPattern = !!(key && patternLib[key]);
          const patternBase = vacatedShiftFor(emp, day, state, patternLib);
          const manualBase = manualVacated[overrideKey];
          const vacatedBase = manualBase || patternBase;
          const dateLabel = `วันที่ ${day} (${weekdayLabel(state.yearBE, state.month, day)})`;

          if(!vacatedBase){
            const reason = hasPattern
              ? "พบรูปแบบของพนักงานคนนี้แล้ว แต่วันนี้ไม่มีข้อมูลเพียงพอในรอบที่วิเคราะห์ไว้"
              : "ยังไม่ได้วิเคราะห์รูปแบบของพนักงานคนนี้";
            return (
              <LeaveRowNoPattern key={i} emp={emp} day={day} dateLabel={dateLabel} reason={reason}
                pickableCodes={pickableCodes} onUseVacated={onUseVacated} />
            );
          }

          const empGroup = (emp.shiftGroup||"").trim() || null;
          const candidates = findOtCandidates(emp, day, vacatedBase, empGroup, state);
          const sourceNote = manualBase ? " (เลือกเอง)" : "";
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-[13.5px] font-sans">
              <span className="font-semibold text-ink min-w-[160px]">{emp.name || emp.empCode}</span>
              <span className="text-ink-soft">
                {dateLabel} — ลา แทนกะ <b className="text-ink">{vacatedBase}</b>{sourceNote} — เสนอ:{" "}
                {candidates.length===0 ? "ไม่พบผู้เหมาะสม" : candidates.map((c,ci)=>{
                  const statusLabel = c.todayWh ? "วันหยุดของตัวเอง" : (!c.todayBase ? "ว่าง" : `ทำ ${c.todayBase} อยู่แล้ว`);
                  const warn = c.prevOvernight ? " ⚠️ เพิ่งลงกะดึกเมื่อวันก่อน" : "";
                  return (
                    <button key={ci} title={statusLabel+warn} onClick={()=>onAssignOt(c.emp.id, day, vacatedBase)}
                      className="inline-flex items-center rounded-md bg-white ring-1 ring-inset ring-line px-2 py-1 mx-0.5 hover:ring-primary hover:text-primary transition-colors">
                      {c.emp.name || c.emp.empCode} (OT:{c.otCount})
                    </button>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
