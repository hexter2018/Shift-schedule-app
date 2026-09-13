import { useEffect, useRef, useState, useCallback } from "react";
import { storage } from "./lib/storage";
import {
  THAI_MONTHS, PREV_TAIL_DAYS, RECENT_WINDOW_DAYS,
  PATTERN_KEY, HOLIDAY_KEY, ROTATION_KEY,
  uid, defaultState, ensureBuiltinCodes, defaultHolidays,
  storageKey, patternKeyFor, daysInMonth, nextMonthOf, prevMonthOf,
  parseCellValue, detectCycle, phaseValue,
  applyHolidayOverridesForMonth, applyGroupRotationsForMonth, fixThreeShiftGaps,
} from "./lib/logic";
import { exportExcel } from "./lib/excel";
import { downloadPDF } from "./lib/pdf";
import { submitForApproval, getApprovalStatus, LOCKED_STATUSES } from "./lib/approvals";

import Toolbar from "./components/Toolbar";
import ShiftCodeLegend from "./components/ShiftCodeLegend";
import HolidayPanel from "./components/HolidayPanel";
import GroupRotationPanel from "./components/GroupRotationPanel";
import GapFixPanel from "./components/GapFixPanel";
import CoverageList from "./components/CoverageList";
import PatternList from "./components/PatternList";
import ScheduleTable from "./components/ScheduleTable";
import ApprovalPanel from "./components/ApprovalPanel";
import Banner from "./components/ui/Banner";

function useTheme(){
  const [dark, setDark] = useState(()=>{
    if(typeof document !== "undefined") return document.documentElement.classList.contains("dark");
    return false;
  });
  useEffect(()=>{
    document.documentElement.classList.toggle("dark", dark);
    try{ localStorage.setItem("theme", dark ? "dark" : "light"); }catch{ /* ignore */ }
  }, [dark]);
  return [dark, ()=>setDark(d=>!d)];
}

