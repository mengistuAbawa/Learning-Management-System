import axios from "axios";
import { normalizeApiBaseURL } from "./apiBaseURL";

const api = axios.create({
  baseURL: normalizeApiBaseURL(
    import.meta.env.VITE_API_URL,
    import.meta.env.DEV,
  ),
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Attach the current session's JWT to API requests.
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("learnsphere_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// If a protected request returns 401, notify AuthContext.
// Don't redirect just because a login attempt has invalid credentials.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    const isAuthSubmission =
      url.includes("/auth/login") || url.includes("/auth/register");

    if (status === 401 && !isAuthSubmission) {
      sessionStorage.removeItem("learnsphere_token");
      window.dispatchEvent(new Event("auth:unauthorized"));
    }

    return Promise.reject(error);
  }
);

export default api;