import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  LayoutGrid,
  Loader,
  LogOut,
  PlusCircle,
  Users,
  UserRound,
  Zap,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";
import { getAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";

export default function InstructorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "Instructor";

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        setError("");

        // Load instructor courses
        try {
          const response = await api.get("/courses");
          setCourses(response.data.courses || []);
        } catch {
          setCourses([]);
        }

        // Load analytics
        try {
          const analyticsData = await getAnalyticsOverview();
          setAnalytics(analyticsData);
        } catch {
          setAnalytics(null);
        }

        // Load pending submissions
        try {
          const response = await api.get("/assignments/submissions/pending", {
            params: { limit: 5 },
          });
          setPendingSubmissions(response.data.submissions || []);
        } catch {
          setPendingSubmissions([]);
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
          <Loader className="h-12 w-12 animate-spin text-cyan-500" />
          <p className="text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const publishedCount = courses.filter((c) => c.status === "published").length;
  const draftCount = courses.filter((c) => c.status === "draft").length;

  const totalStudents = courses.reduce(
    (acc, course) => acc + (course.enrollment_count || 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/instructor-dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500">
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
              My Courses
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <Activity className="h-4 w-4" />
              Analytics
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <NotificationBell />

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.full_name}</p>
              <p className="text-xs text-slate-400">Instructor</p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-5 w-5 text-cyan-300" />
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
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-600/20 via-slate-900 to-indigo-600/10 p-7 sm:p-10 lg:p-14 mb-10">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
              <Zap className="h-4 w-4" />
              INSTRUCTOR WORKSPACE
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              Welcome back, {firstName}!
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Manage your courses, review student submissions, and track class
              progress all in one place.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-300">
                <BookOpen className="h-5 w-5" />
                {courses.length} courses
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <Users className="h-5 w-5" />
                {totalStudents} students enrolled
              </span>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Courses</p>
                <p className="mt-2 text-3xl font-bold">{courses.length}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <BookOpen className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Published</p>
                <p className="mt-2 text-3xl font-bold">{publishedCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Drafts</p>
                <p className="mt-2 text-3xl font-bold">{draftCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Students</p>
                <p className="mt-2 text-3xl font-bold">{totalStudents}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </article>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* Your Courses */}
            <section className="mb-10">
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <p className="text-sm font-semibold text-cyan-300">
                    YOUR COURSES
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    Manage Your Content
                  </h2>
                </div>
                {courses.length > 0 && (
                  <Link
                    to="/courses"
                    className="flex items-center gap-1 text-sm font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    View all
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              {courses.length === 0 ? (
                <article className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
                  <LayoutGrid className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                  <p className="text-slate-400 font-medium">No courses yet</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Create your first course to get started
                  </p>
                  <Link
                    to="/courses"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Create Course
                  </Link>
                </article>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {courses.slice(0, 4).map((course) => (
                    <article
                      key={course.id}
                      className="group rounded-2xl border border-white/10 bg-slate-900/70 p-5 transition hover:border-cyan-400/50 hover:bg-slate-900/90"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold line-clamp-2">
                            {course.title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-400">
                            {course.enrollment_count || 0} students
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            course.status === "published"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {course.status}
                        </span>
                      </div>
                      <Link
                        to={`/courses/${course.id}/learn`}
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-400 hover:text-cyan-300"
                      >
                        Manage
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Pending Submissions */}
            <section>
              <div className="mb-6">
                <p className="text-sm font-semibold text-cyan-300">
                  STUDENT WORK
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Submissions to Review
                </h2>
              </div>

              {pendingSubmissions.length === 0 ? (
                <article className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 mb-3" />
                  <p className="text-slate-400 font-medium">All caught up!</p>
                  <p className="text-sm text-slate-500 mt-1">
                    No pending submissions to review
                  </p>
                </article>
              ) : (
                <div className="space-y-3">
                  {pendingSubmissions.map((submission) => (
                    <article
                      key={submission.id}
                      className="rounded-xl border border-white/10 bg-slate-900/50 p-4 hover:border-white/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm text-slate-400">
                            {submission.student_name}
                          </p>
                          <h3 className="font-semibold mt-1">
                            {submission.assignment_title}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">
                            Submitted in {submission.course_title}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-cyan-400">
                            Pending Review
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside>
            {/* Quick Actions */}
            <section className="mb-8 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h3 className="font-semibold mb-4">Quick Actions</h3>
              <nav className="space-y-2">
                <Link
                  to="/courses"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Create New Course
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
                  Notifications
                </Link>
              </nav>
            </section>

            {/* Course Spotlight */}
            {courses.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
                <h3 className="font-semibold mb-4">Your Top Course</h3>
                {courses[0] && (
                  <div className="rounded-lg bg-slate-800/50 p-4">
                    <p className="text-sm font-medium line-clamp-2">
                      {courses[0].title}
                    </p>
                    <div className="mt-3 space-y-2 text-xs">
                      <p className="text-slate-400">
                        Students:{" "}
                        <span className="font-semibold text-slate-200">
                          {courses[0].enrollment_count || 0}
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Status:{" "}
                        <span
                          className={`font-semibold ${
                            courses[0].status === "published"
                              ? "text-emerald-300"
                              : "text-amber-300"
                          }`}
                        >
                          {courses[0].status}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>

        {/* Footer */}
        <footer className="relative mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} LearnSphere LMS</p>
          <p className="flex items-center gap-2">
            Empower your students
            <ArrowRight className="h-4 w-4" />
          </p>
        </footer>
      </main>
    </div>
  );
}
