import { SidebarProvider, SidebarInset } from "../ui/sidebar";
import AppSidebar from "./AppSidebar";
import AppTopbar from "./AppTopbar";

export default function AppShell({
  page, onNavigate, badges,
  departmentName, onSwitchDepartment,
  dark, onToggleDark,
  statusMsg, onSave, onOpenApproval, locked,
  notifications,
  children,
}) {
  return (
    <SidebarProvider>
      <AppSidebar page={page} onNavigate={onNavigate} badges={badges} />
      <SidebarInset className="bg-canvas">
        <AppTopbar
          page={page}
          departmentName={departmentName}
          onSwitchDepartment={onSwitchDepartment}
          dark={dark}
          onToggleDark={onToggleDark}
          statusMsg={statusMsg}
          onSave={onSave}
          onOpenApproval={onOpenApproval}
          locked={locked}
          notifications={notifications}
        />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
