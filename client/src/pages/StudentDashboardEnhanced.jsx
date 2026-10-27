import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Menu,
  PlayCircle,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import DashboardSidebar from "../components/DashboardSidebar";
import DashboardThemeToggle from "../components/DashboardThemeToggle";
import NotificationBell from "../components/NotificationBell";
import CourseVideoLibrary from "../components/CourseVideoLibrary";
import { useAuth } from "../context/AuthContext";
import { getMyEnrollments } from "../services/enrollmentService";
import { getAnalyticsOverview } from "../services/analyticsService";
import { getAssignments, getMyAssignmentSubmissions } from "../services/assignmentService";
import { getMyQuizAttempts, getQuizzes } from "../services/quizService";
import { getUnreadNotificationCount } from "../services/notificationService";
import api from "../services/api";

function errorMessage(error) {
  return error?.response?.data?.message || error?.message || "Request failed.";
}

function formatDate(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function StatCard({ label, value, detail, icon: Icon, color }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <span className={`rounded-xl p-3 ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function SectionHeading({ title, to, linkLabel = "View all" }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
      {to && (
        <Link
          to={to}
          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300"
        >
          {linkLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </header>
  );
}

export default function StudentDashboardEnhanced() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(
    () => localStorage.getItem("learnsphere-student-theme") === "dark"
  );
  const [now, setNow] = useState(() => Date.now());

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "Learner";

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return undefined;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, loading]);

  const loadDashboard = useCallback(async (isCurrent = () => true) => {
    setRefreshing(true);
    const loadErrors = [];
    const [
      enrollmentResult,
      analyticsResult,
      attemptResult,
      submissionResult,
      classResult,
      notificationResult,
    ] =
      await Promise.allSettled([
        getMyEnrollments(),
        getAnalyticsOverview(),
        getMyQuizAttempts(),
        getMyAssignmentSubmissions(),
        api.get("/live-classes"),
        getUnreadNotificationCount(),
      ]);

    if (!isCurrent()) return;

    const enrollmentRows = enrollmentResult.status === "fulfilled"
      ? (enrollmentResult.value.data || []).filter((enrollment) =>
          ["active", "completed"].includes(enrollment.enrollment_status)
        )
      : [];
    if (enrollmentResult.status === "rejected") {
      loadErrors.push(`Courses: ${errorMessage(enrollmentResult.reason)}`);
    }
    if (analyticsResult.status === "fulfilled") {
      if (analyticsResult.value?.role === "student") {
        setAnalytics(analyticsResult.value);
      } else {
        loadErrors.push("Learning progress is unavailable for this account.");
      }
    } else {
      loadErrors.push(`Progress: ${errorMessage(analyticsResult.reason)}`);
    }
    if (attemptResult.status === "fulfilled") {
      setAttempts(attemptResult.value.attempts || []);
    } else {
      loadErrors.push(`Quiz attempts: ${errorMessage(attemptResult.reason)}`);
    }
    const submissions = submissionResult.status === "fulfilled"
      ? submissionResult.value.submissions || []
      : [];
    if (submissionResult.status === "rejected") {
      loadErrors.push(`Assignment submissions: ${errorMessage(submissionResult.reason)}`);
    }
    if (classResult.status === "fulfilled") {
      setClasses(classResult.value.data.classes || []);
    } else {
      loadErrors.push(`Live classes: ${errorMessage(classResult.reason)}`);
    }
    if (notificationResult.status === "fulfilled") {
      setUnreadNotifications(Number(notificationResult.value.unread_count) || 0);
    } else {
      loadErrors.push(`Notifications: ${errorMessage(notificationResult.reason)}`);
    }

    setEnrollments(enrollmentRows);

    const courseResults = await Promise.all(
      enrollmentRows.map(async (enrollment) => {
        const [assignmentResult, quizResult] = await Promise.allSettled([
          getAssignments(enrollment.course_id),
          getQuizzes(enrollment.course_id),
        ]);
        if (assignmentResult.status === "rejected") {
          loadErrors.push(
            `${enrollment.title} assignments: ${errorMessage(assignmentResult.reason)}`
          );
        }
        if (quizResult.status === "rejected") {
          loadErrors.push(
            `${enrollment.title} quizzes: ${errorMessage(quizResult.reason)}`
          );
        }
        return {
          assignments: assignmentResult.status === "fulfilled"
            ? assignmentResult.value.assignments || []
            : [],
          quizzes: quizResult.status === "fulfilled"
            ? quizResult.value.quizzes || []
            : [],
        };
      })
    );

    if (isCurrent()) {
      const submissionsByAssignment = new Map(
        submissions.map((item) => [String(item.assignment_id), item])
      );
      const assignmentRows = courseResults.flatMap((result) => result.assignments);
      setAssignments(
        assignmentRows.map((assignment) => ({
          ...assignment,
          ...(
            submissionsByAssignment.get(String(assignment.id))
              ? {
                  submission_id: submissionsByAssignment.get(String(assignment.id)).submission_id,
                  submitted_at: submissionsByAssignment.get(String(assignment.id)).submitted_at,
                  grade: submissionsByAssignment.get(String(assignment.id)).grade,
                  feedback: submissionsByAssignment.get(String(assignment.id)).feedback,
                }
              : {}
          ),
        }))
      );
      setQuizzes(courseResults.flatMap((result) => result.quizzes));
      setErrors(loadErrors);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadDashboard(() => active);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadDashboard]);

  useEffect(() => {
    localStorage.setItem(
      "learnsphere-student-theme",
      darkTheme ? "dark" : "light"
    );
  }, [darkTheme]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const courseProgress = useMemo(() => {
    const analyticsCourses = new Map(
      (analytics?.courses || []).map((course) => [String(course.course_id), course])
    );
    return enrollments.map((enrollment) => ({
      ...enrollment,
      ...(analyticsCourses.get(String(enrollment.course_id)) || {}),
    }));
  }, [analytics, enrollments]);

  const summary = analytics?.summary || {};
  const activeCourses = courseProgress.filter(
    (course) => course.enrollment_status === "active" && Number(course.remaining_lessons) > 0
  );
  const pendingAssignments = assignments
    .filter((assignment) => !assignment.submission_id && assignment.is_published)
    .sort((a, b) => {
      const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
  const upcomingAssignments = pendingAssignments.slice(0, 5);
  const visibleQuizzes = quizzes.filter((quiz) => {
    const isPublished = quiz.is_published === true;
    const isOpen = !quiz.opens_at || new Date(quiz.opens_at).getTime() <= now;
    const isNotClosed = !quiz.closes_at || new Date(quiz.closes_at).getTime() > now;
    return isPublished && isOpen && isNotClosed;
  });
  const actionableQuizzes = visibleQuizzes.filter((quiz) => {
    const quizAttempts = attempts.filter(
      (attempt) => String(attempt.quiz_id) === String(quiz.id)
    );
    return quizAttempts.some((attempt) => attempt.status === "in_progress") ||
      quiz.max_attempts === null ||
      quiz.max_attempts === undefined ||
      quizAttempts.length < Number(quiz.max_attempts);
  });
  const nextClasses = classes
    .filter((liveClass) =>
      liveClass.status === "live" ||
      (liveClass.status === "scheduled" &&
        new Date(liveClass.scheduled_at).getTime() >= now)
    )
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 4);

  const releasedGrades = [
    ...assignments
      .filter((assignment) => assignment.grade !== null && assignment.grade !== undefined)
      .map((assignment) => ({
        id: `assignment-${assignment.submission_id || assignment.id}`,
        title: assignment.title,
        course: courseProgress.find(
          (course) => String(course.course_id) === String(assignment.course_id)
        )?.title || "Course",
        score: `${assignment.grade} / ${assignment.max_points}`,
        feedback: assignment.feedback,
        date: assignment.submitted_at,
        to: "/my-assessments#grades",
      })),
    ...attempts
      .filter((attempt) => attempt.score !== null && attempt.score !== undefined)
      .map((attempt) => ({
        id: `quiz-${attempt.attempt_id}`,
        title: attempt.quiz_title,
        course: "",
        score: `${attempt.percentage}% · ${attempt.score} / ${attempt.total_points}`,
        feedback: attempt.instructor_feedback,
        date: attempt.submitted_at,
        to: "/my-assessments#grades",
      })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 5);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        <LoaderCircle className="mr-3 h-6 w-6 animate-spin text-indigo-600" />
        Loading your learning dashboard...
      </main>
    );
  }

  return (
    <div
      className={`role-dashboard min-h-screen bg-slate-50 dark:bg-slate-950 ${
        darkTheme ? "role-dashboard-dark" : ""
      }`}
    >
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <DashboardSidebar
          role="student"
          onAction={(action) => {
            if (action === "logout") handleLogout();
          }}
          counts={{ unreadNotifications }}
          responsive
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link
                to="/student-dashboard"
                className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"
              >
                <BookOpen className="h-5 w-5 text-indigo-600" />
                <span className="hidden text-sm sm:inline">Student workspace</span>
              </Link>
              <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => void loadDashboard()}
                  disabled={refreshing}
                  aria-label="Refresh dashboard"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <NotificationBell light={false} />
                <DashboardThemeToggle
                  darkTheme={darkTheme}
                  onToggle={() => setDarkTheme((theme) => !theme)}
                />
                <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
                  {user?.full_name || "Student"}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Log out</span>
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {errors.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Some dashboard information could not be loaded.</p>
                  <ul className="mt-1 list-inside list-disc">
                    {errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
                  </ul>
                </div>
              </div>
            )}

            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-cyan-600 p-6 text-white shadow-lg sm:p-9">
              <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div className="relative flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-100">
                    Your learning workspace
                  </p>
                  <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
                    Welcome back, {firstName}
                  </h1>
                  <p className="mt-2 max-w-2xl text-indigo-100">
                    Pick up where you left off, check upcoming assessments, and see your published results.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      to={activeCourses[0]
                        ? `/courses/${activeCourses[0].course_id}/learn`
                        : "/my-learning"}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {activeCourses.length ? "Continue learning" : "View my courses"}
                    </Link>
                    <Link
                      to="/courses"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      <GraduationCap className="h-4 w-4" />
                      Browse courses
                    </Link>
                    <Link
                      to="/live-classes"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      <CalendarClock className="h-4 w-4" />
                      Live classes
                    </Link>
                  </div>
                </div>
                <div className="min-w-36 rounded-2xl border border-white/20 bg-white/10 p-4 text-center backdrop-blur">
                  <p className="text-3xl font-extrabold">{summary.overallCompletion ?? 0}%</p>
                  <p className="mt-1 text-sm text-indigo-100">Lesson completion</p>
                </div>
              </div>
            </section>

            <section aria-label="Learning overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Enrolled courses"
                value={summary.enrolledCourses ?? courseProgress.length}
                detail={`${summary.activeCourses ?? activeCourses.length} in progress`}
                icon={BookOpen}
                color="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
              />
              <StatCard
                label="Completed courses"
                value={summary.completedCourses ?? courseProgress.filter((course) => course.enrollment_status === "completed").length}
                detail="Based on course enrollment status"
                icon={CheckCircle2}
                color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              />
              <StatCard
                label="Lessons completed"
                value={summary.lessonsCompleted ?? 0}
                detail={`${summary.lessonsRemaining ?? 0} remaining`}
                icon={PlayCircle}
                color="bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
              />
              <StatCard
                label="Assessments to review"
                value={pendingAssignments.length + actionableQuizzes.length}
                detail={`${pendingAssignments.length} assignments · ${actionableQuizzes.length} actionable quizzes`}
                icon={FileText}
                color="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              />
            </section>

            <section
              aria-labelledby="course-completion-heading"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                    Progress snapshot
                  </p>
                  <h2
                    id="course-completion-heading"
                    className="mt-1 text-lg font-bold text-slate-900 dark:text-white"
                  >
                    Course completion
                  </h2>
                </div>
                <Link
                  to="/my-learning"
                  className="text-sm font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  All courses
                </Link>
              </div>
              {courseProgress.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Enroll in a course to see your progress here.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {[...courseProgress]
                    .sort(
                      (first, second) =>
                        (Number(second.completion_percentage) || 0) -
                        (Number(first.completion_percentage) || 0)
                    )
                    .slice(0, 6)
                    .map((course) => {
                      const completion = Math.max(
                        0,
                        Math.min(100, Number(course.completion_percentage) || 0)
                      );
                      return (
                        <div key={course.course_id} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,2fr)_3rem]">
                          <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                            {course.title}
                          </span>
                          <div
                            role="img"
                            aria-label={`${course.title}: ${completion}% complete`}
                            className="col-span-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:col-span-1"
                          >
                            <div
                              className="h-full rounded-full bg-indigo-600 transition-[width]"
                              style={{ width: `${completion}%` }}
                            />
                          </div>
                          <span className="row-start-1 text-right text-sm font-semibold tabular-nums text-indigo-700 dark:text-indigo-300 sm:col-start-3">
                            {completion}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <section>
              <SectionHeading title="Continue learning" to="/my-learning" />
              {activeCourses.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                  <BookOpen className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-3 font-semibold text-slate-800 dark:text-white">No courses in progress</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Enroll in a course or revisit a completed course to continue learning.
                  </p>
                  <Link to="/courses" className="mt-4 inline-flex font-semibold text-indigo-600 dark:text-indigo-300">
                    Browse courses <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeCourses.slice(0, 3).map((course) => (
                    <article
                      key={course.course_id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      {course.thumbnail_url ? (
                        <img src={course.thumbnail_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-indigo-100 to-cyan-100 dark:from-indigo-950 dark:to-cyan-950">
                          <BookOpen className="h-10 w-10 text-indigo-500" />
                        </div>
                      )}
                      <div className="p-5">
                        <h3 className="line-clamp-2 font-bold text-slate-900 dark:text-white">{course.title}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {course.completed_lessons || 0} of {course.total_lessons || 0} lessons completed
                        </p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-indigo-600"
                            style={{ width: `${Math.max(0, Math.min(100, Number(course.completion_percentage) || 0))}%` }}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>Lesson completion</span>
                          <span>{Number(course.completion_percentage) || 0}%</span>
                        </div>
                        <Link
                          to={`/courses/${course.course_id}/learn`}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Continue course <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
              <div className="space-y-8">
                <section id="assessments">
                  <SectionHeading title="Assessments to work on" to="/my-assessments#assignments" />
                  <div className="space-y-3">
                    {upcomingAssignments.map((assignment) => {
                      const course = courseProgress.find(
                        (item) => String(item.course_id) === String(assignment.course_id)
                      );
                      const overdue = assignment.due_at && new Date(assignment.due_at).getTime() < now;
                      return (
                        <article key={`assignment-${assignment.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              <FileText className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-slate-900 dark:text-white">{assignment.title}</h3>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{course?.title || "Course assignment"}</p>
                              <p className={`mt-1 text-xs ${overdue ? "font-semibold text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`}>
                                {overdue ? "Past due · " : "Due · "}{formatDate(assignment.due_at)}
                              </p>
                            </div>
                          </div>
                          <Link to={`/courses/${assignment.course_id}/assignments`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800">
                            Open assignment
                          </Link>
                        </article>
                      );
                    })}
                    {upcomingAssignments.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        No unsubmitted published assignments in your enrolled courses.
                      </p>
                    )}
                    {visibleQuizzes.map((quiz) => {
                      const quizAttempts = attempts.filter(
                        (attempt) => String(attempt.quiz_id) === String(quiz.id)
                      );
                      const remainingAttempts = quiz.max_attempts === null ||
                        quiz.max_attempts === undefined
                        ? null
                        : Math.max(0, Number(quiz.max_attempts) - quizAttempts.length);
                      const activeAttempt = quizAttempts.find((attempt) => attempt.status === "in_progress");
                      const exhausted = !activeAttempt && remainingAttempts === 0;
                      return (
                        <article key={`quiz-${quiz.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="rounded-lg bg-cyan-50 p-2 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                              <GraduationCap className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-slate-900 dark:text-white">{quiz.title}</h3>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {quiz.question_count} questions · {quiz.time_limit_minutes} minutes · {
                                  remainingAttempts === null ? "Unlimited attempts" : `${remainingAttempts} attempts left`
                                }
                              </p>
                              {quiz.closes_at && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Closes {formatDate(quiz.closes_at)}
                                </p>
                              )}
                            </div>
                          </div>
                          <Link
                            aria-disabled={exhausted}
                            tabIndex={exhausted ? -1 : undefined}
                            to={`/quizzes/${quiz.id}/take`}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                              exhausted
                                ? "pointer-events-none border-slate-200 text-slate-400 dark:border-slate-700"
                                : "border-slate-200 text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800"
                            }`}
                          >
                            {activeAttempt ? "Resume quiz" : exhausted ? "Attempt limit reached" : "Open quiz"}
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section id="videos">
                  <CourseVideoLibrary />
                </section>

                <section>
                  <SectionHeading title="My courses" to="/my-learning" />
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    {courseProgress.length === 0 ? (
                      <p className="p-6 text-sm text-slate-500 dark:text-slate-400">You have not enrolled in a course yet.</p>
                    ) : (
                      courseProgress.slice(0, 5).map((course) => (
                        <div key={course.course_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0 dark:border-slate-800">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{course.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {course.instructor_name || "Course"} · {course.completed_lessons || 0}/{course.total_lessons || 0} lessons · {course.enrollment_status}
                            </p>
                          </div>
                          <Link to={`/courses/${course.course_id}/learn`} className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                            {course.enrollment_status === "completed" ? "Review" : "Open course"}
                          </Link>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-8">
                <section>
                  <SectionHeading title="Upcoming live classes" to="/live-classes" />
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    {nextClasses.length === 0 ? (
                      <p className="p-2 text-sm text-slate-500 dark:text-slate-400">
                        No upcoming or live sessions are scheduled for your enrolled courses.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {nextClasses.map((liveClass) => (
                          <li key={liveClass.id} className="py-4 first:pt-1 last:pb-1">
                            <div className="flex items-start gap-3">
                              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-900 dark:text-white">{liveClass.title}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {liveClass.course_title} · {formatDate(liveClass.scheduled_at)}
                                </p>
                                <p className="mt-1 text-xs capitalize text-slate-500 dark:text-slate-400">
                                  {liveClass.status} · {liveClass.duration_minutes} minutes
                                </p>
                                {liveClass.can_join && (
                                  <Link to={`/live-classes/${liveClass.id}/room`} className="mt-2 inline-flex text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                                    Join class <ArrowRight className="ml-1 h-4 w-4" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <section id="grades">
                  <SectionHeading title="Published grades" to="/analytics" />
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    {releasedGrades.length === 0 ? (
                      <p className="p-2 text-sm text-slate-500 dark:text-slate-400">
                        Published grades and feedback will appear here.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {releasedGrades.map((grade) => (
                          <li key={grade.id} className="py-3 first:pt-1 last:pb-1">
                            <Link to={grade.to} className="flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{grade.title}</span>
                                {grade.course && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{grade.course}</span>}
                                {grade.feedback && <span className="mt-1 block line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{grade.feedback}</span>}
                              </span>
                              <span className="shrink-0 text-sm font-bold text-emerald-700 dark:text-emerald-300">{grade.score}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <section>
                  <SectionHeading title="Learning progress" to="/analytics" />
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                        Lesson completion
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">{summary.overallCompletion ?? 0}%</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500"
                        style={{ width: `${Math.max(0, Math.min(100, Number(summary.overallCompletion) || 0))}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Completed lessons divided by available lessons across active and completed enrollments.
                    </p>
                  </div>
                </section>
              </aside>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span>LearnSphere student workspace</span>
              <Link to="/courses" className="inline-flex items-center gap-2 font-semibold text-indigo-600 dark:text-indigo-300">
                Explore the course catalog <ArrowRight className="h-4 w-4" />
              </Link>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
