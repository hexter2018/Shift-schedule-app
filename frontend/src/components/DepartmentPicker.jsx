import { useState } from "react";
import { createDepartment } from "../lib/departments";
import { logout, getStoredUser } from "../lib/auth";
import Button from "./ui/Button";
import AuthBrandPanel from "./AuthBrandPanel";

export default function DepartmentPicker({ departments, onPick, onCreated }){
  const [creating, setCreating] = useState(departments.length === 0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const user = getStoredUser();

  const submitCreate = async (e)=>{
    e.preventDefault();
    setError("");
    setBusy(true);
    try{
      const dept = await createDepartment(name.trim());
      onCreated(dept);
    }catch(err){
      setError(err.message || "สร้างหน่วยงานไม่สำเร็จ");
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-[880px] flex items-stretch rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.08),0_16px_40px_-8px_rgba(15,23,42,0.18)]">
        <div className="hidden lg:flex"><AuthBrandPanel /></div>
        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-12 bg-white dark:bg-surface">
        <div className="w-full max-w-[360px]">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="font-sans text-[16px] font-semibold text-ink">เลือกหน่วยงาน</h2>
            <button onClick={logout} className="font-sans text-[12.5px] text-ink-faint hover:text-ink hover:underline">
              ออกจากระบบ
            </button>
          </div>
          {user && (
            <p className="font-sans text-[13px] text-ink-faint mb-6">เข้าสู่ระบบเป็น {user.name} ({user.email})</p>
          )}

          {departments.length > 0 && (
            <div className="space-y-2 mb-5">
              {departments.map(d=>(
                <button
                  key={d.slug} onClick={()=>onPick(d)}
                  className="w-full text-left rounded-md bg-white dark:bg-surface ring-1 ring-inset ring-line hover:ring-primary hover:bg-primary-soft px-3.5 py-2.5 transition-colors"
                >
                  <div className="font-sans text-[14px] font-medium text-ink">{d.name}</div>
                  <div className="font-sans text-[12px] text-ink-faint">
                    {d.role === "admin" ? "ผู้ดูแลหน่วยงาน" : "สมาชิก"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!creating ? (
            <button
              type="button" onClick={()=>setCreating(true)}
              className="w-full text-center font-sans text-[13px] text-primary hover:underline"
            >
              + สร้างหน่วยงานใหม่
            </button>
          ) : (
            <form onSubmit={submitCreate} className="space-y-4 pt-4 border-t border-line/70">
              <div>
                <label className="block font-sans text-[12.5px] text-ink-soft mb-1.5">ชื่อหน่วยงาน</label>
                <input
                  type="text" required value={name} onChange={e=>setName(e.target.value)}
                  placeholder="เช่น ส่วนวิศวกรรมระบบเก็บเงินค่าผ่านทาง"
                  className="w-full h-10 rounded-md bg-white dark:bg-white/[0.04] px-3 text-[14px] font-sans text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
                />
              </div>
              {error && <p className="font-sans text-[12.5px] text-danger">{error}</p>}
              <div className="flex gap-2">
                {departments.length > 0 && (
                  <Button type="button" variant="secondary" className="flex-1" onClick={()=>{ setCreating(false); setError(""); }}>
                    ยกเลิก
                  </Button>
                )}
                <Button type="submit" variant="primary" className="flex-1" disabled={busy}>
                  {busy ? "กำลังสร้าง..." : "สร้างหน่วยงาน"}
                </Button>
              </div>
            </form>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
