// Talks to the FastAPI + SQLite backend (see /backend) for persistence, so
// data lives in a real database and is shared across devices/browsers.
//
// Configure via a Vite env var: create frontend-react/.env(.local) with
//   VITE_API_BASE_URL=https://your-backend.example.com
// Defaults to localhost:8000 for local dev.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const storage = {
  async get(key){
    const res = await fetch(`${API_BASE_URL}/api/storage/${encodeURIComponent(key)}`);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error(`storage.get(${key}) failed: HTTP ${res.status}`);
    return res.json(); // {key, value}
  },
  async set(key, value){
    const res = await fetch(`${API_BASE_URL}/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({value})
    });
    if(!res.ok) throw new Error(`storage.set(${key}) failed: HTTP ${res.status}`);
    return res.json(); // {key, value}
  }
};
