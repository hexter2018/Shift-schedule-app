import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import Button from "./ui/Button";
import { inputClass } from "./ui/Field";
import Tooltip from "./ui/Tooltip";
import { IconDownload, IconUpload, IconPrinter, IconSearch, IconArrowRight, IconCheck } from "./ui/Icon";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { THAI_MONTHS } from "../lib/logic";
import { listMyDepartments } from "../lib/departments";

export default function ScheduleSubToolbar({
  analyzeMonthsBack, setAnalyzeMonthsBack,
  onAddEmployee, onDownloadPdf, onDownloadExcel, onPrint, onImportExcel,
  onAnalyze, onGenerateNext, onMarkReviewed,
  onAddShift,
  departmentLabel, onDeptLabelChange,
  month, yearBE, onMonthChange, onYearChange,
  currentDepartmentSlug, onSelectDepartment,
}){
  const fileInputRef = useRef(null);
  const [departments, setDepartments] = useState(null);

  useEffect(() => {
    listMyDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  return (
    <div className="flex flex-col gap-2 border-b border-line bg-canvas px-3 py-2 no-print sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
          <span className="font-sans text-[11px] font-medium text-ink-faint">หน่วยงาน (ตัวกรอง)</span>
          <Select
            value={currentDepartmentSlug}
            onValueChange={(slug) => {
              const dept = departments?.find((d) => d.slug === slug);
              if (dept && dept.slug !== currentDepartmentSlug) onSelectDepartment?.(dept);
            }}
            disabled={!departments}
          >
            <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="เลือกหน่วยงาน" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(departments || []).map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-sans text-[11px] font-medium text-ink-faint">เดือน (ตัวกรองช่วงเวลา)</span>
          <Select value={String(month)} onValueChange={(v) => onMonthChange(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {THAI_MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-sans text-[11px] font-medium text-ink-faint">ปี (พ.ศ.)</span>
          <input
            type="number" value={yearBE} onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
            className={inputClass + " h-8 w-20"}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[160px] max-w-[320px]">
          <span className="font-sans text-[11px] font-medium text-ink-faint">ชื่อหน่วยงาน (แสดงในตาราง)</span>
          <input
            type="text" value={departmentLabel} onChange={(e) => onDeptLabelChange(e.target.value)}
            className={inputClass + " h-8"}
          />
        </div>

        <div className="ml-auto" />

        <Button className="shrink-0" variant="primary" size="sm" onClick={onAddShift}>
          <Plus data-icon="inline-start" className="size-3.5" />
          เพิ่ม/แก้ไขกะ
        </Button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Button className="shrink-0" variant="secondary" size="sm" onClick={onAddEmployee}><IconPlus />เพิ่มพนักงาน</Button>
        <div className="w-px h-5 bg-line mx-1 shrink-0" />
        <Button className="shrink-0" variant="secondary" size="sm" onClick={onDownloadExcel}><IconDownload />Excel</Button>
        <Button className="shrink-0" variant="secondary" size="sm" onClick={onDownloadPdf}><IconDownload />PDF</Button>
        <Button className="shrink-0" variant="ghost" size="sm" onClick={onPrint}><IconPrinter />พิมพ์</Button>
        <div className="inline-flex items-center shrink-0">
          <Button variant="ghost" size="sm" onClick={()=>fileInputRef.current?.click()}><IconUpload />นำเข้า Excel</Button>
          <Tooltip width="20rem">
            กู้คืนตารางกะทั้งเดือนจากไฟล์ Excel ที่ระบบเคยสร้างไว้ — ใช้กรณีฐานข้อมูลหาย ทับข้อมูลปัจจุบันทั้งหมด รหัสกะที่ไม่เคยมีจะยังไม่มีสี/เวลากำหนด ต้องตั้งเพิ่มเองทีหลัง
          </Tooltip>
          <input
            ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
            onChange={e=>{
              const file = e.target.files && e.target.files[0];
              e.target.value = ""; // allow re-selecting the same file next time
              if(file) onImportExcel(file);
            }}
          />
        </div>

        <div className="w-px h-5 bg-line mx-1 shrink-0" />

        <Button className="shrink-0" variant="tinted" size="sm" onClick={onAnalyze}><IconSearch />วิเคราะห์รูปแบบ</Button>

        <div className="flex items-center gap-1.5 shrink-0">
          <input type="number" value={analyzeMonthsBack} min={1} max={6}
            onChange={e=>setAnalyzeMonthsBack(parseInt(e.target.value,10) || 3)}
            className={inputClass + " w-14 h-8 px-2 text-center"} />
          <Tooltip width="18rem">
            จำนวนเดือนย้อนหลังที่ใช้วิเคราะห์รูปแบบการหมุนกะ ระบบจะดึงข้อมูลเดือนก่อน ๆ ที่บันทึกไว้มาต่อกันแล้วหารอบการหมุนกะจริง — ยิ่งมีเดือนสะสมมากและ "สะอาด" (ไม่มีวันลา/สลับกะปนมาก) ผลจะยิ่งแม่นยำ
          </Tooltip>
        </div>

        <Button className="shrink-0" variant="tinted" size="sm" onClick={onGenerateNext}><IconArrowRight />สร้างเดือนถัดไป</Button>
        <Button className="shrink-0" variant="ghost" size="sm" onClick={onMarkReviewed}><IconCheck />ตรวจสอบแล้วทั้งหมด</Button>
      </div>
    </div>
  );
}

// Local alias — the existing hand-rolled Icon set doesn't export a plain
// "plus" (IconAdd covers the add-employee case with different styling),
// so reuse lucide's Plus for this one button to match the sub-toolbar's
// existing icon sizing via currentColor/inherited font-size.
function IconPlus(props){
  return <Plus className="size-3.5" {...props} />;
}
