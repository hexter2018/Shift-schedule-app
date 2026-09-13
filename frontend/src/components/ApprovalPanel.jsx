import { useState } from "react";
import { approvedFileUrl } from "../lib/approvals";
import Card from "./ui/Card";
import Button from "./ui/Button";
import Field, { inputClass } from "./ui/Field";
import Tooltip from "./ui/Tooltip";

function fmtThaiDateTime(iso){
  if(!iso) return "";
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const DOT_COLOR = { pending: "bg-primary", success: "bg-success", danger: "bg-danger" };

// The small live-status dot pattern used by most modern SaaS tools
// (Linear, Vercel, etc.) for "something is in progress" — a single pulse
// ring communicates "waiting" at a glance without needing a full colored
// banner box around it.
function StatusDot({ tone, pulse }){
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${DOT_COLOR[tone]}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT_COLOR[tone]}`} />
    </span>
  );
}

// Compact, single-row grid: two email fields + submit button share one
// line on desktop instead of three stacked full-width rows.
function SubmitForm({ defaultSection, defaultDivision, submitting, error, onSubmit, submitLabel }){
  const [sectionEmail, setSectionEmail] = useState(defaultSection || "");
  const [divisionEmail, setDivisionEmail] = useState(defaultDivision || "");

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <Field label="อีเมลผู้จัดการแผนก">
          <input type="email" value={sectionEmail} placeholder="section.manager@company.co.th"
            className={inputClass} onChange={e=>setSectionEmail(e.target.value)} />
        </Field>
        <Field label="อีเมลผู้จัดการส่วน">
          <input type="email" value={divisionEmail} placeholder="division.manager@company.co.th"
            className={inputClass} onChange={e=>setDivisionEmail(e.target.value)} />
        </Field>
        <Button variant="primary" disabled={submitting || !sectionEmail.trim() || !divisionEmail.trim()}
          onClick={()=>onSubmit(sectionEmail.trim(), divisionEmail.trim())}>
          {submitting ? "กำลังส่ง…" : submitLabel}
        </Button>
      </div>
      {error && <span className="text-[13px] font-sans text-danger">{error}</span>}
    </div>
  );
}

export default function ApprovalPanel({ scheduleKey, status, loading, onSubmit, submitting, submitError }){
  if(loading){
    return (
      <div className="no-print flex items-center gap-2 rounded-md bg-white dark:bg-surface ring-1 ring-inset ring-line px-3.5 py-2 text-[13px] font-sans text-ink-faint">
        กำลังโหลดสถานะการอนุมัติ…
      </div>
    );
  }

  const st = status?.status || "none";

  if(st === "none"){
    return (
      <Card noPrint
        title={
          <span className="inline-flex items-center gap-1.5">
            ส่งเพื่ออนุมัติ (2 ระดับ)
            <Tooltip width="22rem">
              ระบบจะสร้างไฟล์ Excel และส่งคำขออนุมัติผ่าน Power Automate ไปยังผู้จัดการแผนกก่อน จากนั้นจึงส่งต่อให้ผู้จัดการส่วนโดยอัตโนมัติเมื่อผู้จัดการแผนกอนุมัติแล้ว
            </Tooltip>
          </span>
        }
      >
        <SubmitForm submitting={submitting} error={submitError} onSubmit={onSubmit} submitLabel="ส่งเพื่ออนุมัติ" />
      </Card>
    );
  }

  if(st === "pending_section" || st === "pending_division"){
    const waitingFor = st === "pending_section"
      ? `ผู้จัดการแผนก (${status.sectionManagerEmail})`
      : `ผู้จัดการส่วน (${status.divisionManagerEmail})`;
    return (
      <div className="no-print flex flex-wrap items-center gap-2.5 rounded-md bg-white dark:bg-surface ring-1 ring-inset ring-line px-3.5 py-2 text-[13px] font-sans">
        <StatusDot tone="pending" pulse />
        <span className="text-ink">
          รออนุมัติจาก{waitingFor}
        </span>
        {st === "pending_division" && (
          <span className="text-ink-faint">
            · {status.sectionApproverName} อนุมัติแล้วเมื่อ {fmtThaiDateTime(status.sectionApprovedAt)}
          </span>
        )}
        <span className="ml-auto text-[12px] text-ink-faint">ตารางถูกล็อกระหว่างรอ</span>
      </div>
    );
  }

  if(st === "approved"){
    return (
      <div className="no-print flex flex-wrap items-center gap-2.5 rounded-md bg-white dark:bg-surface ring-1 ring-inset ring-line px-3.5 py-2 text-[13px] font-sans">
        <StatusDot tone="success" />
        <span className="text-ink">อนุมัติครบทั้ง 2 ระดับแล้ว</span>
        <span className="text-ink-faint">
          · {status.sectionApproverName} ({fmtThaiDateTime(status.sectionApprovedAt)}) · {status.divisionApproverName} ({fmtThaiDateTime(status.divisionApprovedAt)})
        </span>
        <a href={approvedFileUrl(scheduleKey)} target="_blank" rel="noreferrer" className="ml-auto">
          <Button variant="tinted" size="sm">⬇ ดาวน์โหลดไฟล์ที่อนุมัติแล้ว</Button>
        </a>
      </div>
    );
  }

  if(st === "rejected"){
    return (
      <Card noPrint>
        <div className="flex items-center gap-2.5 text-[13px] font-sans mb-3">
          <StatusDot tone="danger" />
          <span className="text-ink">
            ถูกปฏิเสธโดย{status.rejectedByRole === "division" ? "ผู้จัดการส่วน" : "ผู้จัดการแผนก"}
          </span>
          <span className="text-ink-faint">
            ({status.rejectedByName}, {fmtThaiDateTime(status.rejectedAt)})
            {status.rejectedReason ? ` — ${status.rejectedReason}` : ""}
          </span>
        </div>
        <SubmitForm
          defaultSection={status.sectionManagerEmail} defaultDivision={status.divisionManagerEmail}
          submitting={submitting} error={submitError} onSubmit={onSubmit} submitLabel="ส่งเพื่ออนุมัติอีกครั้ง"
        />
      </Card>
    );
  }

  return null;
}
