import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import DashboardSidebar from "../components/DashboardSidebar";
import { useAuth } from "../context/AuthContext";
import { getAssignments, getMyAssignmentSubmissions } from "../services/assignmentService";
import { getMyEnrollments } from "../services/enrollmentService";
import { getMyQuizAttempts, getQuizzes } from "../services/quizService";

function errorMessage(error) {
  return error?.response?.data?.message || error?.message || "Unable to load assessment data.";
}

function formatDate(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function StudentAssessments() {
  const { user } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return undefined;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, loading]);

  const loadData = useCallback(async (isCurrent = () => true) => {
    setRefreshing(true);
    const loadErrors = [];
    const [enrollmentsResponse, attemptsResponse, submissionsResponse] =
      await Promise.allSettled([
        getMyEnrollments(),
        getMyQuizAttempts(),
        getMyAssignmentSubmissions(),
      ]);

    const enrollmentRows = enrollmentsResponse.status === "fulfilled"
      ? enrollmentsResponse.value.data || []
      : [];
    if (enrollmentsResponse.status === "rejected") {
      loadErrors.push(`Enrolled courses: ${errorMessage(enrollmentsResponse.reason)}`);
    }

    const attemptRows = attemptsResponse.status === "fulfilled"
      ? attemptsResponse.value.attempts || []
      : [];
    if (attemptsResponse.status === "rejected") {
      loadErrors.push(`Quiz attempts: ${errorMessage(attemptsResponse.reason)}`);
    }

    const submissions = submissionsResponse.status === "fulfilled"
      ? submissionsResponse.value.submissions || []
      : [];
    if (submissionsResponse.status === "rejected") {
      loadErrors.push(`Submissions: ${errorMessage(submissionsResponse.reason)}`);
    }

    if (!isCurrent()) return;
    setCourses(enrollmentRows);
    setAttempts(attemptRows);

    const courseData = await Promise.all(
      enrollmentRows.map(async (course) => {
        const [assignmentResult, quizResult] = await Promise.allSettled([
          getAssignments(course.course_id),
          getQuizzes(course.course_id),
        ]);
        if (assignmentResult.status === "rejected") {
          loadErrors.push(`${course.title} assignments: ${errorMessage(assignmentResult.reason)}`);
        }
        if (quizResult.status === "rejected") {
          loadErrors.push(`${course.title} quizzes: ${errorMessage(quizResult.reason)}`);
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

    if (!isCurrent()) return;
    const courseNames = new Map(
      enrollmentRows.map((course) => [String(course.course_id), course.title])
    );
    const submissionMap = new Map(
      submissions.map((submission) => [String(submission.assignment_id), submission])
    );
    setAssignments(
      courseData.flatMap((result) => result.assignments).map((assignment) => {
        const submission = submissionMap.get(String(assignment.id));
        return {
          ...assignment,
          course_title: courseNames.get(String(assignment.course_id)),
          ...(submission
            ? {
                submission_id: submission.submission_id,
                submitted_at: submission.submitted_at,
                grade: submission.grade,
                feedback: submission.feedback,
                submission_status: submission.status,
              }
            : {}),
        };
      })
    );
    setQuizzes(courseData.flatMap((result) => result.quizzes));
    setErrors(loadErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => void loadData(() => active), 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const attemptsByQuiz = useMemo(() => {
    const grouped = new Map();
    attempts.forEach((attempt) => {
      const quizId = String(attempt.quiz_id);
      grouped.set(quizId, [...(grouped.get(quizId) || []), attempt]);
    });
    return grouped;
  }, [attempts]);

  const releasedGrades = [
    ...attempts
      .filter((attempt) => attempt.score !== null && attempt.score !== undefined)
      .map((attempt) => ({
        key: `quiz-${attempt.attempt_id}`,
        title: attempt.quiz_title,
        course: courses.find((course) => String(course.course_id) === String(
          quizzes.find((quiz) => String(quiz.id) === String(attempt.quiz_id))?.course_id
        ))?.title,
        score: `${attempt.percentage}% · ${attempt.score} / ${attempt.total_points}`,
        feedback: attempt.instructor_feedback,
        date: attempt.submitted_at,
        passed: attempt.passed,
        to: "/my-assessments#attempts",
        linkLabel: "View attempt history",
      })),
    ...assignments
      .filter((assignment) => assignment.grade !== null && assignment.grade !== undefined)
      .map((assignment) => ({
        key: `assignment-${assignment.submission_id}`,
        title: assignment.title,
        course: assignment.course_title,
        score: `${assignment.grade} / ${assignment.max_points} points`,
        feedback: assignment.feedback,
        date: assignment.submitted_at,
        to: `/courses/${assignment.course_id}/assignments`,
        linkLabel: "Open assignment",
      })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" /> Loading assessments...
      </main>
    );
  }

  const visibleQuizzes = quizzes.filter(
    (quiz) => quiz.is_published && !quiz.archived_at
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-start">
        <DashboardSidebar role="student" />
        <main className="min-w-0 flex-1 space-y-8">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Link to="/student-dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-700">
                <ArrowLeft className="h-4 w-4" /> Student dashboard
              </Link>
              <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-indigo-700">
                {user?.full_name || "Student"} · Learning workspace
              </p>
              <h1 className="mt-1 text-3xl font-bold">Assessments & grades</h1>
              <p className="mt-2 text-slate-600">
                Review available course assessments, your submissions, and released grades.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </header>

          {errors.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Some information could not be loaded.</p>
                <ul className="mt-1 list-inside list-disc">
                  {errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
                </ul>
              </div>
            </div>
          )}

          <Section
            id="quizzes"
            title="Available quizzes"
            description="Only published quizzes from courses you are enrolled in are listed."
          >
            {visibleQuizzes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                No published quizzes are currently listed for your courses.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleQuizzes.map((quiz) => {
                  const quizAttempts = attemptsByQuiz.get(String(quiz.id)) || [];
                  const activeAttempt = quizAttempts.find((attempt) => attempt.status === "in_progress");
                  const remaining = quiz.max_attempts === null || quiz.max_attempts === undefined
                    ? null
                    : Math.max(0, Number(quiz.max_attempts) - quizAttempts.length);
                  const opensAt = quiz.opens_at ? new Date(quiz.opens_at).getTime() : null;
                  const closesAt = quiz.closes_at ? new Date(quiz.closes_at).getTime() : null;
                  const upcoming = opensAt !== null && now < opensAt;
                  const closed = closesAt !== null && now >= closesAt;
                  const disabled = !activeAttempt && (upcoming || closed || remaining === 0);
                  return (
                    <article key={quiz.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{quiz.title}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {courses.find((course) => String(course.course_id) === String(quiz.course_id))?.title}
                          </p>
                        </div>
                        <GraduationCap className="h-5 w-5 shrink-0 text-indigo-600" />
                      </div>
                      <p className="mt-4 text-sm text-slate-600">
                        {quiz.question_count} questions · {quiz.time_limit_minutes} minutes · {
                          remaining === null ? "Unlimited attempts" : `${remaining} attempts remaining`
                        }
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {opensAt && `Opens ${formatDate(quiz.opens_at)}`}
                        {opensAt && closesAt && " · "}
                        {closesAt && `Closes ${formatDate(quiz.closes_at)}`}
                      </p>
                      <Link
                        aria-disabled={disabled}
                        tabIndex={disabled ? -1 : undefined}
                        to={`/quizzes/${quiz.id}/take`}
                        className={`mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-semibold ${
                          disabled
                            ? "pointer-events-none bg-slate-100 text-slate-400"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {activeAttempt
                          ? "Resume attempt"
                          : upcoming
                            ? "Not open yet"
                            : closed
                              ? "Closed"
                              : remaining === null || remaining > 0
                                ? "Start quiz"
                                : "Attempt limit reached"}
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </Section>

          <Section id="attempts" title="Quiz attempt history">
            {attempts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                Your attempts will appear here after you start an assessment.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {attempts.map((attempt) => {
                  const released = attempt.score !== null && attempt.score !== undefined;
                  const status = attempt.status === "in_progress"
                    ? "In progress"
                    : attempt.status === "expired"
                      ? "Expired"
                      : attempt.grading_status === "pending_manual"
                        ? "Awaiting grading"
                        : released
                          ? "Result published"
                          : "Awaiting publication";
                  return (
                    <article key={attempt.attempt_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0">
                      <div>
                        <h3 className="font-semibold">{attempt.quiz_title}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Attempt {attempt.attempt_number} · {formatDate(attempt.submitted_at || attempt.started_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          released ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                        }`}>
                          {status}
                        </span>
                        {released && <strong className="text-sm text-indigo-700">{attempt.percentage}%</strong>}
                        {attempt.status === "in_progress" && (
                          <Link to={`/quizzes/${attempt.quiz_id}/take`} className="text-sm font-semibold text-indigo-700">
                            Continue
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            id="assignments"
            title="Assignments"
            description="Submission forms and policies are managed on each course's assignment page."
          >
            {assignments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                No published assignments are listed for your enrolled courses.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {assignments.map((assignment) => {
                  const overdue = !assignment.submission_id &&
                    assignment.due_at &&
                    new Date(assignment.due_at).getTime() < now;
                  return (
                    <article key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{assignment.title}</h3>
                          <p className="mt-1 text-sm text-slate-500">{assignment.course_title}</p>
                        </div>
                        <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
                      </div>
                      <p className={`mt-3 text-xs ${overdue ? "font-semibold text-rose-700" : "text-slate-500"}`}>
                        {overdue ? "Past due · " : "Due · "}{formatDate(assignment.due_at)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignment.submission_id
                          ? assignment.grade !== null && assignment.grade !== undefined
                            ? `Graded · ${assignment.grade} / ${assignment.max_points} points`
                            : "Submitted · awaiting grading"
                          : "Not submitted"}
                      </p>
                      <Link to={`/courses/${assignment.course_id}/assignments`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
                        {assignment.submission_id ? "View submission" : "Open assignment"}
                        <CalendarClock className="h-4 w-4" />
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </Section>

          <Section id="submissions" title="My submissions">
            {assignments.filter((assignment) => assignment.submission_id).length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                You have not submitted course assignments yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {assignments.filter((assignment) => assignment.submission_id).map((assignment) => (
                  <article key={assignment.submission_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0">
                    <div>
                      <h3 className="font-semibold">{assignment.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignment.course_title} · Submitted {formatDate(assignment.submitted_at)}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-slate-600">
                      {assignment.grade !== null && assignment.grade !== undefined
                        ? `${assignment.grade} / ${assignment.max_points}`
                        : "Awaiting grade"}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </Section>

          <Section id="grades" title="Grades and feedback">
            {releasedGrades.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                No released quiz or assignment grades yet. Pending grading is not shown as a zero.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {releasedGrades.map((grade) => (
                  <article key={grade.key} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{grade.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {grade.course} · {formatDate(grade.date)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700">
                        {grade.passed === false ? <Clock3 className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {grade.score}
                      </span>
                    </div>
                    {grade.feedback && (
                      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                        {grade.feedback}
                      </p>
                    )}
                    <Link to={grade.to} className="mt-3 inline-flex text-sm font-semibold text-indigo-700">
                      {grade.linkLabel}
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </main>
      </div>
    </div>
  );
}
