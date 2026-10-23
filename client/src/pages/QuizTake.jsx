import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Clock3, Loader2, Send } from "lucide-react";
import {
  getQuiz,
  startQuizAttempt,
  submitQuizAttempt,
} from "../services/quizService";

export default function QuizTake() {
  const { quizId } = useParams();

  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadQuiz = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getQuiz(quizId);
      setQuiz(data.quiz);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this quiz.");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  useEffect(() => {
    if (!deadline || result) return;

    function updateTimer() {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)
      );
      setRemaining(seconds);
    }

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [deadline, result]);

  const submit = useCallback(async (automatic = false) => {
    if (!attempt || result || submitting) return;

    try {
      setSubmitting(true);
      setError("");

      const answerList = Object.entries(answers).map(
        ([questionId, optionId]) => ({
          question_id: questionId,
          option_id: optionId,
        })
      );

      const response = await submitQuizAttempt(attempt.id, answerList);
      setResult(response.result);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (automatic ? "The quiz timed out. Submission failed." : "Could not submit quiz.")
      );
    } finally {
      setSubmitting(false);
    }
  }, [attempt, answers, result, submitting]);

  useEffect(() => {
    if (attempt && remaining === 0 && !result && !submitting) {
      submit(true);
    }
  }, [attempt, remaining, result, submitting, submit]);

  async function beginAttempt() {
    try {
      setStarting(true);
      setError("");

      const response = await startQuizAttempt(quizId);
      setAttempt(response.attempt);
      setDeadline(response.deadline);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not start this quiz."
      );
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading quiz...
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <p role="alert" className="text-red-400">{error}</p>
        <Link to="/my-learning" className="mt-4 inline-block underline">
          Back to My Learning
        </Link>
      </main>
    );
  }

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link to="/my-learning" className="text-sm text-slate-400 hover:text-white">
          ← Back to My Learning
        </Link>

        <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold text-indigo-400">ASSESSMENT</p>
          <h1 className="mt-2 text-3xl font-bold">{quiz?.title}</h1>
          <p className="mt-3 text-slate-400">{quiz?.description}</p>

          <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              {quiz?.time_limit_minutes} minutes
            </span>
            <span>{quiz?.questions?.length || 0} questions</span>
            <span>Pass: {quiz?.passing_score}%</span>
            <span>Maximum attempts: {quiz?.max_attempts}</span>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {!attempt && !result && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-slate-300">
              Your time starts when you begin. Your score is calculated on the server
              after submission.
            </p>
            <button
              onClick={beginAttempt}
              disabled={starting}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-60"
            >
              {starting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start quiz
            </button>
          </section>
        )}

        {attempt && !result && (
          <>
            <div className="sticky top-3 z-10 flex items-center justify-between rounded-xl border border-indigo-500/30 bg-slate-900/95 p-4 shadow-xl">
              <span className="text-sm text-slate-300">Time remaining</span>
              <span className={`font-mono text-xl font-bold ${
                remaining <= 60 ? "text-red-400" : "text-indigo-300"
              }`}>
                {formatTime(remaining)}
              </span>
            </div>

            {(quiz?.questions || []).map((question, index) => (
              <section
                key={question.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-semibold">
                    {index + 1}. {question.question_text}
                  </h2>
                  <span className="shrink-0 text-xs text-slate-400">
                    {question.points} points
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {(question.options || []).map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                        String(answers[question.id]) === String(option.id)
                          ? "border-indigo-500 bg-indigo-500/10"
                          : "border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={String(answers[question.id] || "") === String(option.id)}
                        onChange={() => setAnswers((previous) => ({
                          ...previous,
                          [question.id]: option.id,
                        }))}
                        className="accent-indigo-500"
                      />
                      <span>{option.option_text}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <button
              onClick={() => submit(false)}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-4 font-bold hover:bg-emerald-500 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              {submitting ? "Submitting..." : "Submit quiz"}
            </button>
          </>
        )}

        {result && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <h2 className="mt-4 text-2xl font-bold">Quiz submitted</h2>
            <p className="mt-2 text-slate-400">
              Your score has been calculated.
            </p>

            <p className="mt-6 text-5xl font-bold text-indigo-300">
              {result.percentage}%
            </p>
            <p className="mt-2 text-slate-300">
              {result.score} / {result.total_points} points
            </p>
            <p className={`mt-4 font-semibold ${
              result.passed ? "text-emerald-400" : "text-red-400"
            }`}>
              {result.passed ? "Passed" : "Not passed"}
            </p>

            <Link
              to="/my-learning"
              className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500"
            >
              Return to My Learning
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}