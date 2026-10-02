import { IconAlert, IconCheck, IconClock } from "./ui/Icon";

function IssueRow({ issue }){
  const tone = issue.level === "blocking" ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/25" : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/25";
  const icon = issue.level === "blocking" ? <IconAlert size={14}/> : <IconClock size={14}/>;
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start gap-2">
        <span className={issue.level === "blocking" ? "text-danger mt-0.5" : "text-warning mt-0.5"}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">{issue.title}</div>
          <div className="mt-0.5 text-[12px] text-ink-soft leading-5">{issue.detail}</div>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleReview({ issues, onRecheck, onBackToRoster }){
  const blocking = issues.filter(x=>x.level === "blocking");
  const attention = issues.filter(x=>x.level !== "blocking");
  const ready = blocking.length === 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${ready ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/25" : "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/25"}`}>
        <div className="flex items-start gap-3">
          <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${ready ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"}`}>
            {ready ? <IconCheck size={17}/> : <IconAlert size={17}/>} 
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink">{ready ? "พร้อมส่งตรวจอนุมัติ" : `พบ ${blocking.length} จุดที่ต้องแก้ก่อนส่ง`}</div>
            <div className="mt-1 text-xs text-ink-soft leading-5">
              {ready ? "ไม่พบ Conflict ที่ระบบกำหนดให้เป็นข้อผิดพลาดร้ายแรง สามารถดำเนินการส่งอนุมัติได้" : "แก้รายการสีแดงในตารางก่อน แล้วกลับมากด Re-check อีกครั้ง"}
            </div>
          </div>
        </div>
      </div>

      {blocking.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink">ต้องแก้ก่อนส่ง</h3>
            <span className="text-xs font-semibold text-danger">{blocking.length} รายการ</span>
          </div>
          <div className="space-y-2">
            {blocking.slice(0, 20).map(issue=><IssueRow key={issue.id} issue={issue}/>)}
          </div>
          {blocking.length > 20 && <div className="mt-2 text-[11px] text-ink-faint">แสดง 20 รายการแรก จากทั้งหมด {blocking.length} รายการ</div>}
        </section>
      )}

      {attention.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink">ควรตรวจสอบ</h3>
            <span className="text-xs font-semibold text-warning">{attention.length} รายการ</span>
          </div>
          <div className="space-y-2">
            {attention.slice(0, 12).map(issue=><IssueRow key={issue.id} issue={issue}/>)}
          </div>
          {attention.length > 12 && <div className="mt-2 text-[11px] text-ink-faint">แสดง 12 รายการแรก จากทั้งหมด {attention.length} รายการ</div>}
        </section>
      )}

      {issues.length === 0 && (
        <div className="rounded-lg border border-line bg-canvas p-4 text-sm text-ink-soft">ยังไม่พบรายการที่ต้องตรวจสอบ</div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={onBackToRoster} className="flex-1 h-9 rounded-lg border border-line bg-white dark:bg-surface text-sm font-medium text-ink hover:bg-canvas transition-colors">
          กลับไปแก้ในตาราง
        </button>
        <button type="button" onClick={onRecheck} className="h-9 px-3 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity">
          Re-check
        </button>
      </div>
    </div>
  );
}
