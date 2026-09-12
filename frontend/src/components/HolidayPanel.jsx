import { useState } from "react";
import Card from "./ui/Card";
import Button from "./ui/Button";
import Field, { inputClass } from "./ui/Field";
import Tooltip from "./ui/Tooltip";

export default function HolidayPanel({ holidays, onAddHoliday, onRenameHoliday, onRemoveHoliday, onLoadDefaults, onApplyHolidays }){
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [recurring, setRecurring] = useState(true);

  const sorted = [...holidays].sort((a,b)=> (a.month-b.month) || (a.day-b.day) || ((a.year||0)-(b.year||0)));

  const submit = ()=>{
    if(!date || !name.trim()) return;
    onAddHoliday(date, name.trim(), recurring);
    setName("");
  };

  return (
    <Card noPrint
      title={
        <span className="inline-flex items-center gap-1.5">
          วันหยุดนักขัตฤกษ์ / วันหยุดประจำปี
          <Tooltip width="24rem">
            วันที่ตั้งไว้จะไฮไลต์คอลัมน์นั้นในตาราง ทั้งบนจอ พิมพ์/PDF และ Excel — และแปลงรหัสกะของทุกคนที่ทำงานวันนั้นให้ลงท้าย TH ให้อัตโนมัติ (เช่น M8 → M8TH)
            หากวันหยุดนั้นตรงกับวันหยุดประจำสัปดาห์ของใคร (…WH) จะเปลี่ยนเป็น TH แทนและหาวันชดเชย WH ให้อีก 1 วันถัดไป —
            วันหยุดตามจันทรคติ (มาฆบูชา วิสาขบูชา อาสาฬหบูชา ฯลฯ) ต้องเพิ่มเองรายปีและไม่ติ๊กตรงวันเดิมทุกปี
          </Tooltip>
        </span>
      }
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="วันที่">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className={inputClass + " w-40"} />
        </Field>
        <Field label="ชื่อวันหยุด">
          <input type="text" value={name} placeholder="เช่น วันสงกรานต์"
            onChange={e=>setName(e.target.value)} className={inputClass + " w-48"} />
        </Field>
        <label className="flex items-center gap-1.5 h-9 text-[13.5px] font-sans text-ink-soft">
          <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)}
            className="w-4 h-4 rounded accent-primary" />
          ตรงวันเดิมทุกปี
        </label>
        <Button variant="secondary" size="sm" onClick={submit}>+ เพิ่มวันหยุด</Button>
        <Button variant="ghost" size="sm" onClick={onLoadDefaults}>โหลดวันหยุดราชการทั่วไป</Button>
        <Button variant="tinted" size="sm" onClick={onApplyHolidays} title="ปรับกะของเดือนนี้ให้ตรงกับวันหยุดที่ตั้งไว้ทั้งหมดอีกครั้ง">
          🔄 ปรับกะให้ตรงกับวันหยุด
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {sorted.length===0 && (
          <div className="text-[13.5px] font-sans text-ink-faint">ยังไม่มีวันหยุดที่ตั้งไว้ — เพิ่มเองหรือกด "โหลดวันหยุดราชการทั่วไป"</div>
        )}
        {sorted.map(h=>{
          const dateLabel = `${String(h.day).padStart(2,"0")}/${String(h.month).padStart(2,"0")}${h.year ? "/"+h.year : " (ทุกปี)"}`;
          return (
            <div key={h.id} className="group flex items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-2.5 py-1.5">
              <span className="text-[13px] font-sans text-ink-soft min-w-[80px]">{dateLabel}</span>
              <input type="text" defaultValue={h.name} onBlur={e=>onRenameHoliday(h.id, e.target.value)}
                className="w-36 h-7 rounded-md bg-white px-2 text-[13.5px] font-sans text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
              <button onClick={()=>onRemoveHoliday(h.id)} title="ลบวันหยุดนี้"
                className="text-ink-faint hover:text-danger text-base leading-none opacity-0 group-hover:opacity-100 transition-opacity px-0.5">×</button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
