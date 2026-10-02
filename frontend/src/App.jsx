import { useEffect, useRef, useState, useCallback } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import Button from "./components/ui/Button";
import { storage } from "./lib/storage";
import {
  THAI_MONTHS, PREV_TAIL_DAYS, RECENT_WINDOW_DAYS,
  uid, defaultState, ensureBuiltinCodes, defaultHolidays,
  storageKey, patternKey, holidayKey, rotationKey, patternKeyFor, daysInMonth, nextMonthOf, prevMonthOf,
  parseCellValue, detectCycle, phaseValue,
  applyHolidayOverridesForMonth, applyGroupRotationsForMonth, fixThreeShiftGaps,
} from "./lib/logic";
import { exportExcel } from "./lib/excel";
import { parseScheduleWorkbook } from "./lib/excelImport";
import { downloadPDF } from "./lib/pdf";
import { LOCKED_STATUSES } from "./lib/approvals";
import { useApprovalStatus } from "./lib/useApprovalStatus";
import { getToken, getStoredUser, logout } from "./lib/auth";
import { listMyDepartments } from "./lib/departments";

import LoginPage from "./components/LoginPage";
import DepartmentPicker from "./components/DepartmentPicker";
import AuthBrandPanel from "./components/AuthBrandPanel";

import AppShell from "./components/layout/AppShell";
import ScheduleSubToolbar from "./components/ScheduleSubToolbar";
import SetupWorkspace from "./components/SetupWorkspace";
import ApprovalDrawer from "./components/ApprovalDrawer";
import ScheduleTable from "./components/ScheduleTable";
import DashboardOverview from "./components/DashboardOverview";
import ApprovalsWorkspace from "./components/pages/ApprovalsWorkspace";
import DepartmentsPage from "./components/pages/DepartmentsPage";
import ExportDataPage from "./components/pages/ExportDataPage";
import AddEditShiftDialog from "./components/AddEditShiftDialog";
import Banner from "./components/ui/Banner";
import ScheduleReview from "./components/ScheduleReview";
import AppErrorBoundary from "./components/AppErrorBoundary";

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

