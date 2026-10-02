import * as Dialog from "@radix-ui/react-dialog";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconUsers } from "./ui/Icon";
import { THAI_MONTHS, weekdayLabel, isHoliday, styleForCell } from "../lib/logic";

function StatusPill({ type, children }){
  const map = {
    normal: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    predicted: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    leave: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    conflict: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${map[type] || map.normal}`}>{children}</span>;
}

export default function ShiftDetailDrawer({ open, onOpenChange, detail, state, holidays }){
  if(!detail) return null;

  const { emp, day } = detail;
  const value = emp?.days?.[day] || "";
  const base = value.replace(/(OT|TH|WH)$/i, "").toUpperCase();
  const predicted = !!emp?.autoFlags?.[day];
  const holiday = isHoliday(state.yearBE, state.month, day, holidays);
  const code = state.shiftCodes.find(c=>String(c.code).toUpperCase() === base);
  const isLeave = base === "LA";
  const isOff = base === "O";
  const known = !!code || isLeave || isOff || !value;
  const isInvalid = !!value && !known;
  const modifiers = [];
  if(/OT$/i.test(value)) modifiers.push("OT");
  if(/TH$/i.test(value)) modifiers.push("TH");
  if(/WH$/i.test(value)) modifiers.push("WH");

  let status = "normal";
  let statusLabel = "ปกติ";
  let statusIcon = <IconCheck size={13}/>;
  let reason = "ยังไม่พบประเด็นที่ระบบต้องตรวจสอบ";
  if(isInvalid){
    status = "conflict";
    statusLabel = "ต้องตรวจสอบ";
    statusIcon = <IconAlert size={13}/>;
    reason = `ไม่พบรหัสกะ “${base}” ใน Master รหัสกะของแผนก`;
  }else if(isLeave){
    status = "leave";
    statusLabel = "ลา";
    statusIcon = <span aria-hidden="true">✈</span>;
    reason = "ช่องนี้ถูกกำหนดเป็นวันลา";
  }else if(predicted){
    status = "predicted";
    statusLabel = "คาดการณ์";
    statusIcon = <span aria-hidden="true">●</span>;
    reason = "ระบบคาดการณ์จากรูปแบบกะที่มีอยู่ และยังสามารถตรวจสอบ/แก้ไขได้";
  }

  const dateLabel = `${day} ${THAI_MONTHS[state.month-1]} ${state.yearBE}`;
  const timeLabel = code?.start && code?.end ? `${code.start} – ${code.end}` : (isLeave ? "ลาพักร้อน" : isOff ? "หยุด" : "ไม่ได้กำหนดเวลา");
  const style = code ? styleForCell(value, state.shiftCodes, state.otColor, state.thColor) : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40 data-[state=open]:animate-fade-in no-print" />
        <Dialog.Content
          className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[430px] bg-white dark:bg-surface border-l border-line p-5 sm:p-6 overflow-y-auto no-print data-[state=open]:animate-fade-in"
          aria-describedby={undefined}
        >
          <Dialog.Close asChild>
            <button type="button" aria-label="ปิด" className="absolute right-4 top-4 z-10 h-8 w-8 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-canvas transition-colors">✕</button>
          </Dialog.Close>

          <Dialog.Title className="pr-10 text-lg font-semibold text-ink">รายละเอียดกะ</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-soft">ตรวจสอบข้อมูลของช่องนี้ก่อนแก้ไขตาราง</Dialog.Description>

          <div className="mt-5 rounded-xl border border-line bg-canvas/60 dark:bg-[#151a24] p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0"><IconUsers size={18}/></div>
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">{emp?.name || emp?.empCode || "ไม่ระบุชื่อ"}</div>
                <div className="text-xs text-ink-soft mt-0.5">รหัสพนักงาน {emp?.empCode || "—"}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl border border-line p-3">
              <div className="text-[11px] text-ink-faint flex items-center gap-1.5"><IconCalendar size={12}/> วันที่</div>
              <div className="mt-1 text-sm font-semibold text-ink">{dateLabel}</div>
              <div className="text-xs text-ink-soft mt-0.5">{weekdayLabel(state.yearBE, state.month, day)}</div>
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="text-[11px] text-ink-faint flex items-center gap-1.5"><IconClock size={12}/> เวลา</div>
              <div className="mt-1 text-sm font-semibold text-ink">{timeLabel}</div>
              <div className="text-xs text-ink-soft mt-0.5">{code ? `รหัส ${code.code}` : "—"}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line p-4">
            <div className="text-xs font-semibold text-ink-soft mb-2">สถานะ</div>
            <StatusPill type={status}>{statusIcon}{statusLabel}</StatusPill>
            <div className="mt-3 text-sm text-ink leading-6">{reason}</div>
          </div>

          <div className="mt-4 rounded-xl border border-line p-4">
            <div className="text-xs font-semibold text-ink-soft mb-3">รายละเอียดกะ</div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4"><span className="text-ink-soft">รหัสที่กรอก</span><b className="text-ink">{value || "ยังไม่ได้ลงกะ"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-ink-soft">รหัสฐาน</span><b className="text-ink">{base || "—"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-ink-soft">Modifier</span><b className="text-ink">{modifiers.length ? modifiers.join(", ") : "ไม่มี"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-ink-soft">วันหยุดนักขัตฤกษ์</span><b className="text-ink">{holiday ? holiday.name : "ไม่ใช่"}</b></div>
            </div>
            {style && <div className="mt-3 h-8 rounded-md border border-line flex items-center justify-center text-xs font-semibold" style={{background:style.bg,color:style.fg}}>ตัวอย่างสีของกะ {code.code}</div>}
          </div>

          {predicted && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
              <b>ระบบคาดการณ์</b>
              <div className="mt-1 leading-5">กะนี้มาจาก pattern/ข้อมูลที่ระบบวิเคราะห์ไว้ ผู้จัดการสามารถตรวจสอบแล้วแก้เป็นรหัสอื่นได้ทันทีที่ตาราง</div>
            </div>
          )}

          {isInvalid && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
              <div className="flex gap-2"><IconAlert size={16}/><div><b>ควรแก้ก่อนส่งอนุมัติ</b><div className="mt-1 leading-5">ตรวจสอบ Master รหัสกะ หรือแก้รหัสในช่องนี้ให้ตรงกับรหัสที่ระบบรองรับ</div></div></div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="h-9 px-3 rounded-lg border border-line bg-white dark:bg-surface text-sm font-medium text-ink hover:bg-canvas transition-colors">กลับไปที่ตาราง</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
