import { useEffect, useState } from "react";
import {
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
  BarChart3,
  MessageCircle,
  Star,
  Moon,
  Sun,
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
import CourseVideoLibrary from "../components/CourseVideoLibrary";

export default function StudentDashboardEnhanced() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [darkTheme, setDarkTheme] = useState(
    () => localStorage.getItem("learnsphere-student-theme") === "dark"
  );

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

        // Load upcoming assignments
        try {
          const response = await api.get("/assignments/my/upcoming", {
            params: { limit: 5 },
          });
          setUpcomingAssignments(response.data.assignments || []);
        } catch {
          setUpcomingAssignments([]);
        }

        // Generate mock schedule (in real app, would come from lessons endpoint)
        setSchedule([
          {
            id: 1,
            course: "Mathematics 101",
            time: "10:45 AM - 11:30 AM",
            topic: "Unit 3: Simple equation",
            place: "Classroom 3a",
          },
          {
            id: 2,
            course: "Physics 101",
            time: "12:00 PM - 12:45 PM",
            topic: "Unit 2: Multiple numbers",
            place: "Classroom 3b",
          },
          {
            id: 3,
            course: "Chemistry 101",
            time: "2:00 PM - 3:00 PM",
            topic: "Organic Compounds",
            place: "Lab Room 5",
          },
        ]);
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

  useEffect(() => {
    localStorage.setItem(
      "learnsphere-student-theme",
      darkTheme ? "dark" : "light"
    );
  }, [darkTheme]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-12 w-12 animate-spin text-indigo-600" />
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const inProgressCount = enrolledCourses.filter(
    (e) => e.status === "active"
  ).length;
  const completedCount = enrolledCourses.filter(
    (e) => e.status === "completed"
  ).length;
  const inProgressCourses = enrolledCourses.filter((e) => e.status === "active");
  const completedCourses = enrolledCourses.filter((e) => e.status === "completed");

  return (
    <div
      className={`role-dashboard min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 ${
        darkTheme ? "role-dashboard-dark" : ""
      }`}
    >
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/student-dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-700">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">Coligo</span>
          </Link>

          <div className="flex-1 max-w-md hidden sm:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search courses..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm placeholder-slate-500 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
              className="rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Live classes
            </Link>
            <NotificationBell />

            <button className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100">
              <Bell className="h-5 w-5 text-slate-600" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-gradient-to-br from-indigo-400 to-indigo-600">
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

        {/* Welcome Section */}
        <section className="mb-8 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-8 py-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Welcome back, {firstName}!</h1>
              <p className="mt-2 text-indigo-100">
                You have {inProgressCount} classes scheduled for today
              </p>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-4xl font-bold">{analytics?.overall_completion_percentage || 0}%</p>
              <p className="text-indigo-100">Learning Progress</p>
            </div>
          </div>
          <Link
            to="/courses"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition"
          >
            <PlusCircle className="h-4 w-4" />
            Join Next Class
          </Link>
        </section>

        <CourseVideoLibrary />

        {/* Main Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Courses Progress & Schedule */}
          <div className="lg:col-span-2">
            {/* Courses Progress */}
            <section className="mb-8">
              <h2 className="mb-5 text-xl font-bold text-slate-900">
                Courses Progress
              </h2>
              {inProgressCourses.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                  <p className="text-slate-600 font-medium">No courses in progress</p>
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {inProgressCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex-shrink-0 w-32 rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition"
                    >
                      <div className="relative mb-3 h-16 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">
                          {Math.floor(Math.random() * 100)}%
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 text-sm line-clamp-2">
                        {course.course_title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">3 Classes</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* What's Due */}
            <section className="mb-8">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">What's Due</h2>
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  <option>All courses</option>
                  {inProgressCourses.map((course) => (
                    <option key={course.id}>{course.course_title}</option>
                  ))}
                </select>
              </div>

              {upcomingAssignments.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-3" />
                  <p className="text-slate-600">All caught up!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-indigo-100 p-2">
                            <FileText className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900">
                              {assignment.title}
                            </h3>
                            <p className="text-sm text-slate-500">
                              {assignment.course_title}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {assignment.due_at && (
                            <p className="text-sm font-semibold text-orange-600">
                              Due: Tomorrow
                            </p>
                          )}
                          <p className="text-xs text-slate-500">69%</p>
                        </div>
                      </div>
                      <div className="mt-3 h-1 w-full rounded-full bg-slate-200">
                        <div className="h-full w-2/3 rounded-full bg-orange-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Latest Uploaded Files */}
            <section>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  Latest Uploaded Files
                </h2>
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  <option>All courses</option>
                </select>
              </div>

              <div className="space-y-3">
                {[
                  {
                    id: 1,
                    name: "ClassPresentation.PDF",
                    course: "Math 101 | Unit 2: Add and Subtract numbers",
                    date: "12 Dec 2017",
                  },
                  {
                    id: 2,
                    name: "Slideshow 220bc.PPT",
                    course: "Math 102 | Unit 2: Motion and forces",
                    date: "09 Dec 2017",
                  },
                  {
                    id: 3,
                    name: "Solving Sheet.XLS",
                    course: "Math 104 | Linear equations",
                    date: "08 Dec 2017",
                  },
                ].map((file) => (
                  <div
                    key={file.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-indigo-100 p-2">
                          <Download className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{file.name}</p>
                          <p className="text-sm text-slate-500">{file.course}</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-500">{file.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column - Schedule & Latest Grades */}
          <aside>
            {/* Today Schedule */}
            <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">Today Schedule</h3>
              <div className="space-y-4">
                {schedule.map((item) => (
                  <div key={item.id} className="pb-4 border-b border-slate-100 last:border-0">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <Clock className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-indigo-600">
                          Slot {item.id} | {item.time}
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {item.course}
                        </p>
                        <p className="text-xs text-slate-500">
                          Topic: {item.topic}
                        </p>
                        <p className="text-xs text-slate-500">
                          Place: {item.place}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <button className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition">
                  View Full Schedule
                </button>
              </div>
            </section>

            {/* Latest Grades */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Latest Grades</h3>
                <button className="text-indigo-600 hover:text-indigo-700">
                  <PlusCircle className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {[
                  {
                    id: 1,
                    name: "Attendance",
                    course: "Math 101",
                    category: "Classroom",
                    grade: "4 / 5",
                    icon: CheckCircle2,
                    color: "text-emerald-500",
                  },
                  {
                    id: 2,
                    name: "Assignment",
                    course: "Math 10a",
                    category: "Homework",
                    grade: "8 / 10",
                    icon: FileText,
                    color: "text-indigo-500",
                  },
                  {
                    id: 3,
                    name: "Quiz",
                    course: "Math 10a",
                    category: "Homework",
                    grade: "—",
                    icon: Star,
                    color: "text-yellow-500",
                  },
                ].map((grade) => {
                  const IconComponent = grade.icon;
                  return (
                    <div key={grade.id} className="flex items-start gap-3">
                      <div className={`flex-shrink-0 ${grade.color}`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{grade.name}</p>
                        <p className="text-xs text-slate-500">{grade.course}</p>
                        <p className="text-xs text-slate-500">{grade.category}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{grade.grade}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Coligo LMS. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
