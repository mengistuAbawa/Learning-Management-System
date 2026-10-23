
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
  TrendingUp,
  Search
} from "lucide-react";

import {
  getAnalyticsOverview,
  getInstructorStudentPerformance,
} from "../services/analyticsService";

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function MetricCard({ title, value, subtitle, icon: Icon }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5
                        shadow-sm transition duration-200 hover:-translate-y-0.5
                        hover:shadow-md dark:border-slate-800 dark:bg-slate-900
                        analytics-enter"
    >
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

function DonutChart({ value, label, color = "#4f46e5" }) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      viewBox="0 0 120 120"
      className="h-36 w-36 shrink-0"
      role="img"
      aria-label={`${label}: ${percentage}%`}
    >
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        className="text-slate-100 dark:text-slate-800"
      />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percentage / 100)}
        transform="rotate(-90 60 60)"
        className="analytics-donut"
      />
      <text
        x="60"
        y="57"
        textAnchor="middle"
        className="fill-slate-900 text-[22px] font-bold dark:fill-white"
      >
        {percentage}%
      </text>
      <text
        x="60"
        y="75"
        textAnchor="middle"
        className="fill-slate-500 text-[9px] dark:fill-slate-400"
      >
        {label}
      </text>
    </svg>
  );
}

function StackedBar({ title, segments }) {
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, Number(segment.value) || 0),
    0
  );

  return (
    <figure>
      <figcaption className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {title}
        </span>
        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
          {formatNumber(total)}
        </span>
      </figcaption>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="img"
        aria-label={`${title}: ${segments
          .map((segment) => `${segment.label} ${formatNumber(segment.value)}`)
          .join(", ")}`}
      >
        {total > 0 &&
          segments.map((segment) => {
            const value = Math.max(0, Number(segment.value) || 0);
            return (
              <span
                key={segment.label}
                className={`analytics-bar-fill ${segment.className}`}
                style={{ width: `${(value / total) * 100}%` }}
              />
            );
          })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${segment.className}`}
            />
            {segment.label}: {formatNumber(segment.value)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function TrendBars({ title, data, series }) {
  const maximum = Math.max(
    1,
    ...data.map((item) =>
      series.reduce((sum, entry) => sum + (Number(item[entry.key]) || 0), 0)
    )
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6
                        shadow-sm dark:border-slate-800 dark:bg-slate-900
                        analytics-enter">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
        {title}
      </h2>
      <div className="mt-4 flex flex-wrap gap-4">
        {series.map((entry) => (
          <span key={entry.key}
                className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className={`h-2.5 w-2.5 rounded-full ${entry.color}`} />
            {entry.label}
          </span>
        ))}
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-sm text-slate-500">No recorded trend data.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {data.map((item) => {
            const total = series.reduce(
              (sum, entry) => sum + (Number(item[entry.key]) || 0),
              0
            );
            return (
              <div key={item.month} className="grid grid-cols-[4.5rem_1fr_2rem]
                                                items-center gap-3">
                <span className="text-xs tabular-nums text-slate-500">
                  {item.month}
                </span>
                <div className="flex h-2.5 overflow-hidden rounded-full
                                bg-slate-100 dark:bg-slate-800"
                     role="img"
                     aria-label={`${item.month}: ${series.map((entry) =>
                       `${entry.label} ${formatNumber(item[entry.key])}`
                     ).join(", ")}`}>
                  {series.map((entry) => {
                    const value = Number(item[entry.key]) || 0;
                    return value > 0 ? (
                      <span key={entry.key}
                            className={`${entry.color} transition-all duration-500`}
                            style={{ width: `${(value / maximum) * 100}%` }} />
                    ) : null;
                  })}
                </div>
                <span className="text-right text-xs tabular-nums
                                 text-slate-500">
                  {formatNumber(total)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EnrollmentBars({ courses }) {
  const maxEnrollments = Math.max(
    1,
    ...courses.map((course) => Number(course.enrollment_count) || 0)
  );

  return (
    <section
      className="mt-8 rounded-2xl border border-slate-200 bg-white p-6
                 shadow-sm dark:border-slate-800 dark:bg-slate-900 analytics-enter"
      aria-labelledby="enrollment-chart-title"
    >
      <h2
        id="enrollment-chart-title"
        className="text-lg font-bold text-slate-900 dark:text-white"
      >
        Enrollment by course
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Compare active reach across your assigned courses.
      </p>
      {courses.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No course enrollment data is available yet.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {courses.map((course, index) => {
            const enrolled = Number(course.enrollment_count) || 0;
            const completed = Number(course.completed_enrollments) || 0;
            return (
              <div
                key={course.course_id}
                role="img"
                aria-label={`${course.title}: ${formatNumber(enrolled)} enrolled, ${formatNumber(completed)} completed`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {course.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {formatNumber(enrolled)} enrolled
                  </span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span
                    className="analytics-bar-fill bg-indigo-500"
                    style={{
                      width: `${(enrolled / maxEnrollments) * 100}%`,
                      animationDelay: `${Math.min(index, 6) * 70}ms`,
                    }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">
                  {formatNumber(completed)} completed
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
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

      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <article className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 analytics-enter">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Overall course completion
            </p>
            <p className="mt-2 max-w-40 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Your average progress across enrolled courses.
            </p>
          </div>
          <DonutChart
            value={summary.overallCompletion}
            label="complete"
          />
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 analytics-enter">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Assignment review status
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Graded work compared with submissions still awaiting feedback.
          </p>
          <div className="mt-6">
            <StackedBar
              title="Submissions"
              segments={[
                {
                  label: "Graded",
                  value: summary.gradedSubmissions,
                  className: "bg-emerald-500",
                },
                {
                  label: "Awaiting grade",
                  value: summary.awaitingGrade,
                  className: "bg-amber-400",
                },
              ]}
            />
          </div>
          <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
            Average grade:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {summary.averageGrade === null
                ? "N/A"
                : Number(summary.averageGrade).toLocaleString()}
            </span>
          </p>
        </article>
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

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Quiz attempts"
          value={formatNumber(summary.totalQuizAttempts)}
          subtitle={`${formatNumber(summary.uniqueQuizzesAttempted)} unique quizzes attempted`}
          icon={ClipboardCheck}
        />
        <MetricCard
          title="Average quiz score"
          value={summary.averageQuizScore === null
            ? "N/A"
            : `${summary.averageQuizScore}%`}
          subtitle={summary.quizPassRate === null
            ? "No submitted attempts yet"
            : `${summary.quizPassRate}% pass rate`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Assignments overdue"
          value={formatNumber(summary.overdueAssignments)}
          subtitle={`${formatNumber(summary.missingAssignments)} not submitted`}
          icon={Activity}
        />
        <MetricCard
          title="Certificates earned"
          value={formatNumber(summary.certificatesEarned)}
          icon={GraduationCap}
        />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <StackedBar
          title="Quiz score distribution"
          segments={(data.quizAnalytics?.scoreDistribution || []).map(
            (entry) => ({
              label: entry.bucket,
              value: entry.attempts,
              className: {
                "0-49%": "bg-rose-400",
                "50-69%": "bg-amber-400",
                "70-79%": "bg-yellow-400",
                "80-89%": "bg-cyan-500",
                "90-100%": "bg-emerald-500",
              }[entry.bucket] || "bg-indigo-400",
            })
          )}
        />
        <StackedBar
          title="Assignment grade distribution"
          segments={(data.assignmentAnalytics?.gradeDistribution || []).map(
            (entry) => ({
              label: entry.bucket,
              value: entry.submissions,
              className: {
                "0-49%": "bg-rose-400",
                "50-69%": "bg-amber-400",
                "70-79%": "bg-yellow-400",
                "80-89%": "bg-cyan-500",
                "90-100%": "bg-emerald-500",
              }[entry.bucket] || "bg-indigo-400",
            })
          )}
        />
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200
                        bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-5 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">
              Recent quiz attempts
            </h2>
          </div>
          {(data.quizAnalytics?.recentAttempts || []).length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No quiz attempts yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.quizAnalytics.recentAttempts.map((attempt) => (
                <div key={attempt.attempt_id}
                     className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold
                                  text-slate-800 dark:text-slate-100">
                      {attempt.quiz_title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {attempt.course_title} · Attempt {attempt.attempt_number}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold
                                   text-indigo-600 dark:text-indigo-400">
                    {attempt.score_percentage === null
                      ? attempt.status
                      : `${attempt.score_percentage}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200
                        bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-5 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">
              Recent assignment feedback
            </h2>
          </div>
          {(data.assignmentAnalytics?.recentGrades || []).length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              No graded assignments yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.assignmentAnalytics.recentGrades.map((grade) => (
                <div key={grade.submission_id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800
                                    dark:text-slate-100">
                        {grade.assignment_title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {grade.course_title}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold
                                     text-indigo-600 dark:text-indigo-400">
                      {grade.grade_percentage === null
                        ? `${grade.grade} points`
                        : `${grade.grade_percentage}%`}
                    </span>
                  </div>
                  {grade.feedback && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {grade.feedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white
                          p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-bold text-slate-900 dark:text-white">
          Available quizzes
        </h2>
        {(data.quizAnalytics?.availableQuizzes || []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No published quizzes are available in your enrolled courses.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {data.quizAnalytics.availableQuizzes.map((quiz) => (
              <div key={quiz.quiz_id}
                   className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800
                                dark:text-slate-100">{quiz.quiz_title}</p>
                  <p className="text-xs text-slate-500">{quiz.course_title}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {formatNumber(quiz.attempts_remaining)} of{" "}
                  {formatNumber(quiz.max_attempts)} attempts remaining
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {data.historyLimitations?.lessonProgress} {data.historyLimitations?.enrollment}
      </p>
    </>
  );
}

function InstructorAnalytics({ data }) {
  const summary = data.summary;
  const courses = data.courses || [];
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [courseId, setCourseId] = useState("");
  const [search, setSearch] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");

  useEffect(() => {
    let active = true;
    getInstructorStudentPerformance({
      page,
      pageSize: 10,
      courseId: courseId || undefined,
      search: search.trim() || undefined,
      sortBy: "student_name",
      sortOrder: "asc",
    })
      .then((result) => {
        if (active) {
          setStudents(result.students);
          setPagination(result.pagination);
          setStudentsError("");
        }
      })
      .catch((error) => {
        if (active) {
          setStudentsError(
            error.response?.data?.message ||
              "Unable to load course students."
          );
        }
      })
      .finally(() => {
        if (active) {
          setStudentsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [courseId, page, search]);

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

      <EnrollmentBars courses={courses} />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Quiz attempts"
          value={formatNumber(summary.quizAttempts)}
          subtitle={`${formatNumber(summary.totalQuizzes)} quizzes`}
          icon={ClipboardCheck}
        />
        <MetricCard
          title="Average quiz performance"
          value={summary.averageQuizPerformance === null
            ? "N/A"
            : `${summary.averageQuizPerformance}%`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Course completion"
          value={`${Number(summary.courseCompletionRate) || 0}%`}
          subtitle="Completed enrollments"
          icon={CheckCircle2}
        />
        <MetricCard
          title="Awaiting grading"
          value={formatNumber(summary.awaitingGrade)}
          subtitle={summary.averageGradingTurnaroundHours === null
            ? "No grading history available"
            : `${summary.averageGradingTurnaroundHours} hour average turnaround`}
          icon={Activity}
        />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <TrendBars
          title="Monthly course activity"
          data={data.activityByMonth || []}
          series={[
            { key: "quiz_attempts", label: "Quiz attempts", color: "bg-amber-400" },
            {
              key: "assignment_submissions",
              label: "Submissions",
              color: "bg-cyan-500",
            },
            {
              key: "assignments_graded",
              label: "Graded",
              color: "bg-emerald-500",
            },
          ]}
        />
        <StackedBar
          title="Assignment grade distribution"
          segments={(data.gradingDistribution || []).map((entry) => ({
            label: entry.bucket,
            value: entry.submissions,
            className: {
              "0-49%": "bg-rose-400",
              "50-69%": "bg-amber-400",
              "70-79%": "bg-yellow-400",
              "80-89%": "bg-cyan-500",
              "90-100%": "bg-emerald-500",
            }[entry.bucket] || "bg-indigo-400",
          }))}
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

      <section className="mt-8 overflow-hidden rounded-2xl border
                          border-slate-200 bg-white dark:border-slate-800
                          dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-4
                        border-b border-slate-100 p-6 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Student performance
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enrollment, progress, quiz results, and assignment review status
              for students in your courses.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="relative">
              <span className="sr-only">Search students</span>
              <Search size={16} className="absolute left-3 top-1/2
                                           -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search students"
                className="rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3
                           text-sm dark:border-slate-700 dark:bg-slate-950
                           dark:text-white"
              />
            </label>
            <label>
              <span className="sr-only">Filter by course</span>
              <select
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2
                           text-sm dark:border-slate-700 dark:bg-slate-950
                           dark:text-white"
              >
                <option value="">All courses</option>
                {courses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {studentsError && (
          <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm
                                    text-red-700 dark:bg-red-950
                                    dark:text-red-300">
            {studentsError}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide
                              text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-5 py-3 font-semibold">Student</th>
                <th className="px-5 py-3 font-semibold">Course</th>
                <th className="px-5 py-3 font-semibold">Progress</th>
                <th className="px-5 py-3 font-semibold">Quiz avg.</th>
                <th className="px-5 py-3 font-semibold">Assignment avg.</th>
                <th className="px-5 py-3 font-semibold">Ungraded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {studentsLoading ? (
                <tr><td className="px-5 py-8 text-center text-slate-500"
                        colSpan="6">Loading student analytics…</td></tr>
              ) : students.length === 0 ? (
                <tr><td className="px-5 py-8 text-center text-slate-500"
                        colSpan="6">No students match these filters.</td></tr>
              ) : students.map((student) => (
                <tr key={student.enrollment_id}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-800
                                  dark:text-slate-100">{student.student_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {student.student_email}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                    {student.course_title}
                  </td>
                  <td className="px-5 py-4">
                    {formatNumber(student.completed_lessons)} /{" "}
                    {formatNumber(student.total_lessons)} lessons
                    <p className="mt-1 text-xs text-slate-500">
                      {student.completion_percentage}%
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {student.quiz_average === null
                      ? "N/A"
                      : `${student.quiz_average}%`}
                  </td>
                  <td className="px-5 py-4">
                    {student.assignment_average === null
                      ? "N/A"
                      : `${student.assignment_average}%`}
                  </td>
                  <td className="px-5 py-4">
                    {formatNumber(student.ungraded_assignments)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-4 border-t
                        border-slate-100 px-5 py-4 text-sm
                        dark:border-slate-800">
          <span className="text-slate-500">
            {formatNumber(pagination.total)} students · page {pagination.page} of{" "}
            {Math.max(1, pagination.totalPages)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={studentsLoading || page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5
                         disabled:opacity-40 dark:border-slate-700"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={studentsLoading || page >= pagination.totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5
                         disabled:opacity-40 dark:border-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {data.historyLimitations?.lessonProgress} {data.historyLimitations?.enrollment}
      </p>
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

      <section
        className="mt-8 grid gap-5 rounded-2xl border border-slate-200 bg-white p-6
                   shadow-sm sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900 analytics-enter"
        aria-label="Platform summary charts"
      >
        <StackedBar
          title="User roles"
          segments={[
            {
              label: "Students",
              value: summary.total_students,
              className: "bg-indigo-500",
            },
            {
              label: "Instructors",
              value: summary.total_instructors,
              className: "bg-cyan-500",
            },
            {
              label: "Administrators",
              value: summary.total_administrators,
              className: "bg-violet-500",
            },
          ]}
        />
        <StackedBar
          title="Course publishing"
          segments={[
            {
              label: "Published",
              value: summary.published_courses,
              className: "bg-emerald-500",
            },
            {
              label: "Other",
              value: Math.max(
                0,
                Number(summary.total_courses) -
                  Number(summary.published_courses)
              ),
              className: "bg-indigo-300",
            },
          ]}
        />
        <StackedBar
          title="Enrollment completion"
          segments={[
            {
              label: "Completed",
              value: summary.completed_enrollments,
              className: "bg-emerald-500",
            },
            {
              label: "In progress",
              value: Math.max(
                0,
                Number(summary.total_enrollments) -
                  Number(summary.completed_enrollments)
              ),
              className: "bg-amber-400",
            },
          ]}
        />
        <StackedBar
          title="Assignment reviews"
          segments={[
            {
              label: "Graded",
              value: summary.graded_submissions,
              className: "bg-cyan-500",
            },
            {
              label: "Awaiting grade",
              value: Math.max(
                0,
                Number(summary.total_submissions) -
                  Number(summary.graded_submissions)
              ),
              className: "bg-amber-400",
            },
          ]}
        />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <TrendBars
          title="Monthly platform activity"
          data={data.monthlyTrends || []}
          series={[
            { key: "new_users", label: "New users", color: "bg-indigo-500" },
            {
              key: "new_enrollments",
              label: "Enrollments",
              color: "bg-cyan-500",
            },
          ]}
        />
        <TrendBars
          title="Monthly learning activity"
          data={data.monthlyTrends || []}
          series={[
            {
              key: "quiz_attempts",
              label: "Quiz attempts",
              color: "bg-amber-400",
            },
            {
              key: "assignment_submissions",
              label: "Submissions",
              color: "bg-emerald-500",
            },
            {
              key: "assignments_graded",
              label: "Graded",
              color: "bg-violet-500",
            },
          ]}
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
    let active = true;

    const fetchAnalytics = async () => {
      try {
        const result = await getAnalyticsOverview();
        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              "Unable to load analytics. Please try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchAnalytics();
    return () => {
      active = false;
    };
  }, []);

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
