import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, Menu, Settings } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import DashboardSidebar from "./DashboardSidebar";
import DashboardThemeToggle from "./DashboardThemeToggle";

export default function AdminWorkspace({ title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState("");
  const [darkTheme, setDarkTheme] = useState(
    () => localStorage.getItem("learnsphere-admin-theme") === "dark",
  );
  const [counts, setCounts] = useState({});
  const [notifications, setNotifications] = useState([]);
  const menuRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/users/instructors/pending"),
      api.get("/users/students/pending"),
      api.get("/notifications/unread-count"),
    ])
      .then(([instructorApprovals, studentApprovals, unread]) => {
        if (active) {
          setCounts({
            pendingApprovals:
              (instructorApprovals.data.instructors?.length || 0) +
              (studentApprovals.data.students?.length || 0),
            unreadNotifications: unread.data.unread_count || 0,
          });
        }
      })
      .catch(() => {
        if (active) setCounts({});
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("learnsphere-admin-theme", darkTheme ? "dark" : "light");
  }, [darkTheme]);

  useEffect(() => {
    function onPointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenu("");
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setMenu("");
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function toggleNotifications() {
    const nextMenu = menu === "notifications" ? "" : "notifications";
    setMenu(nextMenu);
    if (nextMenu) {
      try {
        const response = await api.get("/notifications", { params: { limit: 5 } });
        setNotifications(response.data.notifications || []);
      } catch {
        setNotifications([]);
      }
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initials = (user?.full_name || user?.name || "Administrator")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return (
    <div className={`admin-dashboard min-h-screen bg-slate-50 text-slate-900 lg:flex ${darkTheme ? "admin-dashboard-dark" : ""}`}>
      <DashboardSidebar
        role="admin"
        responsive
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        counts={counts}
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
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="hidden text-xs text-slate-500 sm:block">
                <Link to="/admin-dashboard" className="hover:text-indigo-700">Administration</Link>
                <span className="px-2" aria-hidden="true">/</span>
                <span className="text-slate-700">{title}</span>
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:mt-0.5 sm:text-xl">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2" ref={menuRef}>
            <div className="relative">
              <button
                type="button"
                onClick={toggleNotifications}
                className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                aria-label={`Notifications${counts.unreadNotifications ? `, ${counts.unreadNotifications} unread` : ""}`}
                aria-expanded={menu === "notifications"}
              >
                <Bell className="h-5 w-5" />
                {counts.unreadNotifications > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
                ) : null}
              </button>
              {menu === "notifications" ? (
                <div className="absolute right-0 mt-2 w-[min(90vw,360px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-semibold">Recent notifications</h2>
                    <Link to="/notifications" onClick={() => setMenu("")} className="text-xs font-medium text-indigo-700 hover:underline">View all</Link>
                  </div>
                  <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                    {notifications.length ? notifications.map((notification) => (
                      <li key={notification.id}>
                        <Link
                          to={notification.link_url || "/notifications"}
                          onClick={() => setMenu("")}
                          className="block px-4 py-3 hover:bg-slate-50"
                        >
                          <p className="text-sm font-medium text-slate-800">{notification.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{notification.message}</p>
                          <time className="mt-2 block text-[11px] text-slate-400" dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time>
                        </Link>
                      </li>
                    )) : <li className="px-4 py-6 text-center text-sm text-slate-500">No recent notifications.</li>}
                  </ul>
                </div>
              ) : null}
            </div>
            <DashboardThemeToggle
              darkTheme={darkTheme}
              onToggle={() => setDarkTheme((current) => !current)}
            />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((value) => value === "profile" ? "" : "profile")}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 sm:px-3"
                aria-expanded={menu === "profile"}
                aria-label="Open administrator profile menu"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">{initials}</span>
                <span className="hidden max-w-36 sm:block">
                  <span className="block truncate text-sm font-semibold">{user?.full_name || user?.name || "Administrator"}</span>
                  <span className="block text-xs capitalize text-slate-500">{user?.role || "admin"}</span>
                </span>
              </button>
              {menu === "profile" ? (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="truncate px-3 py-2 text-xs text-slate-500">{user?.email || ""}</p>
                  <Link to="/admin/settings" onClick={() => setMenu("")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Settings className="h-4 w-4" /> Account and platform settings
                  </Link>
                  <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
