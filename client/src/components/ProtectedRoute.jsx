import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BookOpen, LoaderCircle } from "lucide-react";

export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-2xl bg-indigo-500/15 p-4">
          <BookOpen className="h-9 w-9 text-indigo-400" />
        </div>
        <LoaderCircle className="h-6 w-6 animate-spin text-indigo-400" />
        <p className="text-sm text-slate-400">
          Loading your LearnSphere workspace...
        </p>
      </div>
    </div>
  );
}

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return <Outlet />;
}

export function RoleRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;

  if (!user) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}