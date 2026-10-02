import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "./ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import Button from "./ui/Button";

// Sentinel distinct from "" — Radix's SelectItem rejects an empty-string
// value outright, but "clear this cell's shift code" is a real action the
// dialog needs to offer alongside picking a real shift code.
const CLEAR_VALUE = "__clear__";

export default function AddEditShiftDialog({ open, onOpenChange, employees, shiftCodes, daysInMonth, onSubmit }) {
  const [empId, setEmpId] = useState("");
  const [day, setDay] = useState("1");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmpId(employees?.[0]?.id || "");
    setDay("1");
    setCode(shiftCodes?.[0]?.code || CLEAR_VALUE);
  }, [open, employees, shiftCodes]);

  const dayNum = Number(day);
  const valid = empId && dayNum >= 1 && dayNum <= daysInMonth;

  const handleSubmit = () => {
    if (!valid) return;
    onSubmit(empId, dayNum, code === CLEAR_VALUE ? "" : code);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่ม / แก้ไขกะ</DialogTitle>
          <DialogDescription>เลือกพนักงาน วันที่ และรหัสกะที่ต้องการกำหนดในเดือนนี้</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift-employee">พนักงาน</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger id="shift-employee">
                <SelectValue placeholder="เลือกพนักงาน" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(employees || []).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name || emp.empCode || "ไม่ระบุชื่อ"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shift-day">วันที่</Label>
              <Input
                id="shift-day" type="number" min={1} max={daysInMonth}
                value={day} onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shift-code">รหัสกะ</Label>
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger id="shift-code">
                  <SelectValue placeholder="เลือกรหัสกะ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(shiftCodes || []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                    ))}
                    <SelectItem value="LA">LA (ลา)</SelectItem>
                    <SelectItem value={CLEAR_VALUE}>(ล้างกะ)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button variant="primary" disabled={!valid} onClick={handleSubmit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
