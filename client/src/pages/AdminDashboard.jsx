import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  BarChart3,
  Loader,
  LogOut,
  Users,
  UserRound,
  Zap,
  TrendingUp,
  Server,
  ShieldAlert,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";
import { getAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "Admin";

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        setError("");

        // Load analytics
        try {
          const analyticsData = await getAnalyticsOverview();
          setAnalytics(analyticsData);
        } catch {
          setAnalytics(null);
        }

        // Check system health
        try {
          const response = await api.get("/health");
          setSystemHealth({
            status: "healthy",
            database: response.data.database,
            timestamp: new Date().toISOString(),
          });
        } catch {
          setSystemHealth({
            status: "degraded",
            database: "disconnected",
            timestamp: new Date().toISOString(),
          });
        }

        // Load recent users (if endpoint exists)
        try {
          const response = await api.get("/users/recent", {
            params: { limit: 10 },
          });
          setRecentUsers(response.data.users || []);
        } catch {
          setRecentUsers([]);
        }
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Failed to load dashboard data. Please refresh the page."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-12 w-12 animate-spin text-amber-500" />
          <p className="text-slate-400">Loading system dashboard...</p>
        </div>
      </div>
    );
  }

  const totalUsers = analytics?.total_users || 0;
  const totalCourses = analytics?.total_courses || 0;
  const totalEnrollments = analytics?.total_enrollments || 0;

  const studentCount = analytics?.student_count || 0;
  const instructorCount = analytics?.instructor_count || 0;
  const adminCount = analytics?.admin_count || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/admin-dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              LearnSphere
            </span>
          </Link>

          <nav className="hidden items-center gap-2 sm:flex">
            <Link
              to="/courses"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <BookOpen className="h-4 w-4" />
              Courses
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <NotificationBell />

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.full_name}</p>
              <p className="text-xs text-slate-400">Administrator</p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-5 w-5 text-amber-300" />
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Welcome Section */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-amber-600/20 via-slate-900 to-orange-600/10 p-7 sm:p-10 lg:p-14 mb-10">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              <Zap className="h-4 w-4" />
              ADMINISTRATION PANEL
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              Welcome, {firstName}!
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Monitor platform activity, manage users and courses, and oversee
              all system operations.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300">
                <Server className="h-5 w-5" />
                System{" "}
                {systemHealth?.status === "healthy" ? "Healthy" : "Degraded"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <ShieldAlert className="h-5 w-5" />
                Full Platform Access
              </span>
            </div>
          </div>
        </section>

        {/* Key Metrics Grid */}
        <div className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Users</p>
                <p className="mt-2 text-3xl font-bold">{totalUsers}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Courses</p>
                <p className="mt-2 text-3xl font-bold">{totalCourses}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <BookOpen className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Enrollments</p>
                <p className="mt-2 text-3xl font-bold">{totalEnrollments}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Activity</p>
                <p className="mt-2 text-3xl font-bold">Live</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <Activity className="h-6 w-6" />
              </div>
            </div>
          </article>
        </div>

        {/* User Role Distribution */}
        <div className="mb-10 grid gap-5 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Students</p>
                <p className="mt-2 text-3xl font-bold">{studentCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Instructors</p>
                <p className="mt-2 text-3xl font-bold">{instructorCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <BookOpen className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Administrators</p>
                <p className="mt-2 text-3xl font-bold">{adminCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
            </div>
          </article>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* Platform Overview */}
            <section className="mb-10">
              <div className="mb-6">
                <p className="text-sm font-semibold text-amber-300">
                  PLATFORM OVERVIEW
                </p>
                <h2 className="mt-2 text-2xl font-bold">System Statistics</h2>
              </div>

              <div className="space-y-4">
                <article className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Course Distribution</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Courses by status across the platform
                      </p>
                    </div>
                    <BookOpen className="h-6 w-6 text-amber-400" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Published</span>
                      <span className="font-semibold">
                        {analytics?.published_courses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Draft</span>
                      <span className="font-semibold">
                        {analytics?.draft_courses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Archived</span>
                      <span className="font-semibold">
                        {analytics?.archived_courses || 0}
                      </span>
                    </div>
                  </div>
                </article>

                <article className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Platform Health</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        System status and connectivity
                      </p>
                    </div>
                    <Server className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">
                        API Status
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          systemHealth?.status === "healthy"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {systemHealth?.status === "healthy"
                          ? "Running"
                          : "Degraded"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">
                        Database
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          systemHealth?.database === "connected"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {systemHealth?.database === "connected"
                          ? "Connected"
                          : "Disconnected"}
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside>
            {/* Admin Actions */}
            <section className="mb-8 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h3 className="font-semibold mb-4">Administration</h3>
              <nav className="space-y-2">
                <Link
                  to="/courses"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Manage Courses
                </Link>
                <Link
                  to="/analytics"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  View Analytics
                </Link>
                <Link
                  to="/notifications"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  System Notifications
                </Link>
              </nav>
            </section>

            {/* System Info */}
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h3 className="font-semibold mb-4">System Information</h3>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-slate-800/50 p-3">
                  <p className="text-slate-400">Platform Version</p>
                  <p className="mt-1 font-semibold">1.0.0</p>
                </div>
                <div className="rounded-lg bg-slate-800/50 p-3">
                  <p className="text-slate-400">Last Check</p>
                  <p className="mt-1 font-semibold text-xs">
                    {systemHealth?.timestamp
                      ? new Date(systemHealth.timestamp).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="relative mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} LearnSphere LMS</p>
          <p className="flex items-center gap-2">
            System Oversight & Management
            <ArrowRight className="h-4 w-4" />
          </p>
        </footer>
      </main>
    </div>
  );
}
