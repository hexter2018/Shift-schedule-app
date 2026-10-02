import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowLeftRight } from "lucide-react";
import { listMyDepartments, listMembers, addMember, removeMember } from "../../lib/departments";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import Button from "../ui/Button";
import Card from "../ui/Card";

function DepartmentCard({ dept, isCurrent, onSelectDepartment }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setMembers(await listMembers(dept.slug));
    } catch (err) {
      setError(err.message || "โหลดรายชื่อสมาชิกไม่สำเร็จ");
    }
  };

  useEffect(() => { refresh(); }, [dept.slug]);

  const handleAdd = async () => {
    if (!newEmail.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addMember(dept.slug, newEmail.trim(), newRole);
      setNewEmail("");
      setNewRole("member");
      setAddOpen(false);
      await refresh();
    } catch (err) {
      setError(err.message || "เพิ่มสมาชิกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMember(dept.slug, removeTarget);
      setRemoveTarget(null);
      await refresh();
    } catch (err) {
      setError(err.message || "ลบสมาชิกไม่สำเร็จ");
    }
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          {dept.name}
          {isCurrent && <Badge>หน่วยงานปัจจุบัน</Badge>}
        </span>
      }
      action={
        <div className="flex items-center gap-1.5">
          {!isCurrent && (
            <Button variant="ghost" size="sm" onClick={() => onSelectDepartment(dept)}>
              <ArrowLeftRight data-icon="inline-start" className="size-3.5" />
              สลับไปหน่วยงานนี้
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus data-icon="inline-start" className="size-3.5" />
            เพิ่มสมาชิก
          </Button>
        </div>
      }
      bodyClassName="p-0"
    >
      {error && <div className="px-4 py-2 font-sans text-[12.5px] text-danger">{error}</div>}
      {members === null ? (
        <div className="px-4 py-5 text-center font-sans text-[13px] text-ink-faint">กำลังโหลด…</div>
      ) : members.length === 0 ? (
        <div className="px-4 py-5 text-center font-sans text-[13px] text-ink-faint">ยังไม่มีสมาชิก</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>สมาชิก</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead className="text-right">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.email}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[11px]">{m.email.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-sans text-[13px] text-ink">{m.email}</span>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{m.role}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="danger-ghost" size="sm" onClick={() => setRemoveTarget(m.email)}>
                    <Trash2 data-icon="inline-start" className="size-3.5" />
                    ลบ
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มสมาชิกใน {dept.name}</DialogTitle>
            <DialogDescription>ระบุอีเมลและบทบาทของสมาชิกที่ต้องการเพิ่ม</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${dept.slug}`}>อีเมล</Label>
              <Input
                id={`email-${dept.slug}`} type="email" placeholder="name@company.co.th"
                value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`role-${dept.slug}`}>บทบาท</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger id={`role-${dept.slug}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="member">สมาชิก</SelectItem>
                    <SelectItem value="manager">ผู้จัดการ</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button variant="primary" disabled={!newEmail.trim() || saving} onClick={handleAdd}>
              {saving ? "กำลังเพิ่ม…" : "เพิ่มสมาชิก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(v) => !v && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบสมาชิกออกจากหน่วยงาน</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ &quot;{removeTarget}&quot; ออกจาก {dept.name} หรือไม่? สมาชิกจะไม่สามารถเข้าถึงหน่วยงานนี้ได้อีก
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>ลบสมาชิก</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function DepartmentsPage({ currentDepartment, onSelectDepartment }) {
  const [departments, setDepartments] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listMyDepartments()
      .then(setDepartments)
      .catch((err) => setError(err.message || "โหลดหน่วยงานไม่สำเร็จ"));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div>
        <h2 className="font-sans text-[18px] font-semibold tracking-tight text-ink">หน่วยงาน</h2>
        <p className="mt-0.5 font-sans text-[13px] text-ink-faint">จัดการสมาชิกและบทบาทของทุกหน่วยงานที่คุณเป็นเจ้าของหรือเป็นสมาชิก</p>
      </div>

      {error && <div className="rounded-lg bg-danger-soft px-3.5 py-2 font-sans text-[13px] text-danger">{error}</div>}

      {departments === null ? (
        <div className="py-10 text-center font-sans text-[13px] text-ink-faint">กำลังโหลด…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.slug} dept={dept}
              isCurrent={dept.slug === currentDepartment?.slug}
              onSelectDepartment={onSelectDepartment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
