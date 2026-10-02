// Talks to backend/departments.py.
import { authFetch } from "./auth";

async function parseErrorDetail(res, fallback){
  const data = await res.json().catch(()=>null);
  const detail = data && data.detail;
  return typeof detail === "string" ? detail : fallback;
}

export async function listMyDepartments(){
  const res = await authFetch("/api/departments");
  if(!res.ok) throw new Error(await parseErrorDetail(res, `โหลดหน่วยงานไม่สำเร็จ (HTTP ${res.status})`));
  const data = await res.json();
  return data.departments; // [{id, name, slug, role}]
}

export async function createDepartment(name){
  const res = await authFetch("/api/departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if(!res.ok) throw new Error(await parseErrorDetail(res, `สร้างหน่วยงานไม่สำเร็จ (HTTP ${res.status})`));
  return res.json(); // {id, name, slug, role}
}

export async function listMembers(slug){
  const res = await authFetch(`/api/departments/${encodeURIComponent(slug)}/members`);
  if(!res.ok) throw new Error(await parseErrorDetail(res, `โหลดรายชื่อสมาชิกไม่สำเร็จ (HTTP ${res.status})`));
  const data = await res.json();
  return data.members; // [{email, role, added_at}]
}

export async function addMember(slug, email, role){
  const res = await authFetch(`/api/departments/${encodeURIComponent(slug)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  if(!res.ok) throw new Error(await parseErrorDetail(res, `เพิ่มสมาชิกไม่สำเร็จ (HTTP ${res.status})`));
  return res.json();
}

export async function removeMember(slug, email){
  const res = await authFetch(`/api/departments/${encodeURIComponent(slug)}/members/${encodeURIComponent(email)}`, {
    method: "DELETE",
  });
  if(!res.ok) throw new Error(await parseErrorDetail(res, `ลบสมาชิกไม่สำเร็จ (HTTP ${res.status})`));
  return res.json();
}
