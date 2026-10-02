import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, ExternalLink, Info } from "lucide-react";
import { listMyDepartments } from "../../lib/departments";
import { storage } from "../../lib/storage";
import { THAI_MONTHS, storageKey, holidayKey } from "../../lib/logic";
import { exportExcel } from "../../lib/excel";
import { getApprovalStatus, approvedFileUrl } from "../../lib/approvals";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import Button from "../ui/Button";
import Card from "../ui/Card";

export default function ExportDataPage({
  currentDepartment, currentMonth, currentYearBE, onDownloadExcel, onDownloadPdf,
}) {
  const [departments, setDepartments] = useState(null);
  const [deptSlug, setDeptSlug] = useState(currentDepartment?.slug || "");
  const [month, setMonth] = useState(currentMonth);
  const [yearBE, setYearBE] = useState(currentYearBE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [approvedUrl, setApprovedUrl] = useState(null);

  useEffect(() => {
    listMyDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  const isCurrentSelection = deptSlug === currentDepartment?.slug && month === currentMonth && yearBE === currentYearBE;

  useEffect(() => {
    if (!deptSlug || !month || !yearBE) return;
    let cancelled = false;
    const key = storageKey(deptSlug, month, yearBE);
    getApprovalStatus(key)
      .then((status) => { if (!cancelled) setApprovedUrl(status?.status === "approved" ? approvedFileUrl(key) : null); })
      .catch(() => { if (!cancelled) setApprovedUrl(null); });
    return () => { cancelled = true; };
  }, [deptSlug, month, yearBE]);

  const selectedDeptName = useMemo(
    () => departments?.find((d) => d.slug === deptSlug)?.name || currentDepartment?.name || "",
    [departments, deptSlug, currentDepartment]
  );

  const handleExportExcel = async () => {
    setMessage("");
    setBusy(true);
    try {
      if (isCurrentSelection) {
        await onDownloadExcel();
      } else {
        const stateRes = await storage.get(storageKey(deptSlug, month, yearBE));
        if (!stateRes?.value) throw new Error("ไม่พบตารางกะของเดือนที่เลือกไว้");
        const holidaysRes = await storage.get(holidayKey(deptSlug)).catch(() => null);
        const state = JSON.parse(stateRes.value);
        const holidays = holidaysRes?.value ? JSON.parse(holidaysRes.value) : [];
        await exportExcel(state, holidays);
      }
      setMessage("ดาวน์โหลด Excel แล้ว");
    } catch (err) {
      setMessage(err.message || "ส่งออก Excel ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div>
        <h2 className="font-sans text-[18px] font-semibold tracking-tight text-ink">ส่งออกข้อมูล</h2>
        <p className="mt-0.5 font-sans text-[13px] text-ink-faint">เลือกหน่วยงานและเดือนที่ต้องการ แล้วส่งออกตารางกะเป็น Excel หรือ PDF</p>
      </div>

      <Card title="เลือกช่วงข้อมูล" noPrint>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>หน่วยงาน</Label>
            <Select value={deptSlug} onValueChange={setDeptSlug} disabled={!departments}>
              <SelectTrigger><SelectValue placeholder="เลือกหน่วยงาน" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(departments || []).map((d) => (
                    <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>เดือน</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {THAI_MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ปี (พ.ศ.)</Label>
            <Input type="number" value={yearBE} onChange={(e) => setYearBE(Number(e.target.value))} />
          </div>
        </div>
      </Card>

      <Card title={`ไฟล์ของ ${selectedDeptName || "—"} · ${THAI_MONTHS[month - 1] || ""} ${yearBE}`} noPrint>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2.5">
            <Button variant="primary" size="md" disabled={busy || !deptSlug} onClick={handleExportExcel}>
              <FileSpreadsheet data-icon="inline-start" className="size-4" />
              ส่งออก Excel
            </Button>
            <Button
              variant="secondary" size="md" disabled={!isCurrentSelection}
              onClick={onDownloadPdf}
              title={!isCurrentSelection ? "ดาวน์โหลด PDF ได้เฉพาะเดือน/หน่วยงานที่กำลังเปิดอยู่ในตารางกะ" : undefined}
            >
              <FileText data-icon="inline-start" className="size-4" />
              ส่งออก PDF
            </Button>
            {approvedUrl && (
              <a href={approvedUrl} target="_blank" rel="noreferrer">
                <Button variant="tinted" size="md">
                  <ExternalLink data-icon="inline-start" className="size-4" />
                  ไฟล์ที่อนุมัติแล้ว
                </Button>
              </a>
            )}
          </div>

          {!isCurrentSelection && (
            <div className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2.5 font-sans text-[12.5px] text-ink-faint">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              ส่งออก PDF ต้องแสดงตารางกะบนหน้าจอก่อน — ไปที่หน้า &quot;ตารางกะ&quot; และเลือกหน่วยงาน/เดือนนี้ แล้วกลับมาส่งออก
            </div>
          )}

          {message && <span className="font-sans text-[12.5px] text-ink-faint">{message}</span>}
        </div>
      </Card>
    </div>
  );
}
