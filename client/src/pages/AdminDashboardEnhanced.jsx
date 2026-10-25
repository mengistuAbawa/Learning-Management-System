import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Loader,
  LogOut,
  Users,
  UserRound,
  TrendingUp,
  ShieldAlert,
  Bell,
  Search,
  UserPlus,
  Moon,
  Sun,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAdminAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";
import DashboardSidebar from "../components/DashboardSidebar";

export default function AdminDashboardEnhanced() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [darkTheme, setDarkTheme] = useState(
    () => localStorage.getItem("learnsphere-admin-theme") === "dark"
  );
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentUsersError, setRecentUsersError] = useState("");
  const [userActionError, setUserActionError] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ full_name: "", email: "" });
  const [savingUserId, setSavingUserId] = useState(null);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentForm, setStudentForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });
  const [studentError, setStudentError] = useState("");
  const [studentSuccess, setStudentSuccess] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);
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
          setAnalyticsError("");
        } catch (requestError) {
          setAnalytics(null);
          setAnalyticsError(
            requestError.response?.data?.message ||
              "Unable to load platform analytics."
          );
        }

        try {
          const response = await api.get("/users/recent");
          setRecentUsers(response.data.users || []);
          setRecentUsersError("");
        } catch (requestError) {
          setRecentUsersError(
            requestError.response?.data?.message ||
              "Unable to load recently registered users."
          );
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

  useEffect(() => {
    localStorage.setItem(
      "learnsphere-admin-theme",
      darkTheme ? "dark" : "light"
    );
  }, [darkTheme]);

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

  function handleStudentChange(event) {
    setStudentForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function beginEditUser(account) {
    setUserActionError("");
    setEditingUserId(String(account.id));
    setEditUserForm({
      full_name: account.full_name,
      email: account.email,
    });
  }

  async function saveUser(accountId) {
    setSavingUserId(String(accountId));
    setUserActionError("");
    try {
      const response = await api.patch(`/users/${accountId}`, editUserForm);
      setRecentUsers((accounts) =>
        accounts.map((account) =>
          String(account.id) === String(accountId)
            ? response.data.user
            : account
        )
      );
      setEditingUserId(null);
    } catch (requestError) {
      setUserActionError(
        requestError.response?.data?.message || "Unable to update this account."
      );
    } finally {
      setSavingUserId(null);
    }
  }

  async function toggleUserStatus(account) {
    setSavingUserId(String(account.id));
    setUserActionError("");
    try {
      const response = await api.patch(`/users/${account.id}/status`, {
        is_active: !account.is_active,
      });
      setRecentUsers((accounts) =>
        accounts.map((item) =>
          String(item.id) === String(account.id) ? response.data.user : item
        )
      );
    } catch (requestError) {
      setUserActionError(
        requestError.response?.data?.message ||
          `Unable to ${account.is_active ? "deactivate" : "activate"} this account.`
      );
    } finally {
      setSavingUserId(null);
    }
  }

  async function deleteUser(account) {
    if (
      !window.confirm(
        `Delete ${account.full_name}'s account? This cannot be undone.`
      )
    ) {
      return;
    }

    setSavingUserId(String(account.id));
    setUserActionError("");
    try {
      await api.delete(`/users/${account.id}`);
      setRecentUsers((accounts) =>
        accounts.filter((item) => String(item.id) !== String(account.id))
      );
    } catch (requestError) {
      setUserActionError(
        requestError.response?.data?.message || "Unable to delete this account."
      );
    } finally {
      setSavingUserId(null);
    }
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
      try {
        const recentResponse = await api.get("/users/recent");
        setRecentUsers(recentResponse.data.users || []);
        setRecentUsersError("");
      } catch (refreshError) {
        setRecentUsersError(
          refreshError.response?.data?.message ||
            "Instructor account was created, but the recent-users list could not be refreshed."
        );
      }
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

  async function handleCreateStudent(event) {
    event.preventDefault();
    setStudentError("");
    setStudentSuccess("");
    setCreatingStudent(true);

    try {
      const response = await api.post("/users/students", {
        full_name: studentForm.full_name.trim(),
        email: studentForm.email.trim(),
        password: studentForm.password,
      });

      setAnalytics((current) =>
        current
          ? {
              ...current,
              summary: {
                ...current.summary,
                total_users: Number(current.summary.total_users || 0) + 1,
                total_students:
                  Number(current.summary.total_students || 0) + 1,
              },
            }
          : current
      );
      setStudentForm({ full_name: "", email: "", password: "" });
      setStudentSuccess(
        `${response.data.user.full_name} can now sign in as a student.`
      );
      setShowStudentForm(false);
      try {
        const recentResponse = await api.get("/users/recent");
        setRecentUsers(recentResponse.data.users || []);
        setRecentUsersError("");
      } catch (refreshError) {
        setRecentUsersError(
          refreshError.response?.data?.message ||
            "Student account was created, but the recent-users list could not be refreshed."
        );
      }
    } catch (requestError) {
      const validationErrors = requestError.response?.data?.errors;
      setStudentError(
        validationErrors?.length
          ? validationErrors.map((item) => item.message).join(" ")
          : requestError.response?.data?.message ||
              "Unable to create the student account. Please try again."
      );
    } finally {
      setCreatingStudent(false);
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
  const monthlyTrends = analytics?.monthlyTrends || [];
  const maxMonthlyActivity = Math.max(
    1,
    ...monthlyTrends.map((month) =>
      Math.max(Number(month.new_users) || 0, Number(month.new_enrollments) || 0)
    )
  );

  return (
    <div
      className={`admin-dashboard min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 ${
        darkTheme ? "admin-dashboard-dark" : ""
      }`}
    >
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
              to="/courses"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Courses
            </Link>
            <Link
              to="/live-classes"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Live classes
            </Link>
            <button
              type="button"
              onClick={() => {
                setStudentError("");
                setStudentSuccess("");
                setShowStudentForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Student</span>
              <span className="sm:hidden">Student</span>
            </button>
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
            <button
              type="button"
              onClick={() => setDarkTheme((current) => !current)}
              aria-label={`Switch to ${darkTheme ? "light" : "dark"} theme`}
              aria-pressed={darkTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden md:inline">
                {darkTheme ? "Light theme" : "Dark theme"}
              </span>
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

      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 lg:flex-row lg:items-start lg:px-6">
        <DashboardSidebar role="admin" />
        <main className="min-w-0 flex-1 py-2">
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

        <section
          aria-labelledby="platform-analytics-heading"
          className="mb-8 space-y-5"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
                Platform insights
              </p>
              <h2
                id="platform-analytics-heading"
                className="mt-1 text-2xl font-bold text-slate-900"
              >
                Analytics
              </h2>
            </div>
            <Link
              to="/analytics"
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Open detailed analytics
            </Link>
          </div>

          {analyticsError ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              {analyticsError}
            </p>
          ) : summary ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Total users",
                    value: summary.total_users,
                    detail: `${summary.active_users} active`,
                    icon: Users,
                    color: "bg-indigo-100 text-indigo-700",
                  },
                  {
                    label: "Students",
                    value: summary.total_students,
                    detail: `${summary.total_instructors} instructors`,
                    icon: UserRound,
                    color: "bg-cyan-100 text-cyan-700",
                  },
                  {
                    label: "Courses",
                    value: summary.total_courses,
                    detail: `${summary.published_courses} published`,
                    icon: BookOpen,
                    color: "bg-emerald-100 text-emerald-700",
                  },
                  {
                    label: "Enrollments",
                    value: summary.total_enrollments,
                    detail: `${summary.completed_enrollments} completed`,
                    icon: TrendingUp,
                    color: "bg-amber-100 text-amber-700",
                  },
                ].map(({ label, value, detail, icon: Icon, color }) => (
                  <article
                    key={label}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-600">{label}</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {Number(value || 0).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{detail}</p>
                      </div>
                      <span className={`rounded-xl p-3 ${color}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="font-bold text-slate-900">
                    Monthly platform activity
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    New users and enrollments over the last 12 months
                  </p>
                  {monthlyTrends.length === 0 ? (
                    <p className="mt-8 text-sm text-slate-500">
                      No monthly activity is available yet.
                    </p>
                  ) : (
                    <>
                      <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                          New users
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                          Enrollments
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-6 gap-3 sm:grid-cols-12">
                        {monthlyTrends.map((month) => {
                          const users = Number(month.new_users) || 0;
                          const enrollments = Number(month.new_enrollments) || 0;
                          const usersHeight = Math.max(
                            users ? 5 : 0,
                            (users / maxMonthlyActivity) * 100
                          );
                          const enrollmentsHeight = Math.max(
                            enrollments ? 5 : 0,
                            (enrollments / maxMonthlyActivity) * 100
                          );
                          const monthLabel = new Date(
                            `${month.month}-01T00:00:00`
                          ).toLocaleDateString(undefined, { month: "short" });

                          return (
                            <div
                              key={month.month}
                              className="flex min-w-0 flex-col items-center"
                              title={`${month.month}: ${users} users, ${enrollments} enrollments`}
                            >
                              <div className="flex h-32 w-full items-end justify-center gap-1 border-b border-slate-200">
                                <span
                                  className="w-2/5 rounded-t bg-indigo-500"
                                  style={{ height: `${usersHeight}%` }}
                                />
                                <span
                                  className="w-2/5 rounded-t bg-cyan-500"
                                  style={{ height: `${enrollmentsHeight}%` }}
                                />
                              </div>
                              <span className="mt-2 text-[10px] text-slate-500">
                                {monthLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="font-bold text-slate-900">Recent activity</h3>
                  <div className="mt-4 space-y-4">
                    {(analytics.recentActivity || []).slice(0, 5).map((item, index) => (
                      <article
                        key={`${item.type}-${item.activity_at}-${index}`}
                        className="border-b border-slate-100 pb-3 last:border-0"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {item.user_name} · {item.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.course_title} ·{" "}
                          {item.activity_at
                            ? new Date(item.activity_at).toLocaleDateString()
                            : "Date unavailable"}
                        </p>
                      </article>
                    ))}
                    {!analytics.recentActivity?.length && (
                      <p className="text-sm text-slate-500">
                        No learning activity recorded yet.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Analytics are unavailable.
            </p>
          )}
        </section>

        <section
          id="student-accounts"
          className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold text-slate-900">Student accounts</h2>
          <p className="mt-1 text-sm text-slate-600">
            Create an active student account with a temporary password.
          </p>

          {studentSuccess && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
            >
              {studentSuccess}
            </p>
          )}

          {showStudentForm && (
            <form
              onSubmit={handleCreateStudent}
              className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"
            >
              {studentError && (
                <p
                  role="alert"
                  className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2"
                >
                  {studentError}
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
                  value={studentForm.full_name}
                  onChange={handleStudentChange}
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
                  value={studentForm.email}
                  onChange={handleStudentChange}
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
                  value={studentForm.password}
                  onChange={handleStudentChange}
                  aria-describedby="student-password-help"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
                <span
                  id="student-password-help"
                  className="mt-1 block text-xs font-normal text-slate-500"
                >
                  Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.
                </span>
              </label>

              <div className="flex gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={creatingStudent}
                  className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {creatingStudent ? "Creating account..." : "Create student"}
                </button>
                <button
                  type="button"
                  disabled={creatingStudent}
                  onClick={() => {
                    setShowStudentForm(false);
                    setStudentForm({ full_name: "", email: "", password: "" });
                    setStudentError("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

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

        {/* Recently Added Users & Courses */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recently Added Users */}
          <div
            id="recent-users"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Recently Added Users</h2>
              <Link
                to="#"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                View All
              </Link>
            </div>

            {userActionError && (
              <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                {userActionError}
              </p>
            )}
            {recentUsersError ? (
              <p role="alert" className="text-sm text-rose-700">
                {recentUsersError}
              </p>
            ) : recentUsers.length === 0 ? (
              <p className="text-sm text-slate-500">No registered users found.</p>
            ) : (
              <div className="space-y-4">
                {recentUsers.map((account) => {
                  const isEditing = editingUserId === String(account.id);
                  const isBusy = savingUserId === String(account.id);
                  const isCurrentAdmin = String(user?.id) === String(account.id);

                  return (
                    <div
                      key={account.id}
                      className="flex flex-col gap-4 border-b border-slate-100 py-4 last:border-0 lg:flex-row lg:items-center lg:justify-between"
                    >
                      {isEditing ? (
                        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-600">
                            Full name
                            <input
                              value={editUserForm.full_name}
                              onChange={(event) =>
                                setEditUserForm((current) => ({
                                  ...current,
                                  full_name: event.target.value,
                                }))
                              }
                              maxLength={150}
                              required
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Email
                            <input
                              type="email"
                              value={editUserForm.email}
                              onChange={(event) =>
                                setEditUserForm((current) => ({
                                  ...current,
                                  email: event.target.value,
                                }))
                              }
                              maxLength={255}
                              required
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                            <UserRound className="h-5 w-5 text-slate-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {account.full_name}
                            </p>
                            <p className="truncate text-sm text-slate-500">
                              {account.email}
                            </p>
                            <p className="mt-1 text-xs capitalize text-slate-500">
                              {account.role} · {account.is_active ? "Active" : "Inactive"} ·
                              {" "}{new Date(account.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => saveUser(account.id)}
                              className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                            >
                              {isBusy ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setEditingUserId(null)}
                              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(savingUserId)}
                              onClick={() => beginEditUser(account)}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(savingUserId) || isCurrentAdmin}
                              onClick={() => deleteUser(account)}
                              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(savingUserId) || isCurrentAdmin}
                              onClick={() => toggleUserStatus(account)}
                              className={`rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                                account.is_active
                                  ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {account.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recently Added Courses */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">
                Recently Added Courses
              </h2>
              <Link
                to="/courses"
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
    </div>
  );
}
