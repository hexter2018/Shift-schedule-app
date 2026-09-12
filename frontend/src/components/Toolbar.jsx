import { THAI_MONTHS } from "../lib/logic";
import Button from "./ui/Button";
import Field, { inputClass } from "./ui/Field";
import Tooltip from "./ui/Tooltip";

export default function Toolbar({
  state, statusMsg, analyzeMonthsBack, setAnalyzeMonthsBack,
  onDeptChange, onMonthChange, onYearChange, onAddEmployee,
  onSave, onDownloadPdf, onDownloadExcel, onPrint,
  onAnalyze, onGenerateNext, onMarkReviewed,
}){
  return (
    <div className="sticky top-0 z-30 w-full border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70 no-print">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Identity + navigation + primary save */}
        <div className="flex flex-wrap items-end gap-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-[240px] flex-1">
            <span
              aria-hidden="true"
              className="grid place-items-center h-9 w-9 shrink-0 rounded-lg bg-primary text-white text-[15px] font-semibold font-sans shadow-sm shadow-primary/25"
            >
              ตว
            </span>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-[10.5px] font-sans font-medium uppercase tracking-wider text-ink-faint">หน่วยงาน</span>
              <input
                type="text"
                value={state.department}
                onChange={e=>onDeptChange(e.target.value)}
                placeholder="ระบุชื่อหน่วยงาน"
                className="h-6 w-full rounded-md bg-transparent px-0 text-[15px] font-semibold text-ink font-sans leading-none
                           focus:outline-none focus:ring-0 border-b border-transparent hover:border-line focus:border-primary transition-colors"
              />
            </div>
          </div>

          <Field label="เดือน">
            <select value={state.month} onChange={e=>onMonthChange(parseInt(e.target.value,10))} className={inputClass + " w-36"}>
              {THAI_MONTHS.map((m,i)=>(<option key={i} value={i+1}>{m}</option>))}
            </select>
          </Field>
          <Field label="ปี (พ.ศ.)">
            <input type="number" value={state.yearBE} onChange={e=>onYearChange(parseInt(e.target.value,10))}
              className={inputClass + " w-24"} />
          </Field>

          <div className="flex-1 min-w-[8px]" />

          <span className="text-[13px] font-sans text-ink-faint self-center px-1 min-w-[80px] text-right">{statusMsg}</span>
          <Button variant="primary" onClick={onSave}>บันทึก</Button>
        </div>

        {/* Secondary actions */}
        <div className="flex flex-wrap items-center gap-1.5 pb-2.5">
          <Button variant="secondary" size="sm" onClick={onAddEmployee}>+ เพิ่มพนักงาน</Button>
          <div className="w-px h-5 bg-line mx-1" />
          <Button variant="secondary" size="sm" onClick={onDownloadExcel}>⬇ Excel</Button>
          <Button variant="secondary" size="sm" onClick={onDownloadPdf}>⬇ PDF</Button>
          <Button variant="ghost" size="sm" onClick={onPrint}>พิมพ์</Button>

          <div className="w-px h-5 bg-line mx-1" />

          <Button variant="tinted" size="sm" onClick={onAnalyze}>🔍 วิเคราะห์รูปแบบ</Button>

          <div className="flex items-center gap-1.5">
            <input type="number" value={analyzeMonthsBack} min={1} max={6}
              onChange={e=>setAnalyzeMonthsBack(parseInt(e.target.value,10) || 3)}
              className={inputClass + " w-14 h-8 px-2 text-center"} />
            <Tooltip width="18rem">
              จำนวนเดือนย้อนหลังที่ใช้วิเคราะห์รูปแบบการหมุนกะ ระบบจะดึงข้อมูลเดือนก่อน ๆ ที่บันทึกไว้มาต่อกันแล้วหารอบการหมุนกะจริง — ยิ่งมีเดือนสะสมมากและ "สะอาด" (ไม่มีวันลา/สลับกะปนมาก) ผลจะยิ่งแม่นยำ
            </Tooltip>
          </div>

          <Button variant="tinted" size="sm" onClick={onGenerateNext}>➜ สร้างเดือนถัดไป</Button>
          <Button variant="ghost" size="sm" onClick={onMarkReviewed}>✓ ตรวจสอบแล้วทั้งหมด</Button>
        </div>
      </div>
    </div>
  );
}
