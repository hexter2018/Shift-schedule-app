// Talks to the approval-workflow endpoints added in backend/approvals.py.
import { API_BASE_URL } from "./storage";

export async function submitForApproval(scheduleKey, { sectionManagerEmail, divisionManagerEmail, createdBy }){
  const res = await fetch(`${API_BASE_URL}/api/schedules/${encodeURIComponent(scheduleKey)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sectionManagerEmail, divisionManagerEmail, createdBy }),
  });
  const data = await res.json().catch(()=>null);
  if(!res.ok){
    const detail = data && data.detail;
    throw new Error(typeof detail === "string" ? detail : `ส่งไม่สำเร็จ (HTTP ${res.status})`);
  }
  return data; // {cycleId, status}
}

export async function getApprovalStatus(scheduleKey){
  const res = await fetch(`${API_BASE_URL}/api/schedules/${encodeURIComponent(scheduleKey)}/approval-status`);
  if(!res.ok) throw new Error(`approval-status failed: HTTP ${res.status}`);
  return res.json();
}

export function approvedFileUrl(scheduleKey){
  return `${API_BASE_URL}/api/schedules/${encodeURIComponent(scheduleKey)}/approved-file`;
}

// Statuses where the schedule should be treated as read-only in the UI —
// a manager may be reviewing the pending file over email right now, so
// editing underneath them would mean the signed document doesn't match
// what they actually looked at.
export const LOCKED_STATUSES = new Set(["pending_section", "pending_division"]);
