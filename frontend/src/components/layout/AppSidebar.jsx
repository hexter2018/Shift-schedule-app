import { LayoutDashboard, CalendarRange, ClipboardCheck, Building2, Download } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "../ui/sidebar";

const NAV_ITEMS = [
  { key: "dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { key: "schedule", label: "ตารางกะ", icon: CalendarRange },
  { key: "approvals", label: "รออนุมัติ", icon: ClipboardCheck, badgeKey: "approvals" },
  { key: "departments", label: "หน่วยงาน", icon: Building2 },
  { key: "export", label: "ส่งออกข้อมูล", icon: Download },
];

export default function AppSidebar({ page, onNavigate, badges = {} }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-sans text-sm font-bold text-white">
            ก
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-sans text-[13px] font-semibold text-ink">ระบบจัดตารางกะ</div>
            <div className="truncate font-sans text-[11.5px] text-ink-faint">Shift Scheduler</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const badgeValue = item.badgeKey ? badges[item.badgeKey] : undefined;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={page === item.key}
                      tooltip={item.label}
                      onClick={() => onNavigate(item.key)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {badgeValue > 0 && <SidebarMenuBadge>{badgeValue}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
