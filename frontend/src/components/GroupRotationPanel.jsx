import { THAI_MONTHS, THAI_WEEKDAYS, patternKeyFor, rotationPairForGroup } from "../lib/logic";
import Card from "./ui/Card";
import Button from "./ui/Button";
import Tooltip from "./ui/Tooltip";
import { inputClass } from "./ui/Field";

const selCls = inputClass + " h-7 w-auto px-2 text-[13px]";
const numCls = inputClass + " h-7 px-2 text-[13px]";

export default function GroupRotationPanel({
  state, groupRotations, onAddGroup, onRenameGroup, onUpdateGroup,
  onRemoveGroup, onToggleMember, onQuickAdd, onApplyRotation,
}){
  const keys = Object.keys(groupRotations).sort();
  const trackable = state.employees.filter(e=>patternKeyFor(e));
  const shiftGroupsPresent = [...new Set(trackable.map(e=>(e.shiftGroup||"").trim()).filter(Boolean))].sort();
  const empLabel = (emp)=> (emp.name || emp.empCode || "") + (emp.empCode ? ` (${emp.empCode})` : "");

  return (
    <Card noPrint
      title={
        <span className="inline-flex items-center gap-1.5">
          วันหยุดประจำสัปดาห์หมุนเวียนตามกลุ่มกะ
          <Tooltip width="28rem">
            ตั้ง "ชุดวันหยุดหมุนเวียน" ได้กี่ชุดก็ได้ เลือกสมาชิกทีละคนพร้อมตั้งวันเริ่มหยุด (คู่วันหยุด 2 วันติดกัน) อ้างอิงเดือน/ปีใดเดือนหนึ่ง —
            ระบบจะเลื่อนคู่วันหยุดไปทีละ N วันในสัปดาห์ให้เองทุกเดือนถัดไป ต่อให้พนักงานถูกสร้างขึ้นใหม่ก็ยังจำสมาชิกได้ถูกคน (อิงจากรหัสพนักงาน) —
            กด "ใช้วันหยุดหมุนเวียนกับเดือนนี้" เพื่อเติม WH ต่อท้ายรหัสกะของสมาชิกในวันที่ตรงกับคู่วันหยุด (ข้ามวันหยุดนักขัตฤกษ์/วันลา/วันที่บังคับ OT ไว้แล้ว)
          </Tooltip>
        </span>
      }
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onAddGroup}>+ เพิ่มกลุ่ม</Button>
          <Button variant="tinted" size="sm" onClick={onApplyRotation} title="เติม WH ให้ตรงกับวันหยุดหมุนเวียนของเดือนที่กำลังดูอยู่">
            🔁 ใช้กับเดือนนี้
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {keys.length===0 && (
          <div className="text-[13.5px] font-sans text-ink-faint">ยังไม่มีชุดวันหยุดหมุนเวียนที่ตั้งไว้ — กด "+ เพิ่มกลุ่ม"</div>
        )}
        {keys.map(key=>{
          const cfg = groupRotations[key];
          const memberKeys = cfg.memberKeys || [];
          const pair = rotationPairForGroup(key, groupRotations, state);
          const previewLabel = pair ? `${THAI_WEEKDAYS[pair[0]]} + ${THAI_WEEKDAYS[pair[1]]}` : "-";
          const names = memberKeys.map(k=>{
            const e = trackable.find(x=>patternKeyFor(x)===k);
            return e ? empLabel(e) : k;
          });
          return (
            <div key={key} className="rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-sans">
                <input type="text" defaultValue={key} onBlur={e=>onRenameGroup(key, e.target.value)}
                  className={numCls + " w-20 font-semibold"} />
                <span className="text-ink-soft">เริ่มหยุด</span>
                <select value={cfg.anchorStartDay} onChange={e=>onUpdateGroup(key, {anchorStartDay: parseInt(e.target.value,10)})} className={selCls}>
                  {THAI_WEEKDAYS.map((wd,i)=>(<option key={i} value={i}>{wd}</option>))}
                </select>
                <span className="text-ink-soft">อ้างอิงเดือน</span>
                <select value={cfg.anchorMonth} onChange={e=>onUpdateGroup(key, {anchorMonth: parseInt(e.target.value,10)})} className={selCls}>
                  {THAI_MONTHS.map((m,i)=>(<option key={i} value={i+1}>{m}</option>))}
                </select>
                <input type="number" defaultValue={cfg.anchorYearBE} title="ปี พ.ศ. อ้างอิง"
                  onBlur={e=>onUpdateGroup(key, {anchorYearBE: parseInt(e.target.value,10) || cfg.anchorYearBE})}
                  className={numCls + " w-16"} />
                <span className="text-ink-soft">เลื่อนทีละ</span>
                <input type="number" defaultValue={cfg.stepDays||2} min={1} max={6}
                  onBlur={e=>onUpdateGroup(key, {stepDays: Math.max(1, Math.min(6, parseInt(e.target.value,10) || 2))})}
                  className={numCls + " w-12"} />
                <span className="text-ink-soft">วัน</span>
                <span className="ml-auto rounded-full bg-primary-soft text-primary px-2 py-0.5 text-[12px] font-medium">
                  เดือนนี้: หยุด {previewLabel}
                </span>
                <button onClick={()=>onRemoveGroup(key)} title="ลบชุดนี้"
                  className="text-ink-faint hover:text-danger text-base leading-none px-1">×</button>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] font-sans text-ink-soft">
                  {`สมาชิก (${memberKeys.length} คน)`}{names.length ? " — "+names.join(", ") : ""}
                </summary>
                <div className="pt-2">
                  {shiftGroupsPresent.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 text-[13px] font-sans text-ink-soft">
                      <span>เพิ่มทุกคนจากกลุ่มกะ:</span>
                      <select value="" onChange={e=>{ if(e.target.value) onQuickAdd(key, e.target.value); }} className={selCls}>
                        <option value="">— เลือก —</option>
                        {shiftGroupsPresent.map(g=>(<option key={g} value={g}>{g}</option>))}
                      </select>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {trackable.map(emp=>{
                      const empKey = patternKeyFor(emp);
                      const checked = memberKeys.includes(empKey);
                      return (
                        <label key={emp.id} className="flex items-center gap-1.5 text-[13px] font-sans text-ink-soft whitespace-nowrap">
                          <input type="checkbox" checked={checked} onChange={e=>onToggleMember(key, empKey, e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-primary" />
                          {empLabel(emp)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
