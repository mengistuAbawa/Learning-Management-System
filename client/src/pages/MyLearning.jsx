
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  RefreshCw,
} from "lucide-react";
import { getMyEnrollments } from "../services/enrollmentService";
import { getMyQuizAttempts } from "../services/quizService";
import { useAuth } from "../context/AuthContext";

function ProgressBar({ value = 0 }) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-slate-800"
      role="progressbar"
      aria-label="Course completion"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

function CourseCard({ enrollment }) {
  const percentage = Number(enrollment.completion_percentage) || 0;
  const completed = enrollment.enrollment_status === "completed";

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-lg transition hover:-translate-y-1 hover:border-indigo-400/40">
      {enrollment.thumbnail_url ? (
        <img
          src={enrollment.thumbnail_url}
          alt={enrollment.title}
          className="h-44 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-44 items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950">
          <BookOpen className="h-12 w-12 text-indigo-300" />
        </div>
      )}

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            {enrollment.category || "General"}
          </span>

          {completed ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Completed
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-400">
              {enrollment.enrollment_status}
            </span>
          )}
        </div>

        <div>
          <h2 className="line-clamp-2 text-lg font-bold text-white">
            {enrollment.title}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Instructor: {enrollment.instructor_name || "LearnSphere Instructor"}
          </p>
        </div>

        {enrollment.description && (
          <p className="line-clamp-2 text-sm leading-6 text-slate-400">
            {enrollment.description}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">Your progress</span>
            <span className="font-bold text-cyan-300">{percentage}%</span>
          </div>

          <ProgressBar value={percentage} />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              {enrollment.completed_lessons} of {enrollment.total_lessons} lessons
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              Enrolled{" "}
              {enrollment.enrolled_at
                ? new Date(enrollment.enrolled_at).toLocaleDateString()
                : "recently"}
            </span>
          </div>
        </div>

        {completed && (
          <p className="text-sm text-emerald-300">
            You have completed all lessons in this course.
          </p>
        )}

        <Link
          to={`/courses/${enrollment.course_id}/learn`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <BookOpen className="h-4 w-4" />
          {completed ? "Review course" : percentage > 0 ? "Continue learning" : "Start learning"}
        </Link>
      </div>
    </article>
  );
}

export default function MyLearning() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [error, setError] = useState("");
  const [attemptsError, setAttemptsError] = useState("");

  const loadEnrollments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getMyEnrollments();
      setEnrollments(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not load your courses. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  useEffect(() => {
    if (user?.role !== "student") {
      return;
    }

    let current = true;
    getMyQuizAttempts()
      .then((response) => {
        if (current) setQuizAttempts(response.attempts || []);
      })
      .catch((err) => {
        if (current) {
          setAttemptsError(
            err.response?.data?.message ||
              "Could not load your assessment results."
          );
        }
      })
      .finally(() => {
        if (current) setAttemptsLoading(false);
      });

    return () => {
      current = false;
    };
  }, [user?.role]);

  const completedCount = enrollments.filter(
    (item) => item.enrollment_status === "completed"
  ).length;

  const averageProgress = enrollments.length
    ? Math.round(
        enrollments.reduce(
          (sum, item) => sum + (Number(item.completion_percentage) || 0),
          0
        ) / enrollments.length
      )
    : 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-sm text-indigo-300">
              <GraduationCap className="h-4 w-4" />
              Student learning space
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              My Learning
            </h1>
            <p className="mt-2 text-slate-400">
              Continue your courses and track how far you have progressed.
            </p>
          </div>

          <button
            type="button"
            onClick={loadEnrollments}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Enrolled courses</p>
            <p className="mt-2 text-3xl font-extrabold">{enrollments.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Completed courses</p>
            <p className="mt-2 text-3xl font-extrabold text-emerald-400">
              {completedCount}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Average progress</p>
            <p className="mt-2 text-3xl font-extrabold text-cyan-300">
              {averageProgress}%
            </p>
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-80 animate-pulse rounded-2xl border border-white/10 bg-slate-900"
              />
            ))}
          </div>
        ) : enrollments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/50 px-6 py-16 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-slate-500" />
            <h2 className="mt-4 text-xl font-bold">Your learning journey starts here</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              You have not enrolled in any courses yet. Explore the course catalog
              and enroll in a published course to begin learning.
            </p>
            <Link
              to="/courses"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500"
            >
              Explore courses
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {enrollments.map((enrollment) => (
              <CourseCard
                key={enrollment.enrollment_id}
                enrollment={enrollment}
              />
            ))}
          </div>
        )}

        {user?.role === "student" && (
          <section className="mt-10">
            <header className="mb-4 flex items-center gap-3">
              <ClipboardCheck className="h-6 w-6 text-cyan-300" />
              <div>
                <h2 className="text-xl font-bold">Assessment results</h2>
                <p className="text-sm text-slate-400">
                  Scores appear here when they are released by your instructor.
                </p>
              </div>
            </header>

            {attemptsError && (
              <div role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
                {attemptsError}
              </div>
            )}

            {attemptsLoading ? (
              <div className="rounded-xl border border-white/10 bg-slate-900 p-5 text-sm text-slate-400">
                Loading assessment results...
              </div>
            ) : quizAttempts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-slate-900/50 p-5 text-sm text-slate-400">
                Your submitted quizzes and results will appear here.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {quizAttempts.map((attempt) => {
                  const released = attempt.score !== null && attempt.score !== undefined;
                  const pendingManual = attempt.grading_status === "pending_manual";

                  return (
                    <article
                      key={attempt.attempt_id}
                      className="rounded-xl border border-white/10 bg-slate-900 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-white">{attempt.quiz_title}</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Attempt {attempt.attempt_number}
                            {attempt.status === "in_progress"
                              ? " · In progress"
                              : attempt.status === "expired"
                                ? " · Expired"
                                : attempt.submitted_at
                              ? ` · Submitted ${new Date(attempt.submitted_at).toLocaleString()}`
                              : ""}
                          </p>
                        </div>
                        {attempt.status === "expired" ? (
                          <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300">
                            Expired
                          </span>
                        ) : released ? (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            attempt.passed
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "bg-rose-400/10 text-rose-300"
                          }`}>
                            {attempt.passed ? "Passed" : "Not passed"}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
                            {pendingManual ? "Awaiting grading" : "Awaiting publication"}
                          </span>
                        )}
                      </div>

                      {released && (
                        <p className="mt-3 text-sm text-cyan-200">
                          {attempt.percentage}% · {attempt.score} / {attempt.total_points} points
                        </p>
                      )}
                      {attempt.status === "in_progress" && (
                        <Link
                          to={`/quizzes/${attempt.quiz_id}/take`}
                          className="mt-3 inline-flex text-sm font-semibold text-indigo-300 hover:text-indigo-200"
                        >
                          Continue assessment
                        </Link>
                      )}
                      {attempt.instructor_feedback && (
                        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
                          {attempt.instructor_feedback}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
