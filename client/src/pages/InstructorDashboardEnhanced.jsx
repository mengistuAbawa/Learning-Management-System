import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  LayoutGrid,
  Loader,
  LogOut,
  Users,
  UserRound,
  Clock,
  Bell,
  Search,
  MoreVertical,
  Download,
  Eye,
  Edit2,
  PlusCircle,
  Moon,
  Sun,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAnalyticsOverview } from "../services/analyticsService";
import api from "../services/api";
import CourseVideoRecorder from "../components/CourseVideoRecorder";

export default function InstructorDashboardEnhanced() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [showStudentCoursePicker, setShowStudentCoursePicker] = useState(false);
  const [quickActionError, setQuickActionError] = useState("");
  const [darkTheme, setDarkTheme] = useState(
    () => localStorage.getItem("learnsphere-instructor-theme") === "dark"
  );

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
            params: { limit: 10 },
          });
          setPendingSubmissions(response.data.submissions || []);
        } catch {
          setPendingSubmissions([]);
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
      "learnsphere-instructor-theme",
      darkTheme ? "dark" : "light"
    );
  }, [darkTheme]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function downloadReports() {
    setQuickActionError("");
    if (!analytics) {
      setQuickActionError("Instructor analytics are not available to export right now.");
      return;
    }

    const rows = [
      ["Report section", "Metric", "Value"],
      ...Object.entries(analytics.summary || {}).map(([key, value]) => [
        "Summary",
        key,
        value ?? "",
      ]),
      ["Courses", "Course", "Status", "Students", "Completed enrollments", "Quiz attempts", "Average quiz percentage", "Assignment submissions", "Graded submissions", "Awaiting grade"],
      ...(analytics.courses || []).map((course) => [
        "Course",
        course.title,
        course.status,
        course.enrollment_count,
        course.completed_enrollments,
        course.quiz_attempts,
        course.average_quiz_percentage ?? "",
        course.total_submissions,
        course.graded_submissions,
        course.awaiting_grade,
      ]),
      ["Monthly activity", "Month", "Quiz attempts", "Assignment submissions", "Assignments graded"],
      ...(analytics.activityByMonth || []).map((month) => [
        "Month",
        month.month,
        month.quiz_attempts,
        month.assignment_submissions,
        month.assignments_graded,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\r\n");
    const file = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `instructor-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function openStudentManagement() {
    setQuickActionError("");
    if (courses.length === 0) {
      navigate("/courses");
      return;
    }
    if (courses.length === 1) {
      navigate(`/courses/${courses[0].id}/enrollments`);
      return;
    }
    setShowStudentCoursePicker((current) => !current);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-12 w-12 animate-spin text-cyan-600" />
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const totalStudents = courses.reduce(
    (acc, course) => acc + (course.enrollment_count || 0),
    0,
  );

  // Mock announcement
  const announcement = {
    author: "Mr.Khalid Mostafa",
    text: "Hi my heroes! I just want you ready to our exams and focus on remaining assessments",
    time: "2 hours ago",
  };

  return (
    <div
      className={`role-dashboard min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 ${
        darkTheme ? "role-dashboard-dark" : ""
      }`}
    >
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/instructor-dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-700">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">
              Instructor Portal
            </span>
          </Link>

          <div className="flex-1 max-w-md hidden sm:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search courses..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm placeholder-slate-500 focus:border-cyan-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDarkTheme((theme) => !theme)}
              aria-label={`Switch to ${darkTheme ? "light" : "dark"} theme`}
              aria-pressed={darkTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {darkTheme ? "Light theme" : "Dark theme"}
              </span>
            </button>
            <Link
              to="/live-classes"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50"
            >
              Live classes
            </Link>
            <button className="rounded-lg hover:bg-slate-100 p-2 relative">
              <Bell className="h-5 w-5 text-slate-600" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
            </button>

            <button className="rounded-lg hover:bg-slate-100 p-2 relative">
              <BookOpen className="h-5 w-5 text-slate-600" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-blue-500 rounded-full" />
            </button>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-gradient-to-br from-cyan-400 to-cyan-600">
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

        <CourseVideoRecorder courses={courses} />

        {/* Welcome & Stats Header */}
        <div className="mb-8 grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-gradient-to-r from-cyan-500 to-cyan-600 p-6 text-white shadow-lg">
            <h1 className="text-3xl font-bold">Welcome {firstName}!</h1>
            <p className="mt-2 text-cyan-100">
              Manage your courses and track student progress
            </p>
            <Link
              to="/courses"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-cyan-600 hover:bg-cyan-50 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Create New Course
            </Link>
          </div>

          {/* Stats Cards */}
          {[
            {
              label: "Total Courses",
              value: courses.length,
              icon: BookOpen,
              color: "from-blue-100 to-blue-200 text-blue-600",
            },
            {
              label: "Active Students",
              value: totalStudents,
              icon: Users,
              color: "from-indigo-100 to-indigo-200 text-indigo-600",
            },
            {
              label: "Pending Work",
              value: pendingSubmissions.length,
              icon: Clock,
              color: "from-orange-100 to-orange-200 text-orange-600",
            },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className={`rounded-xl border border-slate-200 bg-gradient-to-br ${stat.color} p-6 shadow-sm`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                  </div>
                  <Icon className="h-8 w-8 opacity-50" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column */}
          <div className="lg:col-span-2">
            {/* Your Courses */}
            <section className="mb-8">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  Your Courses
                </h2>
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  <option>All</option>
                  <option>Published</option>
                  <option>Draft</option>
                </select>
              </div>

              {courses.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <LayoutGrid className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                  <p className="text-slate-600">No courses yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-cyan-300 hover:shadow-md transition"
                    >
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">
                          {course.title}
                        </h3>
                        <div className="mt-2 flex items-center gap-4 text-sm text-slate-600">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {course.enrollment_count || 0} students
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            {course.lesson_count || 5} lessons
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            course.status === "published"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {course.status}
                        </span>
                        <button className="rounded-lg p-2 hover:bg-slate-100">
                          <MoreVertical className="h-4 w-4 text-slate-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pending Submissions */}
            <section>
              <h2 className="mb-5 text-xl font-bold text-slate-900">
                Submissions to Review
              </h2>

              {pendingSubmissions.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-3" />
                  <p className="text-slate-600">All caught up!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingSubmissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-cyan-300 transition"
                    >
                      <div>
                        <p className="text-sm text-slate-600">
                          {submission.student_name}
                        </p>
                        <h3 className="mt-1 font-semibold text-slate-900">
                          {submission.assignment_title}
                        </h3>
                        <p className="text-xs text-slate-500">
                          from {submission.course_title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                          Review
                        </button>
                        <button className="rounded-lg hover:bg-slate-100 p-2">
                          <Eye className="h-4 w-4 text-slate-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar */}
          <aside className="space-y-6">
            {/* Latest Announcement */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">
                Latest Announcement
              </h3>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {announcement.author}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {announcement.text}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  {announcement.time}
                </p>
              </div>
              <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                + New Announcement
              </button>
            </div>

            {/* Performance Stats */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">Performance</h3>
              <div className="space-y-4">
                {[
                  { label: "Student Engagement", value: "78%" },
                  { label: "Assignment Completion", value: "85%" },
                  { label: "Avg Score", value: "82%" },
                ].map((stat, idx) => (
                  <div key={idx}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{stat.label}</span>
                      <span className="font-semibold text-slate-900">
                        {stat.value}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600"
                        style={{ width: stat.value }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">Quick Actions</h3>
              {quickActionError && (
                <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {quickActionError}
                </p>
              )}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => navigate("/courses")}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit Courses
                </button>
                <button
                  type="button"
                  onClick={downloadReports}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  <Download className="h-4 w-4" />
                  Download Reports
                </button>
                <button
                  type="button"
                  onClick={openStudentManagement}
                  aria-expanded={showStudentCoursePicker}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  <Users className="h-4 w-4" />
                  Manage Students
                </button>
                {showStudentCoursePicker && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <label
                      htmlFor="manage-students-course"
                      className="mb-2 block text-xs font-medium text-slate-600"
                    >
                      Choose a course
                    </label>
                    <select
                      id="manage-students-course"
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) {
                          navigate(
                            `/courses/${event.target.value}/enrollments`
                          );
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="" disabled>
                        Select one of your courses
                      </option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
          <p>
            © {new Date().getFullYear()} Instructor Portal. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
