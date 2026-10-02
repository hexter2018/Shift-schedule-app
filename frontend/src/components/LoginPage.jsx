import { useState } from "react";
import { login, register } from "../lib/auth";
import Button from "./ui/Button";
import AuthBrandPanel from "./AuthBrandPanel";

export default function LoginPage({ onSignedIn }){
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e)=>{
    e.preventDefault();
    setError("");
    setBusy(true);
    try{
      if(mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      onSignedIn();
    }catch(err){
      setError(err.message || "เกิดข้อผิดพลาด");
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-[880px] flex items-stretch rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.08),0_16px_40px_-8px_rgba(15,23,42,0.18)]">
        <div className="hidden lg:flex"><AuthBrandPanel /></div>
        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-12 bg-white dark:bg-surface">
        <div className="w-full max-w-[320px]">
          <div className="lg:hidden mb-8 text-center">
            <div className="text-[13px] font-sans font-semibold tracking-tight text-primary">BEM</div>
            <h1 className="mt-1 font-sans text-[22px] font-semibold text-ink">ระบบตารางกะ</h1>
          </div>

          <h2 className="font-sans text-[16px] font-semibold text-ink mb-0.5">
            {mode === "login" ? "เข้าสู่ระบบ" : "สร้างบัญชีใหม่"}
          </h2>
          <p className="font-sans text-[13px] text-ink-faint mb-6">
            {mode === "login" ? "เข้าสู่ระบบด้วยอีเมลของคุณ" : "กรอกข้อมูลเพื่อเริ่มใช้งาน"}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block font-sans text-[12.5px] text-ink-soft mb-1.5">ชื่อ-นามสกุล</label>
                <input
                  type="text" required value={name} onChange={e=>setName(e.target.value)}
                  className="w-full h-10 rounded-md bg-white dark:bg-white/[0.04] px-3 text-[14px] font-sans text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
                />
              </div>
            )}
            <div>
              <label className="block font-sans text-[12.5px] text-ink-soft mb-1.5">อีเมล</label>
              <input
                type="email" required value={email} onChange={e=>setEmail(e.target.value)}
                autoComplete="username"
                className="w-full h-10 rounded-md bg-white dark:bg-white/[0.04] px-3 text-[14px] font-sans text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
              />
            </div>
            <div>
              <label className="block font-sans text-[12.5px] text-ink-soft mb-1.5">รหัสผ่าน</label>
              <input
                type="password" required value={password} onChange={e=>setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                className="w-full h-10 rounded-md bg-white dark:bg-white/[0.04] px-3 text-[14px] font-sans text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
              />
              {mode === "register" && (
                <p className="mt-1.5 font-sans text-[11.5px] text-ink-faint">อย่างน้อย 8 ตัวอักษร</p>
              )}
            </div>

            {error && (
              <p className="font-sans text-[12.5px] text-danger">{error}</p>
            )}

            <Button type="submit" variant="primary" className="w-full !h-10" disabled={busy}>
              {busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </Button>
          </form>

          <button
            type="button"
            onClick={()=>{ setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="mt-5 w-full text-center font-sans text-[13px] text-primary hover:underline"
          >
            {mode === "login" ? "ยังไม่มีบัญชี? สมัครสมาชิก" : "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