function ScheduleApp({ department, onSwitchDepartment, onSelectDepartment }){
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
  const [page, setPage] = useState("dashboard");
  const [scheduleSubTab, setScheduleSubTab] = useState("schedule");
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const bulkUndoRef = useRef(null);
  const [bulkUndoAvailable, setBulkUndoAvailable] = useState(false);
  const saveTimerRef = useRef(null);
  const captureRef = useRef(null);

  /* ---------- approval workflow ---------- */
  const {
    approvalStatus, approvalLoading, approvalSubmitting, approvalSubmitError,
    refreshApprovalStatus, onSubmitApproval,
  } = useApprovalStatus({ store, department, ready });

  const locked = !!(approvalStatus && LOCKED_STATUSES.has(approvalStatus.status));

  /* ---------- persistence (mirrors loadState/saveState/loadPatternLib/etc.) ---------- */
  const loadStateFor = useCallback(async (month, yearBE)=>{
    const key = storageKey(department.slug, month, yearBE);
    try{
      const res = await storage.get(key);
      if(res && res.value) return JSON.parse(res.value);
    }catch(err){ /* not found or error */ }
    return null;
  }, [department]);

  const saveState = useCallback(async ()=>{
    try{
      const key = storageKey(department.slug, store.current.state.month, store.current.state.yearBE);
      await storage.set(key, JSON.stringify(store.current.state));
      setStatusMsg("บันทึกแล้ว");
    }catch(err){
      setStatusMsg("บันทึกไม่สำเร็จ");
      console.error(err);
    }
  }, [department]);

  const scheduleSave = useCallback(()=>{
    setStatusMsg("กำลังแก้ไข…");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveState, 700);
  }, [saveState]);

  const savePatternLib = useCallback(async ()=>{
    try{ await storage.set(patternKey(department.slug), JSON.stringify(store.current.patternLib)); }
    catch(err){ console.error(err); }
  }, [department]);
  const saveHolidays = useCallback(async ()=>{
    try{ await storage.set(holidayKey(department.slug), JSON.stringify(store.current.holidays)); }
    catch(err){ console.error(err); }
  }, [department]);
  const saveGroupRotations = useCallback(async ()=>{
    try{ await storage.set(rotationKey(department.slug), JSON.stringify(store.current.groupRotations)); }
    catch(err){ console.error(err); }
  }, [department]);

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
      try{ const res = await storage.get(patternKey(department.slug)); if(res && res.value) s.patternLib = JSON.parse(res.value); }
      catch(err){ s.patternLib = {}; }
      try{ const res = await storage.get(holidayKey(department.slug)); if(res && res.value) s.holidays = JSON.parse(res.value); }
      catch(err){ s.holidays = []; }
      try{ const res = await storage.get(rotationKey(department.slug)); if(res && res.value) s.groupRotations = JSON.parse(res.value); }
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
  const onChangeModifierColor = (key, value)=>{ store.current.state[key] = value; bump(); scheduleSave(); };

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
    store.current.holidays = [...store.current.holidays, {id:uid(), month:m, day:d, year: recurring ? null : yearBE, name:nameVal}];
    saveHolidays();
    runHolidayOverrides("เพิ่มวันหยุดแล้ว —");
  };
  const onRenameHoliday = (id, name)=>{
    store.current.holidays = store.current.holidays.map(h=> h.id===id ? {...h, name} : h);
    saveHolidays(); bump();
  };
  const onRemoveHoliday = (id)=>{
    store.current.holidays = store.current.holidays.filter(x=>x.id!==id);
    saveHolidays(); bump();
  };
  const onLoadDefaults = ()=>{
    const existing = new Set(store.current.holidays.map(h=>`${h.month}-${h.day}-${h.year||"r"}`));
    const toAdd = defaultHolidays().filter(h=>!existing.has(`${h.month}-${h.day}-r`));
    store.current.holidays = [...store.current.holidays, ...toAdd];
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
  const onBulkAction = (action, items, value)=>{
    if(!items?.length) return;
    const snapshot = items.map(({empId, day})=>{
      const emp = store.current.state.employees.find(e=>e.id===empId);
      return {
        empId, day,
        value: emp?.days?.[day] || "",
        autoFlag: emp?.autoFlags?.[day],
        rotationFlag: emp?.rotationFlags?.[day],
      };
    }).filter(x=>x.empId);
    bulkUndoRef.current = snapshot;
    setBulkUndoAvailable(true);
    snapshot.forEach(({empId, day})=>{
      const emp = store.current.state.employees.find(e=>e.id===empId);
      if(!emp) return;
      if(action === "set-shift") {
        emp.days[day] = String(value || "").trim().toUpperCase();
        delete emp.autoFlags[day];
        if(emp.rotationFlags) delete emp.rotationFlags[day];
      } else if(action === "clear") {
        emp.days[day] = "";
        delete emp.autoFlags[day];
        if(emp.rotationFlags) delete emp.rotationFlags[day];
      } else if(action === "review") {
        delete emp.autoFlags[day];
      }
    });
    const labels = {"set-shift":`เปลี่ยนกะ ${snapshot.length} ช่องแล้ว`, clear:`ล้างกะ ${snapshot.length} ช่องแล้ว`, review:`ทำเครื่องหมายตรวจแล้ว ${snapshot.length} ช่อง`};
    setStatusMsg(labels[action] || "แก้ไขหลายช่องแล้ว");
    bump(); scheduleSave();
  };
  const onUndoBulk = ()=>{
    const snapshot = bulkUndoRef.current;
    if(!snapshot?.length) return;
    snapshot.forEach(({empId, day, value, autoFlag, rotationFlag})=>{
      const emp = store.current.state.employees.find(e=>e.id===empId);
      if(!emp) return;
      emp.days[day] = value;
      if(autoFlag) emp.autoFlags[day] = autoFlag; else delete emp.autoFlags[day];
      if(!emp.rotationFlags) emp.rotationFlags = {};
      if(rotationFlag) emp.rotationFlags[day] = rotationFlag; else delete emp.rotationFlags[day];
    });
    bulkUndoRef.current = null;
    setBulkUndoAvailable(false);
    setStatusMsg("ย้อนกลับการแก้ไขหลายช่องแล้ว");
    bump(); scheduleSave();
  };
  const onEmployeeField = (empId, field, value)=>{
    const emp = store.current.state.employees.find(e=>e.id===empId);
    if(!emp) return;
    emp[field] = value;
    bump(); scheduleSave();
  };
  const onChangeCellColor = (empId, day, color)=>{
    // A manual highlight, independent of the shift code in emp.days[day] —
    // never touches that field, only this separate per-day color map.
    const emp = store.current.state.employees.find(e=>e.id===empId);
    if(!emp) return;
    if(!emp.cellColors) emp.cellColors = {};
    if(color) emp.cellColors[day] = color;
    else delete emp.cellColors[day];
    bump(); scheduleSave();
  };
  const onChangeNoteColor = (empId, color)=>{
    // Same idea as onChangeCellColor, but the note column is one field per
    // employee (not per-day), so it's a plain property, not a day-keyed map.
    const emp = store.current.state.employees.find(e=>e.id===empId);
    if(!emp) return;
    if(color) emp.noteColor = color;
    else delete emp.noteColor;
    bump(); scheduleSave();
  };
  const onRemoveEmployee = (empId)=>{
    const emp = store.current.state.employees.find(x=>x.id===empId);
    if(!emp) return;
    const label = emp.name || emp.empCode || "พนักงานนี้";
    if(!window.confirm(`ลบ ${label} ออกจากตารางเดือนนี้หรือไม่?\n\nการลบจะเอาข้อมูลกะของพนักงานคนนี้ออกจากตารางด้วย`)) return;
    store.current.state.employees = store.current.state.employees.filter(x=>x.id!==empId);
    bump(); scheduleSave();
  };

  /* ---------- export ---------- */
  const onDownloadExcel = async ()=>{
    setStatusMsg("กำลังสร้างไฟล์ Excel...");
    try{
      await exportExcel(store.current.state, store.current.holidays);
      setStatusMsg("ดาวน์โหลด Excel แล้ว");
    }catch(err){
      console.error(err);
      setStatusMsg("สร้างไฟล์ Excel ไม่สำเร็จ");
    }
  };
  const onImportExcel = async (file)=>{
    if(!window.confirm(
      "นำเข้าไฟล์นี้จะแทนที่ข้อมูลตารางกะปัจจุบันทั้งหมด (พนักงาน, กะที่กรอกไว้, รหัสกะ) — ยืนยันหรือไม่?"
    )) return;
    setStatusMsg("กำลังนำเข้า...");
    try{
      const { state: imported, warnings } = await parseScheduleWorkbook(file);
      ensureBuiltinCodes(imported);
      store.current.state = imported;
      bump();
      await saveState();
      setStatusMsg(warnings.length ? "นำเข้าสำเร็จ (มีจุดต้องตรวจสอบ)" : "นำเข้าสำเร็จ");
      if(warnings.length) window.alert(warnings.join("\n\n"));
    }catch(err){
      console.error(err);
      setStatusMsg("นำเข้าไม่สำเร็จ");
      window.alert(err.message || "นำเข้าไฟล์ไม่สำเร็จ — ตรวจสอบว่าเป็นไฟล์ที่ระบบนี้สร้างไว้จริง");
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

  // Keep every hook before any conditional return. React requires the hook
  // order to be identical on the loading render and subsequent renders.
  const focusIssue = useCallback((issue)=>{
    setPage("schedule");
    setScheduleSubTab("schedule");
    if(!issue?.empId || !issue?.day) return;
    setFocusTarget({empId: issue.empId, day: issue.day, token: Date.now()});
  }, []);

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

  // Same computation CoverageList makes internally (count of LA cells that
  // still need someone assigned) — surfaced here too so the insights badge
  // has a number without duplicating CoverageList's own logic/props.
  const nd = daysInMonth(s.state.yearBE, s.state.month);
  let coverageCount = 0;
  s.state.employees.forEach(emp=>{
    for(let d=1; d<=nd; d++){
      if((emp.days[d]||"").trim().toUpperCase() === "LA") coverageCount++;
    }
  });

  // Phase 4 — deterministic pre-submission review. Only objective data
  // quality issues block submission; predicted/leave/OT items are attention
  // items so the manager can review them without being prevented from using
  // the existing approval workflow.
  const reviewIssues = [];
  const knownCodes = new Set(s.state.shiftCodes.map(c=>String(c.code).toUpperCase()));
  s.state.employees.forEach(emp=>{
    for(let d=1; d<=nd; d++){
      const raw = (emp.days[d] || "").trim().toUpperCase();
      if(!raw) continue;
      const base = raw.replace(/(OT|TH|WH)$/i, "");
      if(base !== "LA" && base !== "O" && !knownCodes.has(base)){
        reviewIssues.push({
          id:`invalid-${emp.id}-${d}`, level:"blocking", empId:emp.id, day:d,
          title:`${emp.name || emp.empCode || "ไม่ระบุพนักงาน"} · วันที่ ${d}`,
          detail:`พบรหัสกะ “${base}” ซึ่���ไม่มีอยู่ใน Master รหัสกะ`
        });
      }
      if(emp.autoFlags?.[d]){
        reviewIssues.push({
          id:`predicted-${emp.id}-${d}`, level:"attention", empId:emp.id, day:d,
          title:`${emp.name || emp.empCode || "ไม่ระบุพนักงาน"} · ว���นที่ ${d}`,
          detail:`กะ ${raw} เป็นค่าที่ระบบคาดการณ์จาก pattern — ควรตรวจสอบก่อนส่งอนุมัติ`
        });
      }
    }
  });
  // Avoid presenting a large OT list as individual errors; surface it as a
  // single review item because OT is valid data, not a validation failure.
  let otCells = 0;
  s.state.employees.forEach(emp=>Object.values(emp.days || {}).forEach(v=>{ if(/OT$/i.test(String(v).trim())) otCells++; }));
  if(otCells > 0){
    reviewIssues.push({id:"ot-summary", level:"attention", title:`พบ OT ${otCells} ช่อง`, detail:"ตรวจสอบความเหมาะสมของ OT และการจัดคนก่อนส่งอนุมัติ"});
  }

  const recheckReview = ()=>bump();

  const notifications = reviewIssues.slice(0, 6).map(i=>({ title: i.title, detail: i.detail }));
  const badges = { approvals: locked ? 1 : 0 };

  const shiftCodeList = Object.entries(s.state.shiftCodes || {}).map(([code, meta])=>({ code, ...meta }));

  return (
    <AppErrorBoundary>
      <AppShell
        page={page} onNavigate={setPage} badges={badges}
        departmentName={department.name} onSwitchDepartment={onSwitchDepartment}
        dark={dark} onToggleDark={toggleDark}
        statusMsg={statusMsg} onSave={saveState}
        onOpenApproval={()=>setApprovalDrawerOpen(true)}
        locked={page === "schedule" && locked}
        notifications={notifications}
      >
        {s.state.autoGenerated && page === "schedule" && (
          <div className="w-full px-3 sm:px-4 lg:px-6 pt-3">
            <Banner tone="warning" icon="⚠️" className="no-print">
              ตารางเดือนนี้สร้างจากรูปแบบของเดือนก่อนหน้าโดยอัตโนมัติ กรุณาตรวจสอบวันลา วันหยุดตามประเพณี และการเปลี่ยนแปลงอื่น ๆ
              (จุดสีส้มบนช่องที่ยังไม่ได้ตรวจสอบ)
            </Banner>
          </div>
        )}

        {page === "dashboard" && (
          <DashboardOverview
            state={s.state}
            holidays={s.holidays}
            approvalStatus={approvalStatus}
            onOpenRoster={()=>setPage("schedule")}
            onOpenApproval={()=>setApprovalDrawerOpen(true)}
            onFocusIssue={focusIssue}
          />
        )}

        {page === "schedule" && (
          <div
            className="flex flex-1 flex-col"
            style={locked ? { pointerEvents: "none", opacity: 0.55, position: "relative" } : undefined}
          >
            <Tabs.Root value={scheduleSubTab} onValueChange={setScheduleSubTab} className="flex flex-1 flex-col">
              <div className="flex items-center gap-1 border-b border-line bg-white px-3 no-print dark:bg-surface sm:px-6 lg:px-8">
                <Tabs.List className="flex gap-1 py-2">
                  <Tabs.Trigger value="schedule" className="rounded-md px-3 py-1.5 font-sans text-[13px] font-medium text-ink-faint data-[state=active]:bg-primary-soft data-[state=active]:text-primary">
                    ตารางกะ
                  </Tabs.Trigger>
                  <Tabs.Trigger value="setup" className="rounded-md px-3 py-1.5 font-sans text-[13px] font-medium text-ink-faint data-[state=active]:bg-primary-soft data-[state=active]:text-primary">
                    ตั้งค่ารหัสกะ / กลุ่มหมุนกะ
                  </Tabs.Trigger>
                </Tabs.List>
              </div>

              <Tabs.Content value="schedule" className="flex flex-1 flex-col">
                <ScheduleSubToolbar
                  analyzeMonthsBack={analyzeMonthsBack} setAnalyzeMonthsBack={setAnalyzeMonthsBack}
                  onAddEmployee={addEmployee}
                  onDownloadPdf={onDownloadPdf} onDownloadExcel={onDownloadExcel} onPrint={onPrint}
                  onImportExcel={onImportExcel}
                  onAnalyze={analyzePatterns} onGenerateNext={generateNextMonth} onMarkReviewed={markAllReviewed}
                  onAddShift={()=>setAddShiftOpen(true)}
                  departmentLabel={s.state.department}
                  onDeptLabelChange={onDeptChange}
                  month={s.state.month} yearBE={s.state.yearBE}
                  onMonthChange={onMonthChange} onYearChange={onYearChange}
                  currentDepartmentSlug={department.slug}
                  onSelectDepartment={onSelectDepartment}
                />
                <div className="w-full px-3 sm:px-4 lg:px-6 py-3">
                  <ScheduleTable
                    state={s.state} holidays={s.holidays} patternLib={s.patternLib} prevTail={s.prevTail}
                    onChangeDay={onChangeDay} onEmployeeField={onEmployeeField}
                    onRemoveEmployee={onRemoveEmployee} onAddEmployee={addEmployee}
                    onChangeCode={onChangeCode} onChangeModifierColor={onChangeModifierColor}
                    onChangeCellColor={onChangeCellColor} onChangeNoteColor={onChangeNoteColor}
                    captureRef={captureRef}
                    focusTarget={focusTarget}
                    onBulkAction={onBulkAction} onUndoBulk={onUndoBulk} bulkUndoAvailable={bulkUndoAvailable}
                  />
                </div>
              </Tabs.Content>

              <Tabs.Content value="setup" className="flex-1">
                <SetupWorkspace
                  state={s.state} holidays={s.holidays} groupRotations={s.groupRotations} gapFixResult={gapFixResult}
                  onChangeCode={onChangeCode} onRemoveCode={onRemoveCode} onAddCode={onAddCode}
                  onChangeModifierColor={onChangeModifierColor}
                  onAddHoliday={onAddHoliday} onRenameHoliday={onRenameHoliday} onRemoveHoliday={onRemoveHoliday}
                  onLoadDefaults={onLoadDefaults} onApplyHolidays={onApplyHolidays}
                  onAddGroup={onAddGroup} onRenameGroup={onRenameGroup} onUpdateGroup={onUpdateGroup}
                  onRemoveGroup={onRemoveGroup} onToggleMember={onToggleMember} onQuickAdd={onQuickAdd}
                  onApplyRotation={onApplyRotation}
                  onFixGaps={onFixGaps} onAssignOtFromGap={onAssignOtFromGap}
                />
              </Tabs.Content>
            </Tabs.Root>
          </div>
        )}

        {page === "approvals" && (
          <ApprovalsWorkspace
            currentDepartment={department}
            currentScheduleKey={storageKey(department.slug, s.state.month, s.state.yearBE)}
            currentMonth={s.state.month} currentYearBE={s.state.yearBE}
            approvalStatus={approvalStatus} approvalLoading={approvalLoading}
            onSubmitApproval={onSubmitApproval} approvalSubmitting={approvalSubmitting} approvalSubmitError={approvalSubmitError}
            reviewBlockingCount={reviewIssues.filter(x=>x.level === "blocking").length}
          />
        )}

        {page === "departments" && (
          <DepartmentsPage currentDepartment={department} onSelectDepartment={onSelectDepartment} />
        )}

        {page === "export" && (
          <ExportDataPage
            currentDepartment={department} currentMonth={s.state.month} currentYearBE={s.state.yearBE}
            onDownloadExcel={onDownloadExcel} onDownloadPdf={onDownloadPdf}
          />
        )}
      </AppShell>

      <ApprovalDrawer
        open={approvalDrawerOpen} onOpenChange={setApprovalDrawerOpen}
        scheduleKey={storageKey(department.slug, s.state.month, s.state.yearBE)}
        status={approvalStatus} loading={approvalLoading}
        onSubmit={onSubmitApproval} submitting={approvalSubmitting} submitError={approvalSubmitError}
        reviewContent={<ScheduleReview issues={reviewIssues} onRecheck={recheckReview} onBackToRoster={()=>{ setApprovalDrawerOpen(false); setPage("schedule"); setScheduleSubTab("schedule"); }} />}
        reviewBlockingCount={reviewIssues.filter(x=>x.level === "blocking").length}
      />

      <AddEditShiftDialog
        open={addShiftOpen} onOpenChange={setAddShiftOpen}
        employees={s.state.employees} shiftCodes={shiftCodeList} daysInMonth={daysInMonth(s.state.yearBE, s.state.month)}
        onSubmit={(empId, day, code)=>onChangeDay(empId, day, code)}
      />
    </AppErrorBoundary>
  );
}

const SELECTED_DEPT_KEY = "selected-department-v1";

export default function App(){
  const [authed, setAuthed] = useState(!!getToken());

  useEffect(()=>{
    const onLogout = ()=> setAuthed(false);
    window.addEventListener("auth:logout", onLogout);
    return ()=> window.removeEventListener("auth:logout", onLogout);
  }, []);
  const [departments, setDepartments] = useState(null); // null = not loaded yet
  const [department, setDepartment] = useState(()=>{
    try{
      const raw = localStorage.getItem(SELECTED_DEPT_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{ return null; }
  });
  const [deptError, setDeptError] = useState("");

  const [deptRetry, setDeptRetry] = useState(0);

  useEffect(()=>{
    if(!authed) return;
    let cancelled = false;
    setDeptError("");
    listMyDepartments()
      .then(list=>{
        if(cancelled) return;
        setDepartments(list);
        // The previously-selected department might no longer be valid
        // (removed as a member, or it never really existed on this
        // account) — re-validate against the real list rather than
        // trusting whatever's cached in localStorage.
        if(department && !list.some(d=>d.slug === department.slug)){
          setDepartment(null);
          localStorage.removeItem(SELECTED_DEPT_KEY);
        }
      })
      .catch(err=> setDeptError(err.message || "โหลดรายชื่อหน่วยงานไม่สำเร็จ"));
    return ()=>{ cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, deptRetry]);

  if(!authed){
    return <LoginPage onSignedIn={()=>setAuthed(true)} />;
  }

  if(departments === null){
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-[880px] flex items-stretch rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.08),0_16px_40px_-8px_rgba(15,23,42,0.18)]">
          <div className="hidden lg:flex"><AuthBrandPanel /></div>
          <div className="flex-1 flex items-center justify-center px-6 py-16 bg-white dark:bg-surface">
            {deptError ? (
              <div className="flex flex-col items-center gap-3 animate-fade-in max-w-[320px] text-center">
                <p className="font-sans text-[13px] text-danger">{deptError}</p>
                <Button variant="secondary" size="sm" onClick={()=>{ setDeptError(""); setDeptRetry(n=>n+1); }}>
                  ลองใหม่
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                <span className="h-7 w-7 rounded-full border-2 border-line border-t-primary animate-spin" />
                <span className="font-sans text-sm text-ink-faint">กำลังโหลด…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if(!department){
    return (
      <DepartmentPicker
        departments={departments}
        onPick={d=>{
          setDepartment(d);
          localStorage.setItem(SELECTED_DEPT_KEY, JSON.stringify(d));
        }}
        onCreated={d=>{
          setDepartments(prev=>[...prev, d]);
          setDepartment(d);
          localStorage.setItem(SELECTED_DEPT_KEY, JSON.stringify(d));
        }}
      />
    );
  }

  return (
    <ScheduleApp
      key={department.slug}
      department={department}
      onSwitchDepartment={()=>{
        setDepartment(null);
        localStorage.removeItem(SELECTED_DEPT_KEY);
      }}
      onSelectDepartment={(d)=>{
        setDepartment(d);
        localStorage.setItem(SELECTED_DEPT_KEY, JSON.stringify(d));
      }}
    />
  );
}
