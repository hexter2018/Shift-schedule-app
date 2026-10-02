import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { THAI_MONTHS } from "../lib/logic";
import { getStoredUser, logout } from "../lib/auth";
import Button from "./ui/Button";
import Field, { inputClass, selectClass } from "./ui/Field";
import ThemeToggle from "./ui/ThemeToggle";
import InsightsBadge from "./InsightsBadge";
import { IconSend } from "./ui/Icon";

export default function TopBar({
  state, statusMsg,
  onDeptChange, onMonthChange, onYearChange, onSave,
  dark, onToggleDark,
  insightsCount, insightsProps,
  onOpenApproval,
  departmentName, onSwitchDepartment,
}){
  return (
    <div className="sticky top-0 z-30 w-full border-b border-line bg-white dark:bg-surface no-print">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end gap-2.5 py-2.5">
          <div className="flex flex-col gap-1.5 min-w-[160px] max-w-[360px]">
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
            <select value={state.month} onChange={e=>onMonthChange(parseInt(e.target.value,10))} className={selectClass + " w-28 sm:w-36"}>
              {THAI_MONTHS.map((m,i)=>(<option key={i} value={i+1}>{m}</option>))}
            </select>
          </Field>
          <Field label="ปี (พ.ศ.)">
            <input type="number" value={state.yearBE} onChange={e=>onYearChange(parseInt(e.target.value,10))}
              className={inputClass + " w-20 sm:w-24"} />
          </Field>

          {/* Tab nav sits centered between identity fields and the action
              cluster — this is the primary navigation for the whole app
              now (schedule vs setup), so it needs its own visual weight,
              not just another toolbar item. */}
          <Tabs.List className="flex items-center gap-1 rounded-md bg-canvas p-1 mx-auto sm:mx-4">
            <Tabs.Trigger
              value="overview"
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-sans font-medium text-ink-soft
                         data-[state=active]:bg-white dark:data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm
                         transition-colors"
            >
              ภาพรวม
            </Tabs.Trigger>
            <Tabs.Trigger
              value="schedule"
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-sans font-medium text-ink-soft
                         data-[state=active]:bg-white dark:data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm
                         transition-colors"
            >
              ตารางกะ
            </Tabs.Trigger>
            <Tabs.Trigger
              value="setup"
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-sans font-medium text-ink-soft
                         data-[state=active]:bg-white dark:data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm
                         transition-colors"
            >
              ตั้งค่า
            </Tabs.Trigger>
          </Tabs.List>

          <div className="flex-1 min-w-[8px] hidden sm:block" />

          <button
            type="button"
            onClick={onOpenApproval}
            title="ส่งเพื่ออนุมัติ"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-sans font-medium text-ink-soft
                       ring-1 ring-inset ring-line hover:bg-canvas transition-colors"
          >
            <IconSend size={13} />
            ส่งอนุมัติ
          </button>

          <InsightsBadge count={insightsCount} {...insightsProps} />

          <UserMenu departmentName={departmentName} onSwitchDepartment={onSwitchDepartment} />
          <ThemeToggle dark={dark} onToggle={onToggleDark} />
          <span className="text-[13px] font-sans text-ink-faint self-center px-1 min-w-0 sm:min-w-[80px] text-right hidden md:inline">{statusMsg}</span>
          <Button variant="primary" onClick={onSave}>บันทึก</Button>
        </div>
      </div>
    </div>
  );
}

function UserMenu({ departmentName, onSwitchDepartment }){
  const user = getStoredUser();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button" onClick={()=>setOpen(o=>!o)}
        title={user ? `${user.name} (${user.email})` : ""}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[13px] font-sans text-ink-soft
                   ring-1 ring-inset ring-line hover:bg-canvas transition-colors max-w-[160px]"
      >
        <span className="truncate">{departmentName}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={()=>setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-md bg-white dark:bg-surface ring-1 ring-inset ring-line shadow-lg py-1">
            {user && (
              <div className="px-3 py-2 border-b border-line/70">
                <div className="font-sans text-[13px] font-medium text-ink truncate">{user.name}</div>
                <div className="font-sans text-[11.5px] text-ink-faint truncate">{user.email}</div>
              </div>
            )}
            <button
              onClick={()=>{ setOpen(false); onSwitchDepartment(); }}
              className="w-full text-left px-3 py-2 font-sans text-[13px] text-ink hover:bg-canvas dark:hover:bg-white/[0.04]"
            >
              สลับหน่วยงาน
            </button>
            <button
              onClick={logout}
              className="w-full text-left px-3 py-2 font-sans text-[13px] text-danger hover:bg-danger-soft"
            >
              ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
