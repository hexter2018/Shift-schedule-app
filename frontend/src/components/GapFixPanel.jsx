import Card from "./ui/Card";
import Button from "./ui/Button";
import Tooltip from "./ui/Tooltip";

export default function GapFixPanel({ onFixGaps, gapFixResult, onAssignOtFromGap }){
  const { log } = gapFixResult || {};
  return (
    <Card noPrint
      title={
        <span className="inline-flex items-center gap-1.5">
          ปรับกะวันที่ครบไม่ครบ 3 กะ (MM6 / EE6)
          <Tooltip width="26rem">
            ใช้กับพนักงานที่วนกะแบบหมุนเวียน (M6 → E2 → N10) ระบุ "กลุ่มกะ" ใต้ชื่อพนักงานแต่ละคนให้ตรงกัน (เช่น SES, SOE)
            ถ้าวันไหนขาดไปหนึ่งกะ — มีแค่ M6, N10 หรือมีแค่ E2, N10 — ระบบปรับให้เป็น MM6/EE6 อัตโนมัติ
            แต่ถ้ามีแค่ M6, E2 (ขาดกะ N10) ระบบจะไม่ปรับให้เอง เพราะเป็นกะดึกที่ต้องพิจารณาคนเป็นพิเศษ — จะขึ้นเตือนพร้อมเสนอชื่อคนทำ OT แทน
          </Tooltip>
        </span>
      }
      action={<Button variant="tinted" size="sm" onClick={onFixGaps}>🔧 ตรวจสอบและปรับกะที่ขาด</Button>}
    >
      <div className="flex flex-col gap-2">
        {log && log.length===0 && (
          <div className="text-[13.5px] font-sans text-ink-faint">ไม่พบวันที่ขาดกะเดียวชัดเจนในกลุ่มที่ตั้งไว้ (ทุกวันมีครบ 3 กะ หรือขาดมากกว่า 1 กะพร้อมกัน ซึ่งเครื่องมือนี้ยังไม่รองรับ)</div>
        )}
        {log && log.map((item, i)=>{
          if(item.type === "ot-warning"){
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-[13.5px] font-sans">
                <span className="font-semibold text-ink min-w-[160px]">{item.group} — {item.dateLabel}</span>
                <span className="text-ink-soft">
                  ขาดกะ <b className="text-ink">N10</b> — ต้องหาคนทำ OT แทน — เสนอ:{" "}
                  {item.candidates.length===0 ? "ไม่พบผู้เหมาะสม" : item.candidates.map((c,ci)=>{
                    const statusLabel = c.todayWh ? "วันหยุดของตัวเอง" : (!c.todayBase ? "ว่าง" : `ทำ ${c.todayBase} อยู่แล้ว`);
                    const warn = c.prevOvernight ? " ⚠️ เพิ่งลงกะดึกเมื่อวันก่อน" : "";
                    return (
                      <button key={ci} title={statusLabel+warn} onClick={()=>onAssignOtFromGap(c.emp.id, item.day, "N10")}
                        className="inline-flex items-center rounded-md bg-white ring-1 ring-inset ring-line px-2 py-1 mx-0.5 hover:ring-primary hover:text-primary transition-colors">
                        {c.emp.name||c.emp.empCode} (OT:{c.otCount})
                      </button>
                    );
                  })}
                </span>
              </div>
            );
          }
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-[13.5px] font-sans">
              <span className="font-semibold text-ink min-w-[160px]">{item.group} — {item.dateLabel}</span>
              <span className="text-ink-soft">ขาดกะ <b className="text-ink">{item.missingCode}</b> — {item.result}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
