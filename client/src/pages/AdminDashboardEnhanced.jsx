import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  BarChart3,
  CheckCircle2,
  Loader,
  LogOut,
  Users,
  UserRound,
  Zap,
  TrendingUp,
  Server,
  ShieldAlert,
  Eye,
  Bell,
  Search,
  ChevronRight,
  Download,
  MoreVertical,
  UserPlus,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";
import { getAdminAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";

const initialRecentUsers = [
  { id: 1, name: "Asifasd Asdfasf", date: "Mar 27, 2024", color: "bg-blue-100", active: true },
  { id: 2, name: "James MacDiarmid", date: "Apr 27, 2024", tags: ["New Employees", "Sales"], color: "bg-purple-100", active: true },
  { id: 3, name: "Test User", date: "May 27, 2024", color: "bg-green-100", active: false },
  { id: 4, name: "Mike White", date: "Jun 27, 2024", color: "bg-yellow-100", active: true },
  { id: 5, name: "Heimo Grässer", date: "Jul 27, 2024", color: "bg-pink-100", active: false },
];

export default function AdminDashboardEnhanced() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [recentUsers, setRecentUsers] = useState(initialRecentUsers);
  const [showInstructorForm, setShowInstructorForm] = useState(false);
  const [instructorForm, setInstructorForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });
  const [instructorError, setInstructorError] = useState("");
  const [instructorSuccess, setInstructorSuccess] = useState("");
  const [creatingInstructor, setCreatingInstructor] = useState(false);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        setError("");

        // Load analytics
        try {
          const analyticsData = await getAdminAnalyticsOverview();
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
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Failed to load dashboard data. Please refresh the page.",
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

  function handleInstructorChange(event) {
    setInstructorForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleCreateInstructor(event) {
    event.preventDefault();
    setInstructorError("");
    setInstructorSuccess("");
    setCreatingInstructor(true);

    try {
      const response = await api.post("/auth/instructors", {
        full_name: instructorForm.full_name.trim(),
        email: instructorForm.email.trim(),
        password: instructorForm.password,
      });

      setAnalytics((current) =>
        current
          ? {
              ...current,
              summary: {
                ...current.summary,
                total_users: Number(current.summary.total_users || 0) + 1,
                total_instructors:
                  Number(current.summary.total_instructors || 0) + 1,
              },
            }
          : current
      );
      setInstructorForm({ full_name: "", email: "", password: "" });
      setInstructorSuccess(
        `${response.data.user.full_name} can now sign in as an instructor.`
      );
      setShowInstructorForm(false);
    } catch (requestError) {
      const validationErrors = requestError.response?.data?.errors;
      setInstructorError(
        validationErrors?.length
          ? validationErrors.map((item) => item.message).join(" ")
          : requestError.response?.data?.message ||
              "Unable to create the instructor account. Please try again."
      );
    } finally {
      setCreatingInstructor(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-12 w-12 animate-spin text-amber-600" />
          <p className="text-slate-600">Loading system dashboard...</p>
        </div>
      </div>
    );
  }

  const summary = analytics?.summary;
  const totalUsers = summary?.total_users || 0;
  const totalCourses = summary?.total_courses || 0;
  const totalEnrollments = summary?.total_enrollments || 0;
  const studentCount = summary?.total_students || 0;
  const instructorCount = summary?.total_instructors || 0;
  const enrollmentCount = 45; // Mock data

  // Mock data for charts
  const chartData = [
    { date: "Jan 21", value: 40000 },
    { date: "Feb 21", value: 50000 },
    { date: "Mar 21", value: 45000 },
    { date: "Apr 21", value: 35000 },
    { date: "May 21", value: 52000 },
    { date: "Jun 21", value: 48000 },
    { date: "Jul 21", value: 41000 },
    { date: "Aug 21", value: 46000 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/admin-dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-600 to-amber-700">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">LMS Admin</span>
          </Link>

          <div className="flex-1 max-w-md hidden sm:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm placeholder-slate-500 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/live-classes"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Live classes
            </Link>
            <button
              type="button"
              onClick={() => {
                setInstructorError("");
                setInstructorSuccess("");
                setShowInstructorForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Instructor</span>
              <span className="sm:hidden">Add</span>
            </button>
            <button className="rounded-lg hover:bg-slate-100 p-2">
              <Bell className="h-5 w-5 text-slate-600" />
            </button>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-gradient-to-br from-amber-400 to-amber-600">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-5 w-5 text-white" />
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-slate-600">
            Welcome to the LMS Administration Panel
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Instructor accounts</h2>
          <p className="mt-1 text-sm text-slate-600">
            Create an instructor account and provide the credentials to its owner.
          </p>

          {instructorSuccess && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
            >
              {instructorSuccess}
            </p>
          )}

          {showInstructorForm && (
            <form
              onSubmit={handleCreateInstructor}
              className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"
            >
              {instructorError && (
                <p
                  role="alert"
                  className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2"
                >
                  {instructorError}
                </p>
              )}

              <label className="text-sm font-medium text-slate-700">
                Full name
                <input
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={150}
                  required
                  value={instructorForm.full_name}
                  onChange={handleInstructorChange}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  required
                  value={instructorForm.email}
                  onChange={handleInstructorChange}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Temporary password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={instructorForm.password}
                  onChange={handleInstructorChange}
                  aria-describedby="instructor-password-help"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
                <span
                  id="instructor-password-help"
                  className="mt-1 block text-xs font-normal text-slate-500"
                >
                  Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.
                </span>
              </label>

              <div className="flex gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={creatingInstructor}
                  className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {creatingInstructor ? "Creating account..." : "Create account"}
                </button>
                <button
                  type="button"
                  disabled={creatingInstructor}
                  onClick={() => {
                    setShowInstructorForm(false);
                    setInstructorForm({ full_name: "", email: "", password: "" });
                    setInstructorError("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Key Metrics */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "Total Users",
              value: totalUsers,
              icon: Users,
              color: "from-blue-500 to-blue-600",
            },
            {
              label: "Unread Courses",
              value: summary?.draft_courses || 0,
              icon: BookOpen,
              color: "from-purple-500 to-purple-600",
            },
            {
              label: "Learning Courses",
              value: summary?.published_courses || 0,
              icon: TrendingUp,
              color: "from-green-500 to-green-600",
            },
            {
              label: "Completed Courses",
              value: summary?.completed_enrollments || 0,
              icon: CheckCircle2,
              color: "from-teal-500 to-teal-600",
            },
            {
              label: "In Progress",
              value: enrollmentCount,
              icon: Activity,
              color: "from-red-500 to-red-600",
            },
          ].map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">{metric.label}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {metric.value}
                    </p>
                  </div>
                  <div
                    className={`h-12 w-12 rounded-lg bg-gradient-to-br ${metric.color} flex items-center justify-center`}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          {/* Line Chart */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">This Year</h2>
                <p className="text-sm text-slate-500">
                  User Registration Overview
                </p>
              </div>
              <div className="flex gap-2">
                {["This Week", "This Month", "This Year"].map((period) => (
                  <button
                    key={period}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      period === "This Week"
                        ? "bg-cyan-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {/* Simple SVG Chart */}
            <svg viewBox="0 0 800 250" className="w-full">
              {/* Grid */}
              {[60, 120, 180].map((y) => (
                <line
                  key={`grid-${y}`}
                  x1="40"
                  y1={y}
                  x2="780"
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}
              {/* Axes */}
              <line
                x1="40"
                y1="200"
                x2="780"
                y2="200"
                stroke="#cbd5e1"
                strokeWidth="2"
              />
              <line
                x1="40"
                y1="10"
                x2="40"
                y2="200"
                stroke="#cbd5e1"
                strokeWidth="2"
              />
              {/* Data points and lines */}
              <polyline
                points="40,150 140,100 240,130 340,170 440,80 540,120 640,160 740,125"
                fill="none"
                stroke="#6366f1"
                strokeWidth="3"
              />
              {/* Labels */}
              {chartData.map((data, idx) => (
                <text
                  key={`label-${idx}`}
                  x={40 + idx * 100}
                  y="220"
                  textAnchor="middle"
                  className="text-xs fill-slate-500"
                >
                  {data.date}
                </text>
              ))}
            </svg>
          </div>

          {/* Pie Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-6 font-bold text-slate-900">Monthly Report</h2>
            <div className="flex flex-col items-center">
              {/* Simple Pie Chart SVG */}
              <svg viewBox="0 0 200 200" className="h-40 w-40 mb-4">
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="2"
                />
                {/* Pie slices */}
                <path
                  d="M 100,100 L 100,10 A 90,90 0 0,1 170,170 Z"
                  fill="#6366f1"
                  opacity="0.8"
                />
                <path
                  d="M 100,100 L 170,170 A 90,90 0 0,1 30,170 Z"
                  fill="#10b981"
                  opacity="0.8"
                />
                <path
                  d="M 100,100 L 30,170 A 90,90 0 0,1 100,10 Z"
                  fill="#ec4899"
                  opacity="0.8"
                />
                <text
                  x="100"
                  y="105"
                  textAnchor="middle"
                  className="text-xl font-bold fill-slate-900"
                >
                  100%
                </text>
                <text
                  x="100"
                  y="125"
                  textAnchor="middle"
                  className="text-xs fill-slate-600"
                >
                  Total
                </text>
              </svg>
              <div className="space-y-2 w-full text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-indigo-600" />
                  <span className="text-slate-600">Total User</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">Published Courses</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-pink-500" />
                  <span className="text-slate-600">Courses in Progress</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recently Added Users & Courses */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recently Added Users */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Recently Added Users</h2>
              <Link
                to="#"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                View All
              </Link>
            </div>

            <div className="space-y-4">
              {recentUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full ${user.color} flex items-center justify-center`}
                    >
                      <UserRound className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{user.name}</p>
                      {user.tags && (
                        <div className="flex gap-1 mt-1">
                          {user.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-500">{user.date}</p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        aria-label={`Edit ${user.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                        aria-label={`Delete ${user.name}`}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                          user.active
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                        aria-label={user.active ? `Deactivate ${user.name}` : `Activate ${user.name}`}
                      >
                        {user.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recently Added Courses */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">
                Recently Added Courses
              </h2>
              <Link
                to="#"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                View All
              </Link>
            </div>

            <div className="space-y-4">
              {[
                {
                  name: "OSHA Training - Level One",
                  category: "Personal Development",
                  date: "Feb 16, 2023",
                  color: "bg-indigo-100",
                },
                {
                  name: "Test Video",
                  category: "Sales and Marketing",
                  date: "Oct 28, 2022",
                  color: "bg-purple-100",
                },
                {
                  name: "New Conflict Resolution",
                  category: "Personal Development",
                  date: "Oct 12, 2022",
                  color: "bg-green-100",
                },
                {
                  name: "GDPR Awareness",
                  category: "Personal Development",
                  date: "Oct 08, 2022",
                  color: "bg-teal-100",
                },
                {
                  name: "Test course 2",
                  category: "Personal Development",
                  date: "Oct 04, 2022",
                  color: "bg-pink-100",
                },
              ].map((course, idx) => (
                <div
                  key={idx}
                  className="py-3 border-b border-slate-100 last:border-0"
                >
                  <p className="font-semibold text-slate-900">{course.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex gap-2">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                        {course.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{course.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
          <p>
            © {new Date().getFullYear()} LMS Administration Portal. All rights
            reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
