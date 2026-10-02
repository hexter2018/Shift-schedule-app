import { useRef } from "react";
import Button from "./ui/Button";
import { inputClass } from "./ui/Field";
import Tooltip from "./ui/Tooltip";
import { IconPlus, IconDownload, IconUpload, IconPrinter, IconSearch, IconArrowRight, IconCheck } from "./ui/Icon";

export default function ScheduleSubToolbar({
  analyzeMonthsBack, setAnalyzeMonthsBack,
  onAddEmployee, onDownloadPdf, onDownloadExcel, onPrint, onImportExcel,
  onAnalyze, onGenerateNext, onMarkReviewed,
}){
  const fileInputRef = useRef(null);
  return (
    <div className="flex items-center gap-2 py-2 px-3 sm:px-6 lg:px-8 overflow-x-auto no-scrollbar border-b border-line bg-canvas no-print">
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
  );
}
