// Talks to the FastAPI + SQLite backend (see /backend) for persistence, so
// data lives in a real database and is shared across devices/browsers.
export { API_BASE_URL } from "./apiBase";
import { authFetch } from "./auth";

export const storage = {
  async get(key){
    const res = await authFetch(`/api/storage/${encodeURIComponent(key)}`);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error(`storage.get(${key}) failed: HTTP ${res.status}`);
    return res.json(); // {key, value}
  },
  async set(key, value){
    const res = await authFetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({value})
    });
    if(!res.ok) throw new Error(`storage.set(${key}) failed: HTTP ${res.status}`);
    return res.json(); // {key, value}
  }
};
