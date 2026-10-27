import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";
import DashboardSidebar from "./DashboardSidebar";
import { useAuth } from "../context/AuthContext";

const roleTitles = {
  student: "Student workspace",
  instructor: "Instructor workspace",
  admin: "Administrator workspace",
};

export default function RoleWorkspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const title = roleTitles[user?.role] || "LearnSphere workspace";

  function handleAction(action) {
    if (action === "logout") {
      logout();
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <DashboardSidebar
        role={user?.role}
        responsive
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        onAction={handleAction}
        onClose={() => setMobileOpen(false)}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">LearnSphere</p>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                {title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-slate-600 sm:block">
              {user?.full_name}
            </span>
            <button
              type="button"
              onClick={() => handleAction("logout")}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
