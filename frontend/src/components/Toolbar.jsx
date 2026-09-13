import { THAI_MONTHS } from "../lib/logic";
import Button from "./ui/Button";
import Field, { inputClass } from "./ui/Field";
import Tooltip from "./ui/Tooltip";
import ThemeToggle from "./ui/ThemeToggle";

export default function Toolbar({
  state, statusMsg, analyzeMonthsBack, setAnalyzeMonthsBack,
  onDeptChange, onMonthChange, onYearChange, onAddEmployee,
  onSave, onDownloadPdf, onDownloadExcel, onPrint,
  onAnalyze, onGenerateNext, onMarkReviewed,
  dark, onToggleDark,
}){
  return (
    <div className="sticky top-0 z-30 w-full border-b border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-surface/90 backdrop-blur no-print">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        {/* Identity + navigation + primary save */}
        <div className="flex flex-wrap items-end gap-2.5 py-2.5">
          <div className="flex flex-col gap-1.5 min-w-[160px] flex-1">
            <span className="text-[11px] font-sans font-medium text-ink-faint">หน่วยงาน</span>
            <input
              type="text"
              value={state.department}
              onChange={e=>onDeptChange(e.target.value)}
              className="h-8 w-full rounded-md bg-transparent px-0 text-[15px] font-semibold text-ink font-sans
                         focus:outline-none focus:ring-0 border-b border-transparent hover:border-line focus:border-primary transition-colors"
            />
          </div>

          <Field label="เดือน">
            <select value={state.month} onChange={e=>onMonthChange(parseInt(e.target.value,10))} className={inputClass + " w-28 sm:w-36"}>
              {THAI_MONTHS.map((m,i)=>(<option key={i} value={i+1}>{m}</option>))}
            </select>
          </Field>
          <Field label="ปี (พ.ศ.)">
            <input type="number" value={state.yearBE} onChange={e=>onYearChange(parseInt(e.target.value,10))}
              className={inputClass + " w-20 sm:w-24"} />
          </Field>

          <div className="flex-1 min-w-[8px] hidden sm:block" />

          <ThemeToggle dark={dark} onToggle={onToggleDark} />
          <span className="text-[13px] font-sans text-ink-faint self-center px-1 min-w-0 sm:min-w-[80px] text-right hidden md:inline">{statusMsg}</span>
          <Button variant="primary" onClick={onSave}>บันทึก</Button>
        </div>

        {/* Secondary actions — horizontally scrollable on narrow screens
            instead of wrapping into a tall stack, so the toolbar keeps a
            predictable, thumb-swipeable height on mobile. */}
        <div className="flex items-center gap-2 pb-2.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
          <Button className="shrink-0" variant="secondary" size="sm" onClick={onAddEmployee}>+ เพิ่มพนักงาน</Button>
          <div className="w-px h-5 bg-line mx-1 shrink-0" />
          <Button className="shrink-0" variant="secondary" size="sm" onClick={onDownloadExcel}>⬇ Excel</Button>
          <Button className="shrink-0" variant="secondary" size="sm" onClick={onDownloadPdf}>⬇ PDF</Button>
          <Button className="shrink-0" variant="ghost" size="sm" onClick={onPrint}>พิมพ์</Button>

          <div className="w-px h-5 bg-line mx-1 shrink-0" />

          <Button className="shrink-0" variant="tinted" size="sm" onClick={onAnalyze}>🔍 วิเคราะห์รูปแบบ</Button>

          <div className="flex items-center gap-1.5 shrink-0">
            <input type="number" value={analyzeMonthsBack} min={1} max={6}
              onChange={e=>setAnalyzeMonthsBack(parseInt(e.target.value,10) || 3)}
              className={inputClass + " w-14 h-8 px-2 text-center"} />
            <Tooltip width="18rem">
              จำนวนเดือนย้อนหลังที่ใช้วิเคราะห์รูปแบบการหมุนกะ ระบบจะดึงข้อมูลเดือนก่อน ๆ ที่บันทึกไว้มาต่อกันแล้วหารอบการหมุนกะจริง — ยิ่งมีเดือนสะสมมากและ "สะอาด" (ไม่มีวันลา/สลับกะปนมาก) ผลจะยิ่งแม่นยำ
            </Tooltip>
          </div>

          <Button className="shrink-0" variant="tinted" size="sm" onClick={onGenerateNext}>➜ สร้างเดือนถัดไป</Button>
          <Button className="shrink-0" variant="ghost" size="sm" onClick={onMarkReviewed}>✓ ตรวจสอบแล้วทั้งหมด</Button>
        </div>
      </div>
    </div>
  );
}
