// Configure via a Vite env var: create frontend-react/.env(.local) with
//   VITE_API_BASE_URL=https://your-backend.example.com
// Defaults to localhost:8000 for local dev.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
