import { useEffect, useState } from "react";
import { Check, X, ExternalLink } from "lucide-react";
import { listMyDepartments } from "../../lib/departments";
import { getApprovalStatus, approvedFileUrl } from "../../lib/approvals";
import { storageKey } from "../../lib/logic";
import { Badge } from "../ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import Button from "../ui/Button";
import Card from "../ui/Card";
import ApprovalPanel from "../ApprovalPanel";

const STATUS_META = {
  none: { label: "ยังไม่ส่ง", variant: "outline" },
  pending_section: { label: "รอผู้จัดการแผนก", variant: "default" },
  pending_division: { label: "รอผู้จัดการส่วน", variant: "default" },
  approved: { label: "อนุมัติแล้ว", variant: "default" },
  rejected: { label: "ถูกปฏิเสธ", variant: "outline" },
};

export default function ApprovalsWorkspace({
  currentDepartment, currentScheduleKey, currentMonth, currentYearBE,
  approvalStatus, approvalLoading, onSubmitApproval, approvalSubmitting, approvalSubmitError,
  reviewBlockingCount,
}) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  // Approve/Reject below are UI-only actions scoped to this workspace's
  // local optimistic state — there is no backend Approve/Reject endpoint.
  // Real approval still happens over the emailed OneDrive link; these
  // buttons just let a manager mark what they already did out-of-band so
  // the list reflects it, and link out to the real approved file.
  const [overrides, setOverrides] = useState({});
  const [confirmAction, setConfirmAction] = useState(null); // {slug, action}

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const departments = await listMyDepartments();
        const withStatus = await Promise.all(
          departments.map(async (dept) => {
            const key = dept.slug === currentDepartment?.slug
              ? currentScheduleKey
              : storageKey(dept.slug, currentMonth, currentYearBE);
            try {
              const status = await getApprovalStatus(key);
              return { dept, key, status };
            } catch {
              return { dept, key, status: { status: "none" } };
            }
          })
        );
        if (!cancelled) setRows(withStatus);
      } catch (err) {
        if (!cancelled) setError(err.message || "โหลดรายการรออนุมัติไม่สำเร็จ");
      }
    })();
    return () => { cancelled = true; };
  }, [currentDepartment, currentScheduleKey, currentMonth, currentYearBE]);

  const applyOverride = (slug, action) => {
    setOverrides((prev) => ({ ...prev, [slug]: action }));
    setConfirmAction(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div>
        <h2 className="font-sans text-[18px] font-semibold tracking-tight text-ink">รายการรออนุมัติ</h2>
        <p className="mt-0.5 font-sans text-[13px] text-ink-faint">
          สถานะอนุมัติของทุกหน่วยงานที่คุณดูแล สำหรับเดือนที่กำลังแสดงอยู่ — การอนุมัติจริงยังเป็นขั้นตอนทางอีเมล/OneDrive
          ปุ่ม &quot;อนุมัติ/ปฏิเสธ&quot; ด้านล่างเป็นเพียงการทำเครื่องหมายในหน้านี้เท่านั้น
        </p>
      </div>

      {error && <div className="rounded-lg bg-danger-soft px-3.5 py-2 font-sans text-[13px] text-danger">{error}</div>}

      <Card title="หน่วยงานภายใต้การดูแล" bodyClassName="p-0" noPrint>
        {rows === null ? (
          <div className="px-4 py-6 text-center font-sans text-[13px] text-ink-faint">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center font-sans text-[13px] text-ink-faint">ไม่พบหน่วยงาน</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>หน่วยงาน</TableHead>
                <TableHead>บทบาท</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">การดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ dept, key, status }) => {
                const effectiveStatus = overrides[dept.slug] || status.status || "none";
                const meta = STATUS_META[effectiveStatus] || STATUS_META.none;
                const canAct = effectiveStatus === "pending_section" || effectiveStatus === "pending_division";
                return (
                  <TableRow key={dept.slug}>
                    <TableCell className="font-medium text-ink">{dept.name}</TableCell>
                    <TableCell className="text-ink-soft">{dept.role}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {effectiveStatus === "approved" && (
                          <a href={approvedFileUrl(key)} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="sm">
                              <ExternalLink data-icon="inline-start" className="size-3.5" />
                              ไฟล์ที่อนุมัติ
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost" size="sm" disabled={!canAct}
                          onClick={() => setConfirmAction({ slug: dept.slug, name: dept.name, action: "approve" })}
                        >
                          <Check data-icon="inline-start" className="size-3.5" />
                          อนุมัติ
                        </Button>
                        <Button
                          variant="danger-ghost" size="sm" disabled={!canAct}
                          onClick={() => setConfirmAction({ slug: dept.slug, name: dept.name, action: "reject" })}
                        >
                          <X data-icon="inline-start" className="size-3.5" />
                          ปฏิเสธ
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {currentDepartment && (
        <ApprovalPanel
          scheduleKey={currentScheduleKey}
          status={approvalStatus}
          loading={approvalLoading}
          onSubmit={onSubmitApproval}
          submitting={approvalSubmitting}
          submitError={approvalSubmitError}
          reviewBlockingCount={reviewBlockingCount}
        />
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "approve" ? "ยืนยันการอนุมัติ" : "ยืนยันการปฏิเสธ"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "approve"
                ? `ทำเครื่องหมายตารางกะของ "${confirmAction?.name}" ว่าอนุมัติแล้วในหน้านี้ การอนุมัติจริงยังต้องยืนยันผ่านอีเมล/OneDrive ตามปกติ`
                : `ทำเครื่องหมายตารางกะของ "${confirmAction?.name}" ว่าถูกปฏิเสธในหน้านี้ ผู้จัดการแผนกจะต้องแก้ไขและส่งใหม่`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyOverride(confirmAction.slug, confirmAction.action)}>
              ยืนยัน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
