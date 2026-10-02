import { THAI_MONTHS, daysInMonth, isWeekend, isHoliday, parseCellValue } from "../lib/logic";
import Card from "./ui/Card";
import Button from "./ui/Button";
import { IconArrowRight, IconAlert, IconCheck, IconClock, IconUsers, IconCalendar } from "./ui/Icon";

function KpiCard({ icon, label, value, helper, tone = "neutral" }) {
  const tones = {
    neutral: "bg-canvas text-ink-soft",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    primary: "bg-primary-soft text-primary",
  };
  return (
    <div className="rounded-xl border border-line bg-white dark:bg-surface p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tones[tone]}`}>
          {icon}
        </div>
        <span className="text-[16px] font-sans text-ink-faint">เดือนนี้</span>
      </div>
      <div className="mt-3 text-[34px] leading-none font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-1 text-[18px] font-medium text-ink-soft">{label}</div>
      {helper && <div className="mt-1 text-[16px] text-ink-faint">{helper}</div>}
    </div>
  );
}

function coverageTone(percent) {
  if (percent >= 95) return "success";
  if (percent >= 85) return "warning";
  return "danger";
}

export default function DashboardOverview({ state, holidays, approvalStatus, onOpenRoster, onOpenApproval, onFocusIssue }) {
  const nd = daysInMonth(state.yearBE, state.month);
  const employees = state.employees || [];
  const totalSlots = employees.length * nd;
  let assigned = 0;
  let unassigned = 0;
  let predicted = 0;
  let leave = 0;
  let invalid = 0;
  const shiftCounts = {};
  const attention = [];

  employees.forEach((emp) => {
    for (let d = 1; d <= nd; d++) {
      const raw = (emp.days?.[d] || "").trim().toUpperCase();
      const { base } = parseCellValue(raw);
      if (!raw) {
        unassigned++;
      } else {
        assigned++;
        shiftCounts[base] = (shiftCounts[base] || 0) + 1;
        if (base === "LA") leave++;
        if (!state.shiftCodes.some((code) => code.code.toUpperCase() === base) && base !== "WH") invalid++;
      }
      if (emp.autoFlags?.[d]) predicted++;
    }
  });

  const coverage = totalSlots ? Math.round((assigned / totalSlots) * 100) : 100;
  const approvalLabel = {
    pending_section: "รอผู้จัดการแผนก",
    pending_division: "รอผู้จัดการส่วน",
    approved: "อนุมัติแล้ว",
    rejected: "ต้องแก้ไข",
  }[approvalStatus?.status] || "ยังไม่ส่งอนุมัติ";

  if (unassigned > 0) attention.push({ tone: "warning", icon: <IconAlert size={17} />, title: `${unassigned} ช่องยังไม่มีการจัดกะ`, detail: "ตรวจสอบก่อนส่งอนุมัติ" });
  if (predicted > 0) attention.push({ tone: "warning", icon: <IconClock size={17} />, title: `${predicted} ช่องเป็นกะที่ระบบคาดการณ์`, detail: "ควรตรวจสอบจุดสีส้มก่อนยืนยัน" });
  if (invalid > 0) attention.push({ tone: "danger", icon: <IconAlert size={17} />, title: `${invalid} ช่องมีรหัสกะที่ไม่อยู่ใน Master`, detail: "แก้ไขรหัสกะให้ตรงกับการตั้งค่า" });
  if (approvalStatus?.status === "pending_section" || approvalStatus?.status === "pending_division") {
    attention.push({ tone: "primary", icon: <IconClock size={17} />, title: "ตารางอยู่ระหว่างการอนุมัติ", detail: approvalLabel });
  }

  const blockingItems = [];
  const attentionItems = [];
  employees.forEach((emp) => {
    for (let d = 1; d <= nd; d++) {
      const raw = (emp.days?.[d] || "").trim().toUpperCase();
      if (!raw) continue;
      const base = raw.replace(/(OT|TH|WH)$/i, "");
      const employeeLabel = emp.name || emp.empCode || "ไม่ระบุพนักงาน";
      if (base !== "LA" && base !== "O" && !state.shiftCodes.some((code) => code.code.toUpperCase() === base)) {
        blockingItems.push({ id: `invalid-${emp.id}-${d}`, title: employeeLabel, detail: `วันที่ ${d} · รหัสกะ ${base} ไม่อยู่ใน Master`, empId: emp.id, day: d });
      }
      if (emp.autoFlags?.[d]) {
        attentionItems.push({ id: `predicted-${emp.id}-${d}`, title: employeeLabel, detail: `วันที่ ${d} · กะ ${raw} เป็นค่าที่ระบบคาดการณ์`, empId: emp.id, day: d });
      }
    }
  });
  let otCells = 0;
  employees.forEach(emp => Object.values(emp.days || {}).forEach(v => { if (/OT$/i.test(String(v).trim())) otCells++; }));
  const actionItems = [
    { key: "blocking", label: "ต้องแก้", value: blockingItems.length, tone: "danger", icon: <IconAlert size={18} />, detail: "ข้อมูลที่บล็อกการส่งอนุมัติ", items: blockingItems },
    { key: "attention", label: "ต้องตรวจ", value: attentionItems.length, tone: "warning", icon: <IconClock size={18} />, detail: "กะที่ระบบคาดการณ์", items: attentionItems },
    { key: "coverage", label: "ยังไม่จัดกะ", value: unassigned, tone: "warning", icon: <IconCalendar size={18} />, detail: "ช่องที่ยังไม่มีการจัดกะ", items: [] },
    { key: "ot", label: "OT", value: otCells, tone: "primary", icon: <IconCheck size={18} />, detail: "ช่องที่มี OT ในเดือนนี้", items: [] },
  ];

  const topShifts = Object.entries(shiftCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxShift = Math.max(1, ...topShifts.map(([, count]) => count));

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[17px] font-medium text-primary">
            <IconCalendar size={16} />
            {THAI_MONTHS[state.month - 1]} {state.yearBE}
          </div>
          <h1 className="mt-1 text-[25px] font-semibold tracking-tight text-ink sm:text-[32px]">ภาพรวมตารางเข้ากะ</h1>
          <p className="mt-1 text-[18px] leading-6 text-ink-soft">ดูความพร้อมของตาราง ปัญหาที่ต้องตรวจสอบ และสถานะการอนุมัติในมุมเดียว</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpenRoster}>
          เปิดตารางกะ <IconArrowRight size={16} />
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard icon={<IconUsers size={19} />} label="พนักงาน" value={employees.length} helper="รายชื่อในรอบนี้" />
        <KpiCard icon={<IconCheck size={19} />} label="Coverage" value={`${coverage}%`} helper="ช่องที่มีการจัดกะ" tone={coverageTone(coverage)} />
        <KpiCard icon={<IconAlert size={19} />} label="ยังไม่จัดกะ" value={unassigned} helper={unassigned ? "ควรตรวจสอบ" : "ครบทุกช่อง"} tone={unassigned ? "warning" : "success"} />
        <KpiCard icon={<IconClock size={19} />} label="กะคาดการณ์" value={predicted} helper="รอตรวจสอบ" tone={predicted ? "warning" : "success"} />
        <KpiCard icon={<IconCheck size={19} />} label="Approval" value={approvalLabel} helper={approvalStatus?.status || "draft"} tone={approvalStatus?.status === "approved" ? "success" : "primary"} />
      </div>

      <section className="mt-5 rounded-xl border border-line bg-white dark:bg-surface p-5 shadow-sm shadow-black/[0.02]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[17px] font-semibold uppercase tracking-wide text-primary">Manager Action Center</div>
            <h2 className="mt-0.5 text-[21px] font-semibold text-ink">วันนี้ต้องทำอะไร?</h2>
            <p className="mt-0.5 text-[17px] leading-5 text-ink-soft">ระบบจัดลำดับงานจากสิ่งที่ต้องแก้ก่อน → สิ่งที่ควรตรวจ → ข้อมูลประกอบการตัดสินใจ</p>
          </div>
          {blockingItems.length === 0 ? (
            <button type="button" onClick={onOpenApproval} className="text-[17px] font-semibold text-primary hover:underline">เปิดขั้นตอนอนุมัติ →</button>
          ) : (
            <span className="text-[17px] font-medium text-danger">ยังส่งอนุมัติไม่ได้</span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {actionItems.map(item => {
            const tone = item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : "primary";
            const clickable = item.items.length > 0 || item.key === "coverage";
            const cls = tone === "danger" ? "border-danger/20 bg-danger-soft" : tone === "warning" ? "border-warning/20 bg-warning-soft" : "border-primary/20 bg-primary-soft";
            const valueCls = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-primary";
            const action = () => {
              if (item.items.length > 0 && onFocusIssue) onFocusIssue(item.items[0]);
              else if (item.key === "coverage") onOpenRoster();
              else if (item.key === "ot") onOpenRoster();
            };
            return <button key={item.key} type="button" disabled={!clickable} onClick={action} className={`rounded-lg border p-4 text-left transition ${cls} ${clickable ? "hover:-translate-y-px hover:shadow-sm" : "cursor-default"}`}>
              <div className="flex items-center justify-between gap-2"><span className={valueCls}>{item.icon}</span><span className={`text-[30px] leading-none font-semibold ${valueCls}`}>{item.value.toLocaleString()}</span></div>
              <div className="mt-2 text-[17px] font-semibold text-ink">{item.label}</div>
              <div className="mt-1 text-[16px] leading-5 text-ink-faint">{item.detail}</div>
            </button>;
          })}
        </div>
        {blockingItems.length > 0 && (
          <div className="mt-3 rounded-lg border border-danger/20 bg-danger-soft/50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-[17px] font-semibold text-danger">มี {blockingItems.length} จุดที่ต้องแก้</div><div className="mt-0.5 text-[16.5px] leading-5 text-ink-soft">กดรายการเพื่อเปิด Roster และเลื่อนไปยัง cell ที่มีปัญหา</div></div>
              <button type="button" onClick={() => onFocusIssue?.(blockingItems[0])} className="shrink-0 rounded-md bg-danger px-3 py-1.5 text-[16px] font-semibold text-white hover:opacity-90">แก้รายการแรก</button>
            </div>
            <div className="mt-2 space-y-1.5">
              {blockingItems.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => onFocusIssue?.(item)} className="group flex w-full items-center gap-2 rounded-md bg-white/60 px-2.5 py-2 text-left hover:bg-white dark:bg-surface/40"><span className="h-1.5 w-1.5 rounded-full bg-danger"/><span className="min-w-0 flex-1 truncate text-[16px] font-medium text-ink">{item.title}</span><span className="text-[15px] text-ink-faint">{item.detail}</span><IconArrowRight size={12} className="shrink-0 text-ink-faint group-hover:translate-x-0.5"/></button>)}
              {blockingItems.length > 3 && <div className="px-2 text-[15px] text-ink-faint">และอีก {blockingItems.length - 3} รายการ</div>}
            </div>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <Card title="Coverage ภาพรวมเดือนนี้" action={<span className="text-[16px] text-ink-faint">เป้าหมาย ≥ 95%</span>}>
          <div className="flex items-center gap-5 py-2">
            <div className="relative h-32 w-32 shrink-0">
              <div className="absolute inset-0 rounded-full bg-canvas" />
              <div className="absolute inset-2 rounded-full bg-white dark:bg-surface ring-1 ring-line flex flex-col items-center justify-center">
                <span className="text-[34px] font-semibold leading-none text-ink">{coverage}%</span>
                <span className="text-[16px] text-ink-faint">assigned</span>
              </div>
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="7" className="text-line" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${Math.min(coverage, 100) * 2.764} 276.4`} className={coverage >= 95 ? "text-success" : coverage >= 85 ? "text-warning" : "text-danger"} />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[17px] text-ink-soft">
                <span>จัดกะแล้ว</span><b className="text-ink">{assigned.toLocaleString()} ช่อง</b>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(coverage, 100)}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[17px]">
                <div className="rounded-lg bg-canvas px-3 py-2"><div className="text-ink-faint">ลาพักร้อน</div><div className="mt-0.5 font-semibold text-ink">{leave} ช่อง</div></div>
                <div className="rounded-lg bg-canvas px-3 py-2"><div className="text-ink-faint">รวมช่องทั้งหมด</div><div className="mt-0.5 font-semibold text-ink">{totalSlots.toLocaleString()} ช่อง</div></div>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-line/70 pt-4">
            <div className="mb-2 text-[17px] font-medium text-ink-soft">สัดส่วนกะที่ใช้งาน</div>
            <div className="space-y-2">
              {topShifts.length ? topShifts.map(([code, count]) => (
                <div key={code} className="flex items-center gap-2 text-[16.5px]">
                  <span className="w-10 font-semibold text-ink">{code}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(count / maxShift) * 100}%` }} /></div>
                  <span className="w-12 text-right text-ink-faint">{count}</span>
                </div>
              )) : <div className="text-[17px] text-ink-faint">ยังไม่มีข้อมูลกะในเดือนนี้</div>}
            </div>
          </div>
        </Card>

        <Card title="Attention Required" action={attention.length ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[15px] font-semibold text-danger">{attention.length}</span> : null}>
          <div className="space-y-2">
            {attention.length ? attention.map((item, index) => {
              const tone = item.tone === "danger" ? "text-danger bg-danger-soft" : item.tone === "warning" ? "text-warning bg-warning-soft" : "text-primary bg-primary-soft";
              return (
                <button key={`${item.title}-${index}`} type="button" onClick={item.tone === "primary" ? onOpenApproval : onOpenRoster} className="group flex w-full items-start gap-3 rounded-lg border border-line p-4 text-left transition hover:border-primary/30 hover:bg-canvas">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone}`}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17.5px] font-medium text-ink">{item.title}</span>
                    <span className="mt-0.5 block text-[16px] leading-5 text-ink-faint">{item.detail}</span>
                  </span>
                  <IconArrowRight size={16} className="mt-1 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            }) : (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-lg bg-success-soft/60 px-4 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success text-white"><IconCheck size={20} /></div>
                <div className="mt-3 text-[18px] font-semibold text-ink">ไม่พบรายการที่ต้องแก้ไข</div>
                <div className="mt-1 text-[16px] text-ink-soft">ตารางพร้อมสำหรับการตรวจสอบขั้นถัดไป</div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-white dark:bg-surface px-5 py-4 text-[17px] leading-5 text-ink-soft shadow-sm shadow-black/[0.02]">
        <span className="font-medium text-ink">UX note:</span> หน้านี้เน้นให้ผู้จัดการเห็น “สิ่งที่ต้องทำ” ก่อนรายละเอียด เพื่อไม่ต้องไล่ตรวจทั้งตารางทุกครั้ง
      </div>
    </main>
  );
}
