import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import DashboardSidebar from "../components/DashboardSidebar";
import api from "../services/api";

export default function QuizGrading() {
  const [attempts, setAttempts] = useState([]);
  const [grades, setGrades] = useState({});
  const [feedback, setFeedback] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPending = useCallback(async () => {
    try {
      setError("");
      const response = await api.get("/instructor/quizzes/grading");
      setAttempts(response.data.attempts || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load pending assessment grading."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  function updateGrade(attemptId, question, changes) {
    setGrades((current) => ({
      ...current,
      [attemptId]: {
        ...(current[attemptId] || {}),
        [question.question_id]: {
          marks: question.max_points,
          feedback: "",
          ...(current[attemptId]?.[question.question_id] || {}),
          ...changes,
        },
      },
    }));
  }

  async function finalizeGrade(attempt) {
    const attemptId = String(attempt.attempt_id);
    setSavingId(attemptId);
    setError("");
    setSuccess("");
    try {
      const response = await api.put(
        `/instructor/quiz-attempts/${attemptId}/grade`,
        {
          grades: attempt.questions.map((question) => ({
            question_id: question.question_id,
            marks:
              grades[attemptId]?.[question.question_id]?.marks ??
              Number(question.max_points),
            feedback:
              grades[attemptId]?.[question.question_id]?.feedback || "",
          })),
          instructor_feedback: feedback[attemptId] || "",
        }
      );
      setAttempts((current) =>
        current.filter((item) => String(item.attempt_id) !== attemptId)
      );
      setSuccess(
        `Grade published: ${response.data.result.score} / ${response.data.result.total_points} points.`
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not save this grade."
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f4] px-4 py-5 text-slate-800 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-start">
        <DashboardSidebar role="instructor" />
        <main className="min-w-0 flex-1">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">
                Instructor workspace
              </p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">
                Assessment grading
              </h1>
              <p className="mt-2 text-slate-600">
                Review essay responses and publish final results.
              </p>
            </div>
            <Link
              to="/instructor-dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </header>

          {error && (
            <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="mb-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              {success}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl bg-white p-8 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading submissions...
            </div>
          ) : attempts.length === 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <h2 className="mt-3 font-semibold text-slate-900">All caught up</h2>
              <p className="mt-1 text-sm text-slate-600">
                There are no assessment responses awaiting manual grading.
              </p>
            </section>
          ) : (
            <div className="space-y-5">
              {attempts.map((attempt) => {
                const attemptId = String(attempt.attempt_id);
                const busy = savingId === attemptId;
                return (
                  <article
                    key={attemptId}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                  >
                    <header className="border-b border-slate-100 pb-4">
                      <h2 className="text-xl font-bold text-slate-900">
                        {attempt.quiz_title}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {attempt.course_title} · {attempt.student_name} ·{" "}
                        Attempt {attempt.attempt_number}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Submitted {new Date(attempt.submitted_at).toLocaleString()}
                      </p>
                    </header>

                    <div className="mt-5 space-y-5">
                      {attempt.questions.map((question) => {
                        const grade =
                          grades[attemptId]?.[question.question_id] || {
                            marks: Number(question.max_points),
                            feedback: "",
                          };
                        return (
                          <section key={question.question_id} className="rounded-xl bg-slate-50 p-4">
                            <h3 className="font-semibold text-slate-900">
                              {question.question_text}
                            </h3>
                            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                              {question.answer_text || "No response submitted."}
                            </p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-[150px_1fr]">
                              <label className="text-sm font-medium text-slate-700">
                                Marks (max {question.max_points})
                                <input
                                  type="number"
                                  min="0"
                                  max={question.max_points}
                                  step="0.01"
                                  required
                                  value={grade.marks}
                                  onChange={(event) =>
                                    updateGrade(attemptId, question, {
                                      marks: event.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                />
                              </label>
                              <label className="text-sm font-medium text-slate-700">
                                Question feedback
                                <textarea
                                  rows={2}
                                  maxLength={10000}
                                  value={grade.feedback}
                                  onChange={(event) =>
                                    updateGrade(attemptId, question, {
                                      feedback: event.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                />
                              </label>
                            </div>
                          </section>
                        );
                      })}
                    </div>

                    <label className="mt-5 block text-sm font-medium text-slate-700">
                      Overall feedback
                      <textarea
                        rows={3}
                        maxLength={10000}
                        value={feedback[attemptId] || ""}
                        onChange={(event) =>
                          setFeedback((current) => ({
                            ...current,
                            [attemptId]: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => finalizeGrade(attempt)}
                      disabled={busy}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {busy ? "Publishing grade..." : "Publish grade"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
