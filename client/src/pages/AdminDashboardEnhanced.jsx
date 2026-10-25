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
  UserPlus,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  Check,
  X,
  Globe2,
  Plug,
  Settings,
  Menu,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAdminAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";
import DashboardSidebar from "../components/DashboardSidebar";
import DashboardThemeToggle from "../components/DashboardThemeToggle";

export default function AdminDashboardEnhanced() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [darkTheme, setDarkTheme] = useState(
    () => localStorage.getItem("learnsphere-admin-theme") === "dark"
  );
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentUsersError, setRecentUsersError] = useState("");
  const [accountModalRole, setAccountModalRole] = useState("");
  const [managedAccounts, setManagedAccounts] = useState([]);
  const [managedAccountsLoading, setManagedAccountsLoading] = useState(false);
  const [managedAccountsError, setManagedAccountsError] = useState("");
  const [managedAccountsPagination, setManagedAccountsPagination] = useState({
    offset: 0,
    limit: 25,
    total: 0,
    has_more: false,
  });
  const [settingsDraft, setSettingsDraft] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [savingSetting, setSavingSetting] = useState("");
  const [pendingStudents, setPendingStudents] = useState([]);
  const [pendingInstructorCount, setPendingInstructorCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [pendingStudentsError, setPendingStudentsError] = useState("");
  const [loadingPendingStudents, setLoadingPendingStudents] = useState(true);
  const [approvalActionError, setApprovalActionError] = useState("");
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

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    async function loadPendingStudents() {
      try {
        const response = await api.get("/users/students/pending");
        setPendingStudents(response.data.students || []);
        setPendingStudentsError("");
      } catch (requestError) {
        setPendingStudentsError(
          requestError.response?.data?.message ||
            "Unable to load pending student registrations."
        );
      } finally {
        setLoadingPendingStudents(false);
      }
    }

    loadPendingStudents();
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/users/instructors/pending"),
      api.get("/notifications/unread-count"),
    ])
      .then(([instructorsResponse, notificationsResponse]) => {
        if (!active) return;
        setPendingInstructorCount(instructorsResponse.data.instructors?.length || 0);
        setUnreadNotificationCount(notificationsResponse.data.unread_count || 0);
      })
      .catch(() => {
        if (active) {
          setPendingInstructorCount(0);
          setUnreadNotificationCount(0);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function loadPlatformSettings() {
      try {
        const response = await api.get("/admin/settings");
        const settings = response.data.settings || {};
        setSettingsDraft({
          platform_name: settings.platform_name?.value ?? "LearnSphere LMS",
          support_email: settings.support_email?.value ?? "",
          public_registration_enabled:
            settings.public_registration_enabled?.value ?? true,
          platform_language: settings.platform_language?.value ?? "en",
          platform_timezone:
            settings.platform_timezone?.value ??
            Intl.DateTimeFormat().resolvedOptions().timeZone ??
            "UTC",
        });
        setSettingsError("");
      } catch (requestError) {
        setSettingsError(
          requestError.response?.data?.message || "Unable to load platform settings."
        );
      } finally {
        setSettingsLoading(false);
      }
    }

    loadPlatformSettings();
  }, []);

  useEffect(() => {
    if (!accountModalRole) return undefined;
    const controller = new AbortController();

    async function loadManagedAccounts() {
      try {
        setManagedAccountsLoading(true);
        setManagedAccountsError("");
        const response = await api.get("/users/accounts", {
          params: {
            role: accountModalRole,
            limit: managedAccountsPagination.limit,
            offset: managedAccountsPagination.offset,
          },
          signal: controller.signal,
        });
        setManagedAccounts(response.data.users || []);
        setManagedAccountsPagination(response.data.pagination);
      } catch (requestError) {
        if (requestError.name !== "CanceledError") {
          setManagedAccountsError(
            requestError.response?.data?.message ||
              `Unable to load ${accountModalRole} accounts.`
          );
        }
      } finally {
        if (!controller.signal.aborted) setManagedAccountsLoading(false);
      }
    }

    loadManagedAccounts();
    return () => controller.abort();
  }, [
    accountModalRole,
    managedAccountsPagination.limit,
    managedAccountsPagination.offset,
  ]);

  function updateAccountLists(update) {
    setRecentUsers(update);
    setManagedAccounts(update);
  }

  function openSidebarAction(action) {
    setManagedAccountsError("");
    setManagedAccounts([]);
    setEditingUserId(null);
    setUserActionError("");
    setApprovalActionError("");
    setManagedAccountsPagination((current) => ({ ...current, offset: 0 }));
    setAccountModalRole(action);
  }

  async function savePlatformSetting(key, value) {
    setSavingSetting(key);
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.put(`/admin/settings/${key}`, { value });
      setSettingsDraft((current) => ({ ...current, [key]: value }));
      setSettingsSuccess("Settings saved.");
    } catch (requestError) {
      setSettingsError(
        requestError.response?.data?.message || "Unable to save this setting."
      );
    } finally {
      setSavingSetting("");
    }
  }

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
      updateAccountLists((accounts) =>
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
      updateAccountLists((accounts) =>
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

  async function reviewStudentRegistration(student, approvalStatus) {
    if (
      approvalStatus === "rejected" &&
      !window.confirm(`Reject ${student.full_name}'s registration?`)
    ) {
      return;
    }

    setSavingUserId(String(student.id));
    setApprovalActionError("");
    try {
      const response = await api.patch(
        `/users/students/${student.id}/approval`,
        { approval_status: approvalStatus }
      );
      setPendingStudents((students) =>
        students.filter((item) => String(item.id) !== String(student.id))
      );
      setAnalytics((current) => {
        if (!current) return current;
        const approved = approvalStatus === "approved";
        return {
          ...current,
          summary: {
            ...current.summary,
            total_students:
              Number(current.summary.total_students || 0) + (approved ? 1 : 0),
            active_students:
              Number(current.summary.active_students || 0) +
              (approved && response.data.user.is_active ? 1 : 0),
            pending_student_registrations: Math.max(
              0,
              Number(current.summary.pending_student_registrations || 0) - 1
            ),
          },
        };
      });
      updateAccountLists((accounts) =>
        accounts.map((account) =>
          String(account.id) === String(student.id)
            ? response.data.user
            : account
        )
      );
    } catch (requestError) {
      setApprovalActionError(
        requestError.response?.data?.message ||
          `Unable to ${approvalStatus} this student registration.`
      );
    } finally {
      setSavingUserId(null);
    }
  }

  async function reviewInstructorApplication(instructor, approvalStatus) {
    if (
      approvalStatus === "rejected" &&
      !window.confirm(`Reject ${instructor.full_name}'s instructor application?`)
    ) {
      return;
    }

    setSavingUserId(String(instructor.id));
    setUserActionError("");
    try {
      const response = await api.patch(
        `/users/instructors/${instructor.id}/approval`,
        { approval_status: approvalStatus }
      );
      updateAccountLists((accounts) =>
        accounts.map((account) =>
          String(account.id) === String(instructor.id)
            ? response.data.user
            : account
        )
      );
      setPendingInstructorCount((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setUserActionError(
        requestError.response?.data?.message ||
          `Unable to ${approvalStatus} this instructor application.`
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
      updateAccountLists((accounts) =>
        accounts.filter((item) => String(item.id) !== String(account.id))
      );
      setManagedAccountsPagination((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
      }));
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
                active_students:
                  Number(current.summary.active_students || 0) + 1,
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 lg:hidden"
            aria-label="Open administrator navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            to="/admin-dashboard"
            aria-label={settingsDraft.platform_name || "LearnSphere LMS"}
            className="flex shrink-0 items-center gap-2 sm:gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-600 to-amber-700">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <span className="hidden text-lg font-bold text-slate-900 sm:inline">
              {settingsDraft.platform_name || "LearnSphere LMS"}
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            <Link
              to="/courses"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 lg:inline-flex"
            >
              Courses
            </Link>
            <Link
              to="/live-classes"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 lg:inline-flex"
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
              aria-label="Add student"
              className="inline-flex items-center gap-2 rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Student</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInstructorError("");
                setInstructorSuccess("");
                setShowInstructorForm(true);
              }}
              aria-label="Add instructor"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Instructor</span>
            </button>
            <Link
              to="/notifications"
              aria-label={`${unreadNotificationCount} unread notifications`}
              className="relative rounded-lg p-2 hover:bg-slate-100"
            >
              <Bell className="h-5 w-5 text-slate-600" />
              {unreadNotificationCount > 0 ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />
              ) : null}
            </Link>

            <DashboardThemeToggle
              darkTheme={darkTheme}
              onToggle={() => setDarkTheme((current) => !current)}
            />

            <Link
              to="/admin/settings"
              aria-label="Administrator profile and settings"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-gradient-to-br from-amber-400 to-amber-600"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-5 w-5 text-white" />
              )}
            </Link>

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
        <DashboardSidebar
          role="admin"
          responsive
          mobileOpen={mobileNavOpen}
          collapsed={sidebarCollapsed}
          onClose={() => setMobileNavOpen(false)}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          onAction={openSidebarAction}
          counts={{
            pendingApprovals: pendingInstructorCount + pendingStudents.length,
            unreadNotifications: unreadNotificationCount,
          }}
        />
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
            Welcome, {user?.full_name || "Administrator"}.
          </p>
        </div>

        <section
          id="platform-analytics"
          aria-labelledby="platform-analytics-heading"
          className="mb-8 scroll-mt-24 space-y-5"
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    label: "Total users",
                    value: summary.total_users,
                    detail: `${summary.active_users} active`,
                    icon: Users,
                    color: "bg-indigo-100 text-indigo-700",
                  },
                  {
                    label: "Approved students",
                    value: summary.total_students,
                    detail: `${summary.active_students} active · ${summary.pending_student_registrations} pending`,
                    icon: UserRound,
                    color: "bg-cyan-100 text-cyan-700",
                  },
                  {
                    label: "Instructors",
                    value: summary.total_instructors,
                    detail: `${pendingInstructorCount} pending approval`,
                    icon: UserCheck,
                    color: "bg-violet-100 text-violet-700",
                  },
                  {
                    label: "Courses",
                    value: summary.total_courses,
                    detail: `${summary.published_courses} published`,
                    icon: BookOpen,
                    color: "bg-emerald-100 text-emerald-700",
                  },
                  {
                    label: "Enrollment records",
                    value: summary.total_enrollments,
                    detail: `${summary.completed_enrollments} completed · not unique learners`,
                    icon: TrendingUp,
                    color: "bg-amber-100 text-amber-700",
                  },
                  {
                    label: "Course completion rate",
                    value: `${Number(summary.course_completion_rate || 0).toFixed(1)}%`,
                    detail: "Completed / active and completed enrollments",
                    icon: UserCheck,
                    color: "bg-emerald-100 text-emerald-700",
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
          className="mb-8 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
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

        <section
          id="instructor-accounts"
          className="mb-8 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
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

        <section
          id="pending-approvals"
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">Pending Student Registrations</h2>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {pendingStudents.length} pending
            </span>
          </div>

          {pendingStudentsError ? (
            <p role="alert" className="text-sm text-rose-700">
              {pendingStudentsError}
            </p>
          ) : loadingPendingStudents ? (
            <p className="text-sm text-slate-500">Loading pending registrations...</p>
          ) : pendingStudents.length === 0 ? (
            <p className="text-sm text-slate-500">There are no student registrations awaiting review.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingStudents.map((student) => {
                const isBusy = savingUserId === String(student.id);
                return (
                  <div
                    key={student.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{student.full_name}</p>
                      <p className="text-sm text-slate-500">{student.email}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Registered {new Date(student.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={Boolean(savingUserId)}
                        onClick={() => reviewStudentRegistration(student, "approved")}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <UserCheck className="h-4 w-4" aria-hidden="true" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(savingUserId)}
                        onClick={() => reviewStudentRegistration(student, "rejected")}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <UserX className="h-4 w-4" aria-hidden="true" />
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {approvalActionError && (
            <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {approvalActionError}
            </p>
          )}
        </section>

        {/* Recently Added Users & Courses */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recently Added Users */}
          <div
            id="recent-users"
            className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
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
                              aria-label={isBusy ? "Saving user changes" : "Save user changes"}
                              title={isBusy ? "Saving..." : "Save changes"}
                              className="rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Check className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setEditingUserId(null)}
                              aria-label="Cancel editing user"
                              title="Cancel"
                              className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(savingUserId)}
                              onClick={() => beginEditUser(account)}
                              aria-label={`Edit ${account.full_name}`}
                              title="Edit user"
                              className="rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(savingUserId) || isCurrentAdmin}
                              onClick={() => deleteUser(account)}
                              aria-label={`Delete ${account.full_name}`}
                              title="Delete user"
                              className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(savingUserId) || isCurrentAdmin}
                              onClick={() => toggleUserStatus(account)}
                              aria-label={`${account.is_active ? "Deactivate" : "Activate"} ${account.full_name}`}
                              title={account.is_active ? "Deactivate user" : "Activate user"}
                              className={`rounded-md p-2 disabled:opacity-50 ${
                                account.is_active
                                  ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {account.is_active ? (
                                <UserX className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <UserCheck className="h-4 w-4" aria-hidden="true" />
                              )}
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

        <section
          id="general-settings"
          className="mt-8 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <div>
              <h2 className="font-bold text-slate-900">General settings</h2>
              <p className="text-sm text-slate-500">
                Manage the platform name, support contact, and registration access.
              </p>
            </div>
          </div>
          {settingsLoading ? (
            <p className="mt-5 text-sm text-slate-500">Loading platform settings...</p>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Platform name
                <input
                  value={settingsDraft.platform_name ?? "LearnSphere LMS"}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      platform_name: event.target.value,
                    }))
                  }
                  maxLength={100}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
                <button
                  type="button"
                  disabled={savingSetting === "platform_name"}
                  onClick={() =>
                    savePlatformSetting("platform_name", settingsDraft.platform_name)
                  }
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingSetting === "platform_name" ? "Saving..." : "Save name"}
                </button>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Support email
                <input
                  type="email"
                  value={settingsDraft.support_email ?? ""}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      support_email: event.target.value,
                    }))
                  }
                  maxLength={255}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
                <button
                  type="button"
                  disabled={savingSetting === "support_email"}
                  onClick={() =>
                    savePlatformSetting(
                      "support_email",
                      settingsDraft.support_email?.trim() || null
                    )
                  }
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingSetting === "support_email" ? "Saving..." : "Save email"}
                </button>
              </label>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Public account registration
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Controls public student sign-up and instructor applications.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(settingsDraft.public_registration_enabled)}
                  disabled={savingSetting === "public_registration_enabled"}
                  onClick={() =>
                    savePlatformSetting(
                      "public_registration_enabled",
                      !settingsDraft.public_registration_enabled
                    )
                  }
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    settingsDraft.public_registration_enabled
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-700"
                  } disabled:opacity-50`}
                >
                  {savingSetting === "public_registration_enabled"
                    ? "Saving..."
                    : settingsDraft.public_registration_enabled
                      ? "Enabled"
                      : "Disabled"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          id="localization"
          className="mt-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <div>
              <h2 className="font-bold text-slate-900">Localization</h2>
              <p className="text-sm text-slate-500">
                Set the platform’s default language and time zone.
              </p>
            </div>
          </div>
          {!settingsLoading && (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Default language
                <select
                  value={settingsDraft.platform_language ?? "en"}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      platform_language: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="en">English</option>
                  <option value="am">Amharic</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
                <button
                  type="button"
                  disabled={savingSetting === "platform_language"}
                  onClick={() =>
                    savePlatformSetting(
                      "platform_language",
                      settingsDraft.platform_language
                    )
                  }
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingSetting === "platform_language"
                    ? "Saving..."
                    : "Save language"}
                </button>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Default time zone
                <input
                  value={settingsDraft.platform_timezone ?? "UTC"}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      platform_timezone: event.target.value,
                    }))
                  }
                  maxLength={100}
                  placeholder="Africa/Addis_Ababa"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
                <button
                  type="button"
                  disabled={savingSetting === "platform_timezone"}
                  onClick={() =>
                    savePlatformSetting(
                      "platform_timezone",
                      settingsDraft.platform_timezone?.trim()
                    )
                  }
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingSetting === "platform_timezone"
                    ? "Saving..."
                    : "Save time zone"}
                </button>
              </label>
            </div>
          )}
        </section>

        <section
          id="integrations"
          className="mt-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Plug className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <div>
              <h2 className="font-bold text-slate-900">Integrations</h2>
              <p className="text-sm text-slate-500">
                External service connections for this platform.
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No configurable integrations are currently registered. Integration
            credentials are not stored in platform settings.
          </p>
        </section>

        {(settingsError || settingsSuccess) && (
          <p
            role={settingsError ? "alert" : "status"}
            className={`mt-4 rounded-lg p-3 text-sm ${
              settingsError
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {settingsError || settingsSuccess}
          </p>
        )}

        {accountModalRole && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setAccountModalRole("");
                setEditingUserId(null);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="managed-accounts-title"
              className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h2
                    id="managed-accounts-title"
                    className="text-xl font-bold capitalize text-slate-900"
                  >
                    {accountModalRole} accounts
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    View account details, review applications, and manage access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAccountModalRole("");
                    setEditingUserId(null);
                  }}
                  aria-label="Close account list"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {(userActionError || approvalActionError) && (
                <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {userActionError || approvalActionError}
                </p>
              )}

              {managedAccountsError ? (
                <p role="alert" className="mt-5 text-sm text-rose-700">
                  {managedAccountsError}
                </p>
              ) : managedAccountsLoading ? (
                <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
                  <Loader className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Loading accounts...
                </div>
              ) : managedAccounts.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No {accountModalRole} accounts found.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100">
                  {managedAccounts.map((account) => {
                    const isEditing = editingUserId === String(account.id);
                    const isBusy = savingUserId === String(account.id);
                    const reviewPending = account.approval_status === "pending";

                    return (
                      <article
                        key={account.id}
                        className="py-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="grid gap-3 sm:grid-cols-2">
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
                                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  />
                                </label>
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">
                                  {account.full_name}
                                </p>
                                <p className="text-sm text-slate-600">{account.email}</p>
                                <p className="mt-2 text-xs capitalize text-slate-500">
                                  {account.role} · {account.is_active ? "Active" : "Suspended"} ·{" "}
                                  Approval: {account.approval_status}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Joined {new Date(account.created_at).toLocaleDateString()}
                                </p>
                                {account.bio && (
                                  <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-slate-600">
                                    {account.bio}
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => saveUser(account.id)}
                                  aria-label="Save user changes"
                                  className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:opacity-50"
                                >
                                  {isBusy ? (
                                    <Loader className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setEditingUserId(null)}
                                  aria-label="Cancel editing user"
                                  className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                {reviewPending && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={Boolean(savingUserId)}
                                      onClick={() =>
                                        accountModalRole === "student"
                                          ? reviewStudentRegistration(account, "approved")
                                          : reviewInstructorApplication(account, "approved")
                                      }
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Boolean(savingUserId)}
                                      onClick={() =>
                                        accountModalRole === "student"
                                          ? reviewStudentRegistration(account, "rejected")
                                          : reviewInstructorApplication(account, "rejected")
                                      }
                                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  disabled={Boolean(savingUserId)}
                                  onClick={() => beginEditUser(account)}
                                  aria-label={`Edit ${account.full_name}`}
                                  title="Edit account"
                                  className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(savingUserId)}
                                  onClick={() => toggleUserStatus(account)}
                                  aria-label={`${account.is_active ? "Suspend" : "Reactivate"} ${account.full_name}`}
                                  title={account.is_active ? "Suspend account" : "Reactivate account"}
                                  className={`rounded-lg p-2 disabled:opacity-50 ${
                                    account.is_active
                                      ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                      : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  }`}
                                >
                                  {account.is_active ? (
                                    <UserX className="h-4 w-4" />
                                  ) : (
                                    <UserCheck className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(savingUserId)}
                                  onClick={() => deleteUser(account)}
                                  aria-label={`Delete ${account.full_name}`}
                                  title="Delete account"
                                  className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm">
                <span className="text-slate-500">
                  {managedAccountsPagination.total.toLocaleString()} total accounts
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={managedAccountsPagination.offset === 0 || managedAccountsLoading}
                    onClick={() =>
                      setManagedAccountsPagination((current) => ({
                        ...current,
                        offset: Math.max(0, current.offset - current.limit),
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!managedAccountsPagination.has_more || managedAccountsLoading}
                    onClick={() =>
                      setManagedAccountsPagination((current) => ({
                        ...current,
                        offset: current.offset + current.limit,
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
          <p>
            © {new Date().getFullYear()} {settingsDraft.platform_name || "LearnSphere LMS"}.
            All rights reserved.
          </p>
        </footer>
        </main>
      </div>
    </div>
  );
}
