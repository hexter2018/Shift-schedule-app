import Card from "./ui/Card";
import Button from "./ui/Button";
import Tooltip from "./ui/Tooltip";

export default function ShiftCodeLegend({ state, onChangeCode, onRemoveCode, onAddCode }){
  return (
    <Card noPrint
      title={
        <span className="inline-flex items-center gap-1.5">
          รหัสกะ
          <Tooltip width="26rem">
            พิมพ์รหัสเต็มได้เลย เช่น N10 หรือเติม WH/TH/OT ต่อท้ายเพื่อระบุวันหยุดประจำสัปดาห์/วันหยุดนักขัตฤกษ์/บังคับทำโอที
            (เช่น N10WH, N10TH, N10OT) หรือพิมพ์ LA สำหรับวันลาพักร้อน — หรือพิมพ์รหัสย่อแล้วออกจากช่อง (Tab/Enter/คลิกที่อื่น)
            ระบบจะขยายให้อัตโนมัติ: 6→M6, 6W→M6WH, 6T→M6TH, 6O→M6OT · 8→M8, 8W→M8WH, 8T→M8TH, 8O→M8OT ·
            MM→MM6, MT→MM6TH, MO→MM6OT · 2→E2, 2W→E2WH, 2T→E2TH, 2O→E2OT · EE→EE6, ET→EE6TH, EO→EE6OT ·
            10→N10, 10W→N10WH, 10T→N10TH, 10O→N10OT · L→LA
          </Tooltip>
        </span>
      }
      action={<Button variant="secondary" size="sm" onClick={onAddCode}>+ เพิ่มรหัสกะ</Button>}
    >
      <div className="flex flex-wrap gap-2">
        {state.shiftCodes.map((c, i)=>(
          <div key={i} className="group flex items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-2.5 py-1.5">
            <input type="color" value={c.color} onChange={e=>onChangeCode(i, {...c, color:e.target.value})}
              className="w-5 h-5 rounded-full border-0 p-0 cursor-pointer" style={{background:c.color}} />
            <input type="text" defaultValue={c.code} maxLength={6} placeholder="รหัส"
              onBlur={e=>onChangeCode(i, {...c, code:e.target.value.trim().toUpperCase()})}
              className="w-16 h-7 rounded-md bg-white dark:bg-surface px-2 text-[13.5px] font-sans font-medium text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="time" defaultValue={c.start} onChange={e=>onChangeCode(i, {...c, start:e.target.value})}
              className="h-7 rounded-md bg-white dark:bg-surface px-1.5 text-[12.5px] font-sans text-ink-soft ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
            <span className="text-ink-faint text-xs">–</span>
            <input type="time" defaultValue={c.end} onChange={e=>onChangeCode(i, {...c, end:e.target.value})}
              className="h-7 rounded-md bg-white dark:bg-surface px-1.5 text-[12.5px] font-sans text-ink-soft ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={()=>onRemoveCode(i)} title="ลบรหัสนี้"
              className="text-ink-faint hover:text-danger text-base leading-none opacity-0 group-hover:opacity-100 transition-opacity px-0.5">×</button>
          </div>
        ))}
      </div>
    </Card>
  );
}
