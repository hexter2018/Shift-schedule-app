// Talks to the local email+password auth endpoints in backend/local_auth.py
// (see backend/auth.py for why this exists instead of Azure AD SSO).
import { API_BASE_URL } from "./apiBase";

const TOKEN_KEY = "auth-token-v1";
const USER_KEY = "auth-user-v1";

export function getToken(){ return localStorage.getItem(TOKEN_KEY); }
export function getStoredUser(){
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function storeSession(token, user){
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Department selection is only meaningful for whoever was signed in —
  // clear it too, so the next person to sign in on this browser doesn't
  // silently inherit the previous person's department choice.
  localStorage.removeItem("selected-department-v1");
  // logout() gets called from several unrelated places (the user menu,
  // the department picker, and authFetch's own automatic logout on an
  // expired/invalid token) — none of them have a direct line back to
  // App's React state to actually switch the screen back to the login
  // page. A custom event lets App listen once, centrally, rather than
  // every caller needing to know how to trigger a re-render itself.
  window.dispatchEvent(new Event("auth:logout"));
}

// Every other API module (storage.js, approvals.js, signatures, departments)
// should call through this instead of bare fetch() — attaches the bearer
// token automatically, and centralizes the "your session expired" handling
// in one place instead of every call site checking for 401 separately.
export async function authFetch(path, options = {}){
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if(token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if(res.status === 401){
    // The token is missing/expired/invalid — nothing this specific call
    // does can recover from that, so clear the stale session and let the
    // app's own logged-in check redirect to the login screen on next render.
    logout();
  }
  return res;
}

async function parseErrorDetail(res, fallback){
  const data = await res.json().catch(()=>null);
  const detail = data && data.detail;
  return typeof detail === "string" ? detail : fallback;
}

export async function register(email, password, name){
  const res = await authFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if(!res.ok) throw new Error(await parseErrorDetail(res, `สมัครสมาชิกไม่สำเร็จ (HTTP ${res.status})`));
  const data = await res.json();
  storeSession(data.token, { email: data.email, name: data.name });
  return data;
}

export async function login(email, password){
  const res = await authFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if(!res.ok) throw new Error(await parseErrorDetail(res, `เข้าสู่ระบบไม่สำเร็จ (HTTP ${res.status})`));
  const data = await res.json();
  storeSession(data.token, { email: data.email, name: data.name });
  return data;
}