export default function App(){
  // A single mutable store mirrors the original tool's module-global
  // variables (state / patternLib / holidays / groupRotations /
  // manualVacated / prevTail). Every mutation function below mutates this
  // object in place — exactly like the original — and then calls bump()
  // to force React to re-render, instead of the original's renderAll().
  // This keeps every scheduling/pattern/holiday algorithm identical to the
  // original tool; only the rendering layer changed to JSX.
  const store = useRef({
    state: null, // set once the initial load finishes
    patternLib: {},
    holidays: [],
    groupRotations: {},
    manualVacated: {},
    prevTail: {},
  });
  const [, setTick] = useState(0);
  const bump = useCallback(()=>{
    if(store.current.state) ensureBuiltinCodes(store.current.state);
    setTick(t=>t+1);
  }, []);

  const [dark, toggleDark] = useTheme();
  const [ready, setReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [analyzeMonthsBack, setAnalyzeMonthsBack] = useState(3);
  const [gapFixResult, setGapFixResult] = useState(null);
  const saveTimerRef = useRef(null);
  const captureRef = useRef(null);

  /* ---------- approval workflow ---------- */
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalSubmitError, setApprovalSubmitError] = useState(null);

  // Reads the *current* schedule key off the store ref rather than a prop —
  // this gets called from month-switch handlers where the ref has already
  // moved on to the new month by the time this runs, and from a polling
  // interval that must always check whatever month is currently showing,
  // not whatever month was showing when the interval was created.
  const refreshApprovalStatus = useCallback(async ()=>{
    if(!store.current.state) return;
    const key = storageKey(store.current.state.month, store.current.state.yearBE);
    try{
      const status = await getApprovalStatus(key);
      setApprovalStatus(status);
    }catch(err){
      console.error(err);
    }finally{
      setApprovalLoading(false);
    }
  }, []);

  const onSubmitApproval = useCallback(async (sectionManagerEmail, divisionManagerEmail)=>{
    const key = storageKey(store.current.state.month, store.current.state.yearBE);
    setApprovalSubmitting(true);
    setApprovalSubmitError(null);
    try{
      await submitForApproval(key, { sectionManagerEmail, divisionManagerEmail });
      await refreshApprovalStatus();
    }catch(err){
      setApprovalSubmitError(err.message);
    }finally{
      setApprovalSubmitting(false);
    }
  }, [refreshApprovalStatus]);

  // Poll periodically while mounted — a manager approving over email
  // happens completely outside this browser session, so the only way to
  // notice is to keep checking. 15s keeps the banner reasonably live
  // without hammering the backend.
  useEffect(()=>{
    if(!ready) return;
    refreshApprovalStatus();
    const interval = setInterval(refreshApprovalStatus, 15000);
    return ()=> clearInterval(interval);
  }, [ready, refreshApprovalStatus]);

  const locked = !!(approvalStatus && LOCKED_STATUSES.has(approvalStatus.status));

  /* ---------- persistence (mirrors loadState/saveState/loadPatternLib/etc.) ---------- */
  const loadStateFor = useCallback(async (month, yearBE)=>{
    const key = storageKey(month, yearBE);
    try{
      const res = await storage.get(key);
      if(res && res.value) return JSON.parse(res.value);
    }catch(err){ /* not found or error */ }
    return null;
  }, []);

  const saveState = useCallback(async ()=>{
    try{
      const key = storageKey(store.current.state.month, store.current.state.yearBE);
      await storage.set(key, JSON.stringify(store.current.state));
      setStatusMsg("บันทึกแล้ว");
    }catch(err){
      setStatusMsg("บันทึกไม่สำเร็จ");
      console.error(err);
    }
  }, []);

  const scheduleSave = useCallback(()=>{
    setStatusMsg("กำลังแก้ไข…");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveState, 700);
  }, [saveState]);

  const savePatternLib = useCallback(async ()=>{
    try{ await storage.set(PATTERN_KEY, JSON.stringify(store.current.patternLib)); }
    catch(err){ console.error(err); }
  }, []);
  const saveHolidays = useCallback(async ()=>{
    try{ await storage.set(HOLIDAY_KEY, JSON.stringify(store.current.holidays)); }
    catch(err){ console.error(err); }
  }, []);
  const saveGroupRotations = useCallback(async ()=>{
    try{ await storage.set(ROTATION_KEY, JSON.stringify(store.current.groupRotations)); }
    catch(err){ console.error(err); }
  }, []);

  const loadPrevMonthTail = useCallback(async ()=>{
    const s = store.current;
    s.prevTail = {};
    const {month:pm, yearBE:py} = prevMonthOf(s.state.month, s.state.yearBE);
    const prevState = await loadStateFor(pm, py);
    if(!prevState || !prevState.employees) return;
    const pnd = daysInMonth(py, pm);
    const startDay = Math.max(1, pnd - PREV_TAIL_DAYS + 1);
    prevState.employees.forEach(emp=>{
      const key = patternKeyFor(emp);
      if(!key) return;
      const days = [];
      for(let d=startDay; d<=pnd; d++){
        days.push({ day:d, value:(emp.days[d] || "").trim().toUpperCase() });
      }
      s.prevTail[key] = { days, month:pm, yearBE:py };
    });
  }, [loadStateFor]);

  const initRanRef = useRef(false);

  /* ---------- initial load ---------- */
  useEffect(()=>{
    // React 19 StrictMode intentionally double-invokes effects in dev to
    // surface missing cleanup. This effect has nothing to clean up (it's a
    // one-time initial load), so the second invocation would just re-fetch
    // everything and double up the console/network noise — guard against it.
    if(initRanRef.current) return;
    initRanRef.current = true;
    (async ()=>{
      const s = store.current;
      try{ const res = await storage.get(PATTERN_KEY); if(res && res.value) s.patternLib = JSON.parse(res.value); }
      catch(err){ s.patternLib = {}; }
      try{ const res = await storage.get(HOLIDAY_KEY); if(res && res.value) s.holidays = JSON.parse(res.value); }
      catch(err){ s.holidays = []; }
      try{ const res = await storage.get(ROTATION_KEY); if(res && res.value) s.groupRotations = JSON.parse(res.value); }
      catch(err){ s.groupRotations = {}; }

      const initial = defaultState();
      const loaded = await loadStateFor(initial.month, initial.yearBE);
      s.state = loaded || initial;
      ensureBuiltinCodes(s.state);
      await loadPrevMonthTail();
      setReady(true);
      bump();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- top controls ---------- */
  const switchMonth = useCallback(async (month, yearBE)=>{
    setStatusMsg("กำลังโหลด…");
    const s = store.current;
    const loaded = await loadStateFor(month, yearBE);
    if(loaded){
      s.state = loaded;
    } else {
      s.state = {
        department: s.state.department,
        month, yearBE,
        autoGenerated:false,
        shiftCodes: JSON.parse(JSON.stringify(s.state.shiftCodes)),
        employees: []
      };
    }
    await loadPrevMonthTail();
    setStatusMsg("");
    bump();
    refreshApprovalStatus();
  }, [loadStateFor, loadPrevMonthTail, bump, refreshApprovalStatus]);
  const onDeptChange = (v)=>{ store.current.state.department = v; bump(); scheduleSave(); };
  const onMonthChange = (m)=> switchMonth(m, store.current.state.yearBE);
  const onYearChange = (y)=>{ if(y && y>2400 && y<2700) switchMonth(store.current.state.month, y); };

  const addEmployee = ()=>{
    store.current.state.employees.push({id:uid(), empCode:"", name:"", note:"", days:{}, autoFlags:{}});
    bump(); scheduleSave();
  };

  /* ---------- shift codes ---------- */
  const onChangeCode = (i, next)=>{ store.current.state.shiftCodes[i] = next; bump(); scheduleSave(); };
  const onRemoveCode = (i)=>{
    const c = store.current.state.shiftCodes[i];
    store.current.state.shiftCodes = store.current.state.shiftCodes.filter(x=>x!==c);
    bump(); scheduleSave();
  };
  const onAddCode = ()=>{
    store.current.state.shiftCodes.push({code:"NEW", start:"", end:"", color:"#57534e"});
    bump(); scheduleSave();
  };

  /* ---------- holidays ---------- */
  const runHolidayOverrides = useCallback((prefix)=>{
    const s = store.current;
    const {converted, compensated, unplaced} = applyHolidayOverridesForMonth(s.state, s.holidays);
    bump(); scheduleSave();
    let msg = prefix || "";
    if(converted || compensated || unplaced){
      msg += ` ปรับกะเป็น TH แล้ว ${converted} ช่อง`;
      if(compensated) msg += `, เพิ่มวันหยุดชดเชย ${compensated} คน`;
      if(unplaced) msg += `, หาวันชดเชยไม่ได้ ${unplaced} คน (กรุณาเพิ่มเอง)`;
    } else {
      msg += " ไม่มีช่องที่ต้องปรับเพิ่มเติม";
    }
    setStatusMsg(msg.trim());
  }, [bump, scheduleSave]);

  const onAddHoliday = (dateVal, nameVal, recurring)=>{
    const [y, m, d] = dateVal.split("-").map(Number);
    const yearBE = y + 543;
    store.current.holidays.push({id:uid(), month:m, day:d, year: recurring ? null : yearBE, name:nameVal});
    saveHolidays();
    runHolidayOverrides("เพิ่มวันหยุดแล้ว —");
  };
  const onRenameHoliday = (id, name)=>{
    const h = store.current.holidays.find(x=>x.id===id);
    if(h) h.name = name;
    saveHolidays(); bump();
  };
  const onRemoveHoliday = (id)=>{
    store.current.holidays = store.current.holidays.filter(x=>x.id!==id);
    saveHolidays(); bump();
  };
  const onLoadDefaults = ()=>{
    const existing = new Set(store.current.holidays.map(h=>`${h.month}-${h.day}-${h.year||"r"}`));
    defaultHolidays().forEach(h=>{
      const sig = `${h.month}-${h.day}-r`;
      if(!existing.has(sig)) store.current.holidays.push(h);
    });
    saveHolidays();
    runHolidayOverrides("โหลดวันหยุดราชการทั่วไปแล้ว —");
  };
  const onApplyHolidays = ()=> runHolidayOverrides("");

  /* ---------- group rotations ---------- */
  const onAddGroup = ()=>{
    const s = store.current;
    let i=1, key = "GROUP"+i;
    while(s.groupRotations[key]){ i++; key = "GROUP"+i; }
    s.groupRotations[key] = { anchorYearBE: s.state.yearBE, anchorMonth: s.state.month, anchorStartDay: 0, stepDays: 2, memberKeys: [] };
    saveGroupRotations(); bump();
  };
  const onRenameGroup = (key, newKeyRaw)=>{
    const s = store.current;
    const newKey = newKeyRaw.trim().toUpperCase();
    if(!newKey || newKey===key){ bump(); return; }
    if(s.groupRotations[newKey]){
      setStatusMsg(`มีชุด "${newKey}" อยู่แล้ว`);
      bump();
      return;
    }
    s.groupRotations[newKey] = s.groupRotations[key];
    delete s.groupRotations[key];
    saveGroupRotations(); bump();
  };
  const onUpdateGroup = (key, patch)=>{
    Object.assign(store.current.groupRotations[key], patch);
    saveGroupRotations(); bump();
  };
  const onRemoveGroup = (key)=>{
    delete store.current.groupRotations[key];
    saveGroupRotations(); bump();
  };
  const onToggleMember = (key, empKey, checked)=>{
    const cfg = store.current.groupRotations[key];
    if(checked){
      if(!cfg.memberKeys.includes(empKey)) cfg.memberKeys.push(empKey);
    } else {
      cfg.memberKeys = cfg.memberKeys.filter(k=>k!==empKey);
    }
    saveGroupRotations(); bump();
  };
  const onQuickAdd = (key, shiftGroup)=>{
    const s = store.current;
    const cfg = s.groupRotations[key];
    s.state.employees.filter(emp=>(emp.shiftGroup||"").trim()===shiftGroup).forEach(emp=>{
      const empKey = patternKeyFor(emp);
      if(empKey && !cfg.memberKeys.includes(empKey)) cfg.memberKeys.push(empKey);
    });
    saveGroupRotations(); bump();
  };
  const onApplyRotation = ()=>{
    const s = store.current;
    const {placed, reverted, skippedHoliday, groupsApplied} = applyGroupRotationsForMonth(s.state, s.groupRotations, s.holidays);
    bump(); scheduleSave();
    if(groupsApplied.length===0){
      setStatusMsg(`ยังไม่มีกลุ่มที่ตั้งวันหยุดหมุนเวียนไว้ — กด "+ เพิ่มกลุ่ม" ก่อน`);
      return;
    }
    const THAI_WEEKDAYS_LOCAL = ["อา","จ","อ","พ","พฤ","ศ","ส"];
    const parts = groupsApplied.map(g=> `${g.group}: หยุด ${THAI_WEEKDAYS_LOCAL[g.pair[0]]}+${THAI_WEEKDAYS_LOCAL[g.pair[1]]}`);
    let msg = `ใช้วันหยุดหมุนเวียนแล้ว (${parts.join(", ")}) — ปรับ ${placed} ช่อง`;
    if(reverted) msg += `, ล้างวันหยุดเดิมที่ไม่ตรงรอบนี้ ${reverted} ช่อง`;
    if(skippedHoliday) msg += `, ข้าม ${skippedHoliday} วันเพราะตรงวันหยุดนักขัตฤกษ์`;
    setStatusMsg(msg);
  };

  /* ---------- gap fix (MM6/EE6) ---------- */
  const onFixGaps = ()=>{
    const s = store.current;
    const {converted, otWarnings, groupCount, log} = fixThreeShiftGaps(s.state);
    bump(); scheduleSave();
    if(groupCount === 0){
      setStatusMsg("ยังไม่มีพนักงานคนใดระบุ \"กลุ่มกะ\" ไว้ — ใส่กลุ่มใต้ชื่อพนักงานก่อน");
      setGapFixResult({log: []});
      return;
    }
    setStatusMsg(`ตรวจสอบ ${groupCount} กลุ่ม — ปรับกะแล้ว ${converted} ช่อง${otWarnings ? `, ต้องหาคนทำ OT อีก ${otWarnings} วัน` : ""}`);
    setGapFixResult({log});
  };
  const onAssignOtFromGap = (empId, day, base)=>{
    assignOt(empId, day, base);
    onFixGaps();
  };

  /* ---------- coverage / OT ---------- */
  const assignOt = (candidateEmpId, day, vacatedBase)=>{
    const emp = store.current.state.employees.find(e=>e.id===candidateEmpId);
    if(!emp) return;
    emp.days[day] = vacatedBase + "OT";
    if(emp.autoFlags) delete emp.autoFlags[day];
    bump(); scheduleSave();
  };
  const onUseVacated = (empId, day, val)=>{
    store.current.manualVacated[`${empId}:${day}`] = val;
    bump();
  };

  /* ---------- pattern analysis ---------- */
  const buildRecentWindowHistory = useCallback((empKey, srcMonth, srcYearBE, windowDays)=>{
    const s = store.current;
    if(srcMonth!==s.state.month || srcYearBE!==s.state.yearBE) return null;
    const nd = daysInMonth(srcYearBE, srcMonth);
    const startDay = Math.max(1, nd - windowDays + 1);
    const emp = s.state.employees.find(e=>patternKeyFor(e)===empKey);
    if(!emp) return null;
    const arr = [];
    for(let d=startDay; d<=nd; d++) arr.push((emp.days[d]||"").trim().toUpperCase());
    return {arr, anchorYearBE: srcYearBE, anchorMonth: srcMonth, anchorDay: startDay};
  }, []);

  const buildEmployeeHistory = useCallback(async (empKey, endMonth, endYearBE, maxMonthsBack)=>{
    const s = store.current;
    let month = endMonth, yearBE = endYearBE;
    const monthList = [];
    for(let i=0; i<maxMonthsBack; i++){
      const isCurrent = (month===s.state.month && yearBE===s.state.yearBE);
      const st = isCurrent ? s.state : await loadStateFor(month, yearBE);
      if(!st) break;
      monthList.unshift({month, yearBE, st});
      if(month===1){ month=12; yearBE-=1; } else { month -= 1; }
    }
    if(monthList.length===0) return null;
    const arr = [];
    monthList.forEach(({month:m, yearBE:y, st})=>{
      const nd = daysInMonth(y, m);
      const emp = st.employees.find(e=>patternKeyFor(e)===empKey);
      for(let d=1; d<=nd; d++) arr.push(emp ? (emp.days[d]||"").trim().toUpperCase() : "");
    });
    return {arr, anchorYearBE: monthList[0].yearBE, anchorMonth: monthList[0].month, anchorDay: 1, monthsUsed: monthList.length};
  }, [loadStateFor]);

  const analyzePatterns = useCallback(async ()=>{
    const s = store.current;
    const monthsBack = analyzeMonthsBack || 3;
    let analyzed = 0, failed = [], monthsSeen = 1;
    for(const emp of s.state.employees){
      const key = patternKeyFor(emp);
      if(!key) continue;
      const history = await buildEmployeeHistory(key, s.state.month, s.state.yearBE, monthsBack);
      if(!history){ failed.push(emp.name || emp.empCode || "(ไม่ระบุชื่อ)"); continue; }
      monthsSeen = Math.max(monthsSeen, history.monthsUsed);
      const result = detectCycle(history.arr);
      if(!result){ failed.push(emp.name || emp.empCode || "(ไม่ระบุชื่อ)"); continue; }
      s.patternLib[key] = {
        cycle: result.cycle, length: result.length,
        anchorYearBE: history.anchorYearBE, anchorMonth: history.anchorMonth, anchorDay: history.anchorDay,
        confidence: result.confidence, label: emp.name || emp.empCode
      };
      analyzed++;
    }
    await savePatternLib();
    bump();
    if(failed.length){
      setStatusMsg(`วิเคราะห์จากข้อมูลย้อนหลัง ${monthsSeen} เดือน — สำเร็จ ${analyzed} คน (ข้อมูลไม่พอ: ${failed.join(", ")})`);
    } else {
      setStatusMsg(`วิเคราะห์จากข้อมูลย้อนหลัง ${monthsSeen} เดือน สำเร็จ ${analyzed} คน`);
    }
  }, [analyzeMonthsBack, buildEmployeeHistory, savePatternLib, bump]);

  const onClearPattern = (key)=>{
    delete store.current.patternLib[key];
    savePatternLib(); bump();
  };

  const generateNextMonth = useCallback(async ()=>{
    const s = store.current;
    const {month: nm, yearBE: ny} = nextMonthOf(s.state.month, s.state.yearBE);
    const existing = await loadStateFor(nm, ny);
    if(existing && existing.employees && existing.employees.length > 0){
      s.state = existing;
      await loadPrevMonthTail();
      bump();
      refreshApprovalStatus();
      setStatusMsg("เดือนถัดไปมีข้อมูลอยู่แล้ว — โหลดให้แล้ว");
      return;
    }

    const monthsBack = analyzeMonthsBack || 3;
    for(const emp of s.state.employees){
      const key = patternKeyFor(emp);
      if(!key) continue;

      const recent = buildRecentWindowHistory(key, s.state.month, s.state.yearBE, RECENT_WINDOW_DAYS);
      let result = recent ? detectCycle(recent.arr) : null;
      let anchorYearBE = recent ? recent.anchorYearBE : s.state.yearBE;
      let anchorMonth = recent ? recent.anchorMonth : s.state.month;
      let anchorDay = recent ? recent.anchorDay : 1;

      if(!result){
        const history = await buildEmployeeHistory(key, s.state.month, s.state.yearBE, monthsBack);
        if(history){
          result = detectCycle(history.arr);
          anchorYearBE = history.anchorYearBE;
          anchorMonth = history.anchorMonth;
          anchorDay = history.anchorDay;
        }
      }

      if(result){
        s.patternLib[key] = {
          cycle: result.cycle, length: result.length,
          anchorYearBE, anchorMonth, anchorDay,
          confidence: result.confidence, label: emp.name || emp.empCode
        };
      }
    }
    await savePatternLib();

    const ndNext = daysInMonth(ny, nm);
    const newEmployees = s.state.employees.map(emp=>{
      const key = patternKeyFor(emp);
      const pattern = key ? s.patternLib[key] : null;
      const days = {}, autoFlags = {};
      if(pattern){
        for(let d=1; d<=ndNext; d++){
          const v = phaseValue(pattern, ny, nm, d);
          if(v){ days[d]=v; autoFlags[d]=true; }
        }
      }
      return {id:uid(), empCode:emp.empCode, name:emp.name, note:emp.note, shiftGroup:emp.shiftGroup||"", excludeFromOt:!!emp.excludeFromOt, days, autoFlags};
    });

    s.state = {
      department: s.state.department,
      month: nm, yearBE: ny,
      autoGenerated: true,
      shiftCodes: JSON.parse(JSON.stringify(s.state.shiftCodes)),
      employees: newEmployees
    };

    let holidayCount = 0;
    for(let d=1; d<=ndNext; d++){ if(s.holidays.find(h=>h.month===nm && h.day===d && (h.year===null||h.year===ny))) holidayCount++; }
    const { converted, compensated, unplaced } = applyHolidayOverridesForMonth(s.state, s.holidays);

    await loadPrevMonthTail();
    bump();
    await saveState();
    refreshApprovalStatus();

    let msg = "สร้างตารางเดือนถัดไปแล้ว (อ้างอิงย้อนหลัง 21 วันล่าสุด)";
    if(holidayCount>0){
      msg += ` — พบวันหยุดนักขัตฤกษ์ ${holidayCount} วัน ปรับกะเป็นวันหยุด ${converted} รายการ`;
      if(compensated>0) msg += `, จัดวันหยุดชดเชยให้ ${compensated} รายการ`;
      if(unplaced>0) msg += `, หาวันว่างให้วันหยุดชดเชยไม่ได้ ${unplaced} รายการ (โปรดตรวจสอบเอง)`;
    } else {
      msg += " — เดือนนี้ไม่มีวันหยุดนักขัตฤกษ์";
    }
    setStatusMsg(msg);
  }, [analyzeMonthsBack, buildRecentWindowHistory, buildEmployeeHistory, savePatternLib, loadPrevMonthTail, loadStateFor, saveState, bump, refreshApprovalStatus]);

  const markAllReviewed = ()=>{
    store.current.state.employees.forEach(emp=>{ emp.autoFlags = {}; });
    store.current.state.autoGenerated = false;
    bump(); scheduleSave();
  };

  /* ---------- table cell edits ---------- */
  const onChangeDay = (empId, day, val)=>{
    const emp = store.current.state.employees.find(e=>e.id===empId);
    if(!emp) return;
    emp.days[day] = val;
    delete emp.autoFlags[day];
    if(emp.rotationFlags) delete emp.rotationFlags[day];
    bump(); scheduleSave();
  };
  const onEmployeeField = (empId, field, value)=>{
    const emp = store.current.state.employees.find(e=>e.id===empId);
    if(!emp) return;
    emp[field] = value;
    bump(); scheduleSave();
  };
  const onRemoveEmployee = (empId)=>{
    store.current.state.employees = store.current.state.employees.filter(x=>x.id!==empId);
    bump(); scheduleSave();
  };

  /* ---------- export ---------- */
  const onDownloadExcel = ()=>{
    try{
      exportExcel(store.current.state, store.current.holidays);
      setStatusMsg("ดาวน์โหลด Excel แล้ว");
    }catch(err){
      console.error(err);
      setStatusMsg("สร้างไฟล์ Excel ไม่สำเร็จ");
    }
  };
  const onDownloadPdf = async ()=>{
    if(!captureRef.current) return;
    setStatusMsg("กำลังสร้าง PDF…");
    try{
      await downloadPDF(captureRef.current, store.current.state);
      setStatusMsg("ดาวน์โหลด PDF แล้ว");
    }catch(err){
      console.error(err);
      setStatusMsg("สร้าง PDF ไม่สำเร็จ — ลองใช้ปุ่มพิมพ์แทน");
    }
  };
  const onPrint = ()=> window.print();

  if(!ready || !store.current.state){
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <span className="h-7 w-7 rounded-full border-2 border-line border-t-primary animate-spin" />
          <span className="font-sans text-sm text-ink-faint">กำลังโหลด…</span>
        </div>
      </div>
    );
  }

  const s = store.current;

  return (
    <div className="min-h-screen bg-canvas">
      <div style={locked ? {pointerEvents:"none", opacity:0.55, position:"relative"} : undefined}>
        <Toolbar
          state={s.state} statusMsg={statusMsg}
          analyzeMonthsBack={analyzeMonthsBack} setAnalyzeMonthsBack={setAnalyzeMonthsBack}
          onDeptChange={onDeptChange} onMonthChange={onMonthChange} onYearChange={onYearChange}
          onAddEmployee={addEmployee} onSave={saveState}
          onDownloadPdf={onDownloadPdf} onDownloadExcel={onDownloadExcel} onPrint={onPrint}
          onAnalyze={analyzePatterns} onGenerateNext={generateNextMonth} onMarkReviewed={markAllReviewed}
          dark={dark} onToggleDark={toggleDark}
        />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6 animate-fade-up">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-sans text-lg sm:text-xl font-semibold tracking-tight bg-gradient-to-r from-primary to-primary-bright bg-clip-text text-transparent">
              ตารางปฏิบัติงานประจำเดือน
            </h1>
            <p className="mt-0.5 text-[13px] font-sans text-ink-faint">
              กรอกตารางเดือนแรกให้ครบถ้วน ให้ระบบวิเคราะห์รูปแบบการหมุนกะ แล้วสร้างเดือนถัดไปได้อัตโนมัติ
            </p>
          </div>
        </div>

        <ApprovalPanel
          scheduleKey={storageKey(s.state.month, s.state.yearBE)}
          status={approvalStatus} loading={approvalLoading}
          onSubmit={onSubmitApproval} submitting={approvalSubmitting} submitError={approvalSubmitError}
        />

        {s.state.autoGenerated && (
          <Banner tone="warning" icon="⚠️" className="no-print">
            ตารางเดือนนี้สร้างจากรูปแบบของเดือนก่อนหน้าโดยอัตโนมัติ กรุณาตรวจสอบวันลา วันหยุดตามประเพณี และการเปลี่ยนแปลงอื่น ๆ
            (จุดสีส้มบนช่องที่ยังไม่ได้ตรวจสอบ)
          </Banner>
        )}

        <div style={locked ? {pointerEvents:"none", opacity:0.55, position:"relative"} : undefined}>
          <div className="space-y-6">
            {/* Settings/configuration — 2-column grid instead of a long
                vertical stack. These four panels each have their own wide
                internal rows (the per-group rotation detail row
                especially), so at lg (1024px) inside a 1280px-capped
                container each column lands around ~590px after gap/padding
                — narrow enough that GroupRotationPanel's row will wrap
                onto more lines than it did in the wider layout. It stays
                usable (everything flex-wraps, nothing clips/overflows),
                just visually busier — worth knowing if that panel looks
                more cramped than the rest. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <ShiftCodeLegend state={s.state} onChangeCode={onChangeCode} onRemoveCode={onRemoveCode} onAddCode={onAddCode} />
              <HolidayPanel
                holidays={s.holidays}
                onAddHoliday={onAddHoliday} onRenameHoliday={onRenameHoliday} onRemoveHoliday={onRemoveHoliday}
                onLoadDefaults={onLoadDefaults} onApplyHolidays={onApplyHolidays}
              />
              <GroupRotationPanel
                state={s.state} groupRotations={s.groupRotations}
                onAddGroup={onAddGroup} onRenameGroup={onRenameGroup} onUpdateGroup={onUpdateGroup}
                onRemoveGroup={onRemoveGroup} onToggleMember={onToggleMember} onQuickAdd={onQuickAdd}
                onApplyRotation={onApplyRotation}
              />
              <GapFixPanel onFixGaps={onFixGaps} gapFixResult={gapFixResult} onAssignOtFromGap={onAssignOtFromGap} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <CoverageList
                state={s.state} patternLib={s.patternLib} manualVacated={s.manualVacated}
                onUseVacated={onUseVacated} onAssignOt={assignOt}
              />
              <PatternList patternLib={s.patternLib} onClearPattern={onClearPattern} />
            </div>

            <ScheduleTable
              state={s.state} holidays={s.holidays} patternLib={s.patternLib} prevTail={s.prevTail}
              onChangeDay={onChangeDay} onEmployeeField={onEmployeeField}
              onRemoveEmployee={onRemoveEmployee} onAddEmployee={addEmployee}
              captureRef={captureRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
