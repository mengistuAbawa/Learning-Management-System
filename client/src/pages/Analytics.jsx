
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Users,
  ClipboardCheck,
  RefreshCw,
  AlertCircle,
  TrendingUp
} from "lucide-react";

import { getAnalyticsOverview } from "../services/analyticsService";

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function MetricCard({ title, value, subtitle, icon: Icon }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5
                        shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500
                        dark:text-slate-400">
            {title}
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight
                        text-slate-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600
                        dark:bg-indigo-950 dark:text-indigo-300">
          <Icon size={22} />
        </div>
      </div>
    </article>
  );
}

function ProgressBar({ value }) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-slate-100
                 dark:bg-slate-800"
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${percentage}% complete`}
    >
      <div
        className="h-full rounded-full bg-indigo-600 transition-all
                   duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

function StudentAnalytics({ data }) {
  const summary = data.summary;
  const courses = data.courses || [];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Enrolled courses"
          value={formatNumber(summary.enrolledCourses)}
          icon={BookOpen}
        />
        <MetricCard
          title="Completed courses"
          value={formatNumber(summary.completedCourses)}
          icon={GraduationCap}
        />
        <MetricCard
          title="Lessons completed"
          value={formatNumber(summary.lessonsCompleted)}
          subtitle={`${formatNumber(summary.lessonsAvailable)} total lessons in enrolled courses`}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Overall completion"
          value={`${Number(summary.overallCompletion) || 0}%`}
          icon={TrendingUp}
        />
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200
                          bg-white p-6 dark:border-slate-800
                          dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          My learning progress
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Completion calculated from recorded lesson progress.
        </p>

        {courses.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            You are not enrolled in any courses yet.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {courses.map((course) => (
              <article key={course.enrollment_id}>
                <div className="mb-2 flex flex-wrap items-center
                                justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900
                                   dark:text-white">
                      {course.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatNumber(course.completed_lessons)} of{" "}
                      {formatNumber(course.total_lessons)} lessons completed
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-indigo-600
                                   dark:text-indigo-400">
                    {Number(course.completion_percentage) || 0}%
                  </span>
                </div>

                <ProgressBar value={course.completion_percentage} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Assignments submitted"
          value={formatNumber(summary.totalSubmissions)}
          icon={ClipboardCheck}
        />
        <MetricCard
          title="Graded submissions"
          value={formatNumber(summary.gradedSubmissions)}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Awaiting grade"
          value={formatNumber(summary.awaitingGrade)}
          icon={Activity}
        />
        <MetricCard
          title="Average assignment grade"
          value={
            summary.averageGrade === null
              ? "N/A"
              : Number(summary.averageGrade).toLocaleString()
          }
          subtitle="Numeric grade units; not necessarily a percentage"
          icon={TrendingUp}
        />
      </section>
    </>
  );
}

function InstructorAnalytics({ data }) {
  const summary = data.summary;
  const courses = data.courses || [];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="My courses"
          value={formatNumber(summary.totalCourses)}
          icon={BookOpen}
        />
        <MetricCard
          title="Enrollments"
          value={formatNumber(summary.totalEnrollments)}
          icon={Users}
        />
        <MetricCard
          title="Completed enrollments"
          value={formatNumber(summary.completedEnrollments)}
          icon={GraduationCap}
        />
        <MetricCard
          title="Assignment submissions"
          value={formatNumber(summary.totalSubmissions)}
          subtitle={`${formatNumber(summary.gradedSubmissions)} graded`}
          icon={ClipboardCheck}
        />
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border
                          border-slate-200 bg-white dark:border-slate-800
                          dark:bg-slate-900">
        <div className="border-b border-slate-100 p-6 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Course performance
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enrollment and assignment activity across your courses.
          </p>
        </div>

        {courses.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No courses are assigned to your instructor account.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {courses.map((course) => (
              <article key={course.course_id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start
                                justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900
                                   dark:text-white">
                      {course.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Status: {course.status}
                    </p>
                  </div>

                  <span className="rounded-full bg-indigo-50 px-3 py-1
                                   text-xs font-semibold text-indigo-700
                                   dark:bg-indigo-950 dark:text-indigo-300">
                    {formatNumber(course.enrollment_count)} enrolled
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Completed</p>
                    <p className="mt-1 font-bold text-slate-900
                                  dark:text-white">
                      {formatNumber(course.completed_enrollments)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Lessons</p>
                    <p className="mt-1 font-bold text-slate-900
                                  dark:text-white">
                      {formatNumber(course.total_lessons)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Assignments</p>
                    <p className="mt-1 font-bold text-slate-900
                                  dark:text-white">
                      {formatNumber(course.total_assignments)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="Graded submissions"
          value={formatNumber(summary.gradedSubmissions)}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Average assignment grade"
          value={
            summary.averageGrade === null
              ? "N/A"
              : Number(summary.averageGrade).toLocaleString()
          }
          subtitle="Numeric grade units; not necessarily a percentage"
          icon={TrendingUp}
        />
      </section>
    </>
  );
}

function AdminAnalytics({ data }) {
  const summary = data.summary;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total users"
          value={formatNumber(summary.total_users)}
          icon={Users}
        />
        <MetricCard
          title="Students"
          value={formatNumber(summary.total_students)}
          icon={GraduationCap}
        />
        <MetricCard
          title="Instructors"
          value={formatNumber(summary.total_instructors)}
          icon={Users}
        />
        <MetricCard
          title="Total courses"
          value={formatNumber(summary.total_courses)}
          subtitle={`${formatNumber(summary.published_courses)} published`}
          icon={BookOpen}
        />
        <MetricCard
          title="Enrollments"
          value={formatNumber(summary.total_enrollments)}
          icon={Activity}
        />
        <MetricCard
          title="Completed enrollments"
          value={formatNumber(summary.completed_enrollments)}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Completed lessons"
          value={formatNumber(summary.completed_lessons)}
          icon={TrendingUp}
        />
        <MetricCard
          title="Assignment submissions"
          value={formatNumber(summary.total_submissions)}
          subtitle={`${formatNumber(summary.graded_submissions)} graded`}
          icon={ClipboardCheck}
        />
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border
                          border-slate-200 bg-white dark:border-slate-800
                          dark:bg-slate-900">
        <div className="border-b border-slate-100 p-6 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Recently registered users
          </h2>
        </div>

        {!data.recentUsers?.length ? (
          <p className="p-8 text-sm text-slate-500">
            No users found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500
                                dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100
                                dark:divide-slate-800">
                {data.recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 font-medium text-slate-900
                                   dark:text-white">
                      {user.full_name}
                    </td>
                    <td className="px-6 py-4 capitalize text-slate-600
                                   dark:text-slate-300">
                      {user.role}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getAnalyticsOverview();
      setData(result);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load analytics. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8
                     dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center
                           justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-indigo-600
                            dark:text-indigo-400">
              <Activity size={21} />
              <span className="text-sm font-semibold">LearnSphere</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight
                           text-slate-900 dark:text-white">
              Learning Analytics
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Understand learning progress and course performance using
              recorded platform data.
            </p>
          </div>

          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl
                       border border-slate-200 bg-white px-4 py-2
                       text-sm font-semibold text-slate-700
                       hover:bg-slate-100 disabled:opacity-50
                       dark:border-slate-700 dark:bg-slate-900
                       dark:text-slate-200"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-6 flex gap-3 rounded-xl
                                      border border-red-200 bg-red-50
                                      p-4 text-sm text-red-700
                                      dark:border-red-900 dark:bg-red-950
                                      dark:text-red-300">
            <AlertCircle size={19} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading && !data ? (
          <div className="rounded-2xl border border-slate-200 bg-white
                          p-12 text-center text-slate-500
                          dark:border-slate-800 dark:bg-slate-900">
            Loading analytics...
          </div>
        ) : data ? (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-3 py-1
                               text-xs font-semibold capitalize
                               text-indigo-700 dark:bg-indigo-950
                               dark:text-indigo-300">
                {data.role} analytics
              </span>
              <span className="text-xs text-slate-500">
                Data from your LearnSphere database
              </span>
            </div>

            {data.role === "student" && <StudentAnalytics data={data} />}
            {data.role === "instructor" && (
              <InstructorAnalytics data={data} />
            )}
            {data.role === "admin" && <AdminAnalytics data={data} />}
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white
                          p-10 text-center text-slate-500
                          dark:border-slate-800 dark:bg-slate-900">
            No analytics data is available.
          </div>
        )}
      </div>
    </main>
  );
}
