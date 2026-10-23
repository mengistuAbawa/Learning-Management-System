import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem("learnsphere_token");
    setUser(null);
  }, []);

  // Verify an existing token against the backend on application startup.
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const token = sessionStorage.getItem("learnsphere_token");

      if (!token) {
        if (active) setLoading(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");

        if (active) {
          setUser(response.data.user);
        }
      } catch {
        sessionStorage.removeItem("learnsphere_token");

        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    const handleUnauthorized = () => {
      if (active) {
        setUser(null);
        setLoading(false);
      }
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      active = false;
      window.removeEventListener(
        "auth:unauthorized",
        handleUnauthorized
      );
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await api.post("/auth/login", credentials);
    const { token, user: authenticatedUser } = response.data;

    sessionStorage.setItem("learnsphere_token", token);
    setUser(authenticatedUser);

    return authenticatedUser;
  }, []);

  const register = useCallback(async (details) => {
    const response = await api.post("/auth/register", details);
    const { token, user: registeredUser } = response.data;

    sessionStorage.setItem("learnsphere_token", token);
    setUser(registeredUser);

    return registeredUser;
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
    }),
    [user, loading, login, register, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }

  return context;
}