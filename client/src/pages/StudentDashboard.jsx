import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader,
  LogOut,
  PlusCircle,
  TrendingUp,
  UserRound,
  Zap,
  Calendar,
  FileText,
  Download,
  Settings,
  Bell,
  Search,
  ChevronRight,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";
import {
  getMyEnrollments,
  getCourseEnrollments,
} from "../services/enrollmentService";
import { getAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState([]);

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "Learner";

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        setError("");

        // Load enrolled courses
        const enrollmentsData = await getMyEnrollments();
        const enrollments = enrollmentsData.enrollments || [];
        setEnrolledCourses(enrollments);

        // Load analytics
        const analyticsData = await getAnalyticsOverview();
        setAnalytics(analyticsData);

        // Load upcoming assignments (from assignments endpoint)
        try {
          const response = await api.get("/assignments/my/upcoming", {
            params: { limit: 5 },
          });
          setUpcomingAssignments(response.data.assignments || []);
        } catch {
          // Endpoint may not exist, that's okay
          setUpcomingAssignments([]);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-12 w-12 animate-spin text-indigo-500" />
          <p className="text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const inProgressCount = enrolledCourses.filter(
    (e) => e.status === "active",
  ).length;
  const completedCount = enrolledCourses.filter(
    (e) => e.status === "completed",
  ).length;

  const inProgressCourses = enrolledCourses.filter(
    (e) => e.status === "active",
  );
  const completedCourses = enrolledCourses.filter(
    (e) => e.status === "completed",
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/student-dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500">
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
              Browse Courses
            </Link>
            <Link
              to="/my-learning"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <TrendingUp className="h-4 w-4" />
              My Learning
            </Link>
            <Link
              to="/certificates"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <GraduationCap className="h-4 w-4" />
              Certificates
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <NotificationBell />

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.full_name}</p>
              <p className="text-xs text-slate-400">Student</p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-5 w-5 text-indigo-300" />
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
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-600/10 p-7 sm:p-10 lg:p-14 mb-10">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-indigo-200">
              <Zap className="h-4 w-4" />
              YOUR LEARNING WORKSPACE
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              Welcome back, {firstName}!
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              You're making great progress. Continue learning and earning
              certifications.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
                {enrolledCourses.length} courses enrolled
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <TrendingUp className="h-5 w-5" />
                {completedCount} courses completed
              </span>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Enrolled Courses</p>
                <p className="mt-2 text-3xl font-bold">
                  {enrolledCourses.length}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                <BookOpen className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">In Progress</p>
                <p className="mt-2 text-3xl font-bold">{inProgressCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Completed</p>
                <p className="mt-2 text-3xl font-bold">{completedCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Learning Streak</p>
                <p className="mt-2 text-3xl font-bold">
                  {analytics?.overall_completion_percentage || 0}%
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <Activity className="h-6 w-6" />
              </div>
            </div>
          </article>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* In Progress Courses */}
            <section className="mb-10">
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-300">
                    CONTINUE LEARNING
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    Your Active Courses
                  </h2>
                </div>
                {inProgressCourses.length > 0 && (
                  <Link
                    to="/my-learning"
                    className="flex items-center gap-1 text-sm font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    View all
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              {inProgressCourses.length === 0 ? (
                <article className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
                  <BookOpen className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                  <p className="text-slate-400 font-medium">
                    No courses in progress
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Enroll in courses to start learning
                  </p>
                  <Link
                    to="/courses"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Browse Courses
                  </Link>
                </article>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {inProgressCourses.slice(0, 4).map((enrollment) => (
                    <article
                      key={enrollment.id}
                      className="group rounded-2xl border border-white/10 bg-slate-900/70 p-5 transition hover:border-indigo-400/50 hover:bg-slate-900/90"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold line-clamp-2">
                            {enrollment.course_title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-400">
                            {enrollment.course_category}
                          </p>
                        </div>
                        <BookOpen className="h-5 w-5 text-indigo-400" />
                      </div>
                      <Link
                        to={`/courses/${enrollment.course_id}/learn`}
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-400 hover:text-indigo-300"
                      >
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Upcoming Assignments */}
            <section>
              <div className="mb-6">
                <p className="text-sm font-semibold text-indigo-300">
                  UPCOMING WORK
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Assignments & Deadlines
                </h2>
              </div>

              {upcomingAssignments.length === 0 ? (
                <article className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 mb-3" />
                  <p className="text-slate-400 font-medium">
                    No upcoming assignments
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    You're all caught up!
                  </p>
                </article>
              ) : (
                <div className="space-y-3">
                  {upcomingAssignments.map((assignment) => (
                    <article
                      key={assignment.id}
                      className="rounded-xl border border-white/10 bg-slate-900/50 p-4 hover:border-white/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold">{assignment.title}</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            {assignment.course_title}
                          </p>
                        </div>
                        {assignment.due_at && (
                          <div className="text-right">
                            <p className="text-xs font-semibold text-orange-400">
                              Due soon
                            </p>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside>
            {/* Quick Links */}
            <section className="mb-8 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h3 className="font-semibold mb-4">Quick Links</h3>
              <nav className="space-y-2">
                <Link
                  to="/courses"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Explore Courses
                </Link>
                <Link
                  to="/my-learning"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  My Learning
                </Link>
                <Link
                  to="/certificates"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Certificates
                </Link>
                <Link
                  to="/notifications"
                  className="block rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Notifications
                </Link>
              </nav>
            </section>

            {/* Completed Courses */}
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h3 className="font-semibold mb-4">Recent Achievements</h3>
              {completedCourses.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Complete courses to earn certificates
                </p>
              ) : (
                <div className="space-y-2">
                  {completedCourses.slice(0, 3).map((course) => (
                    <div
                      key={course.id}
                      className="rounded-lg bg-slate-800/50 p-3"
                    >
                      <p className="text-sm font-medium line-clamp-2">
                        {course.course_title}
                      </p>
                      <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="relative mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} LearnSphere LMS</p>
          <p className="flex items-center gap-2">
            Keep learning, keep growing
            <ArrowRight className="h-4 w-4" />
          </p>
        </footer>
      </main>
    </div>
  );
}
