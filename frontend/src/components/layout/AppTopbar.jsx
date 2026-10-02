import { Bell, LogOut, Moon, Sun, Send, Save, ArrowLeftRight } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback } from "../ui/avatar";
import Button from "../ui/Button";
import { getStoredUser, logout } from "../../lib/auth";

const PAGE_TITLES = {
  dashboard: "แดชบอร์ด",
  schedule: "ตารางกะ",
  approvals: "รออนุมัติ",
  departments: "หน่วยงาน",
  export: "ส่งออกข้อมูล",
};

export default function AppTopbar({
  page, departmentName, onSwitchDepartment,
  dark, onToggleDark,
  statusMsg, onSave, onOpenApproval, locked = false,
  notifications = [],
}) {
  const user = getStoredUser();
  const initials = (user?.name || "?").trim().slice(0, 1).toUpperCase();
  const notificationCount = notifications.length;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-white px-3 no-print dark:bg-surface sm:gap-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="h-5 w-px shrink-0 bg-line" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-sans text-[15px] font-semibold text-ink">{PAGE_TITLES[page] || ""}</h1>
        <p className="truncate font-sans text-[12px] text-ink-faint">{departmentName}</p>
      </div>

      <span className="hidden truncate font-sans text-[12.5px] text-ink-faint sm:inline">{statusMsg}</span>

      {page === "schedule" && (
        <>
          <Button variant="secondary" size="sm" disabled={locked} onClick={onOpenApproval} className="hidden sm:inline-flex">
            <Send data-icon="inline-start" className="size-3.5" />
            ส่งอนุมัติ
          </Button>
          <Button variant="primary" size="sm" disabled={locked} onClick={onSave}>
            <Save data-icon="inline-start" className="size-3.5" />
            บันทึก
          </Button>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="การแจ้งเตือน"
            className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-soft ring-1 ring-inset ring-line transition-colors hover:text-ink hover:ring-ink-faint"
          >
            <Bell className="size-4" />
            {notificationCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-0.5 font-sans text-[10px] font-semibold leading-none text-white">
                {notificationCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>การแจ้งเตือน</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length ? (
            <DropdownMenuGroup>
              {notifications.map((n, i) => (
                <DropdownMenuItem key={i} className="flex flex-col items-start gap-0.5">
                  <span className="font-sans text-[13px] font-medium text-ink">{n.title}</span>
                  <span className="font-sans text-[12px] text-ink-faint">{n.detail}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : (
            <div className="px-2 py-4 text-center font-sans text-[12.5px] text-ink-faint">ไม่มีรายการแจ้งเตือน</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={onToggleDark}
        aria-label={dark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
        title={dark ? "โหมดสว่าง" : "โหมดมืด"}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-soft ring-1 ring-inset ring-line transition-colors hover:text-ink hover:ring-ink-faint"
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="เมนูผู้ใช้"
            className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {user && (
            <>
              <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
                <span className="font-sans text-[13px] font-medium text-ink">{user.name}</span>
                <span className="truncate font-sans text-[12px] text-ink-faint">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={onSwitchDepartment}>
            <ArrowLeftRight />
            สลับหน่วยงาน
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout} className="text-danger focus:text-danger">
            <LogOut />
            ออกจากระบบ
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
