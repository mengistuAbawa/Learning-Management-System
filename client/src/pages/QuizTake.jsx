import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  getMyQuizAttempts,
  getQuiz,
  getQuizAttempt,
  saveQuizAnswer,
  startQuizAttempt,
  submitQuizAttempt,
  updateQuizQuestionFlags,
} from "../services/quizService";

function answersToMap(answers = []) {
  return Object.fromEntries(
    answers.map((answer) => [
      String(answer.question_id),
      {
        option_ids: (answer.option_ids || []).map(String),
        answer_text: answer.answer_text || "",
      },
    ])
  );
}

function readLocalAnswers(attemptId) {
  try {
    const stored = localStorage.getItem(`learnsphere-quiz-${attemptId}`);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function QuizTake() {
  const { quizId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});
  const [result, setResult] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showUnanswered, setShowUnanswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answersReady, setAnswersReady] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [saveError, setSaveError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [error, setError] = useState("");
  const previousAnswers = useRef({});
  const submitRef = useRef(null);
  const questions = quiz?.questions || [];

  const answeredIds = useMemo(
    () =>
      new Set(
        Object.entries(answers)
          .filter(([, answer]) =>
            answer.option_ids?.length || answer.answer_text?.trim()
          )
          .map(([id]) => id)
      ),
    [answers]
  );
  const unansweredCount = questions.length - answeredIds.size;
  const completion = questions.length
    ? Math.round((answeredIds.size / questions.length) * 100)
    : 0;
  const currentQuestion = questions[currentIndex];

  const applyAttempt = useCallback(async (attemptId) => {
    const data = await getQuizAttempt(attemptId);
    const serverAnswers = answersToMap(data.answers);
    const localAnswers = readLocalAnswers(attemptId);
    const restoredAnswers = { ...serverAnswers, ...localAnswers };

    setAttempt(data.attempt);
    setQuiz(data.quiz);
    setAnswers(restoredAnswers);
    setFlags(
      Object.fromEntries(
        (data.flags || []).map((flag) => [
          String(flag.question_id),
          {
            is_bookmarked: flag.is_bookmarked,
            needs_revision: flag.needs_revision,
          },
        ])
      )
    );
    previousAnswers.current = serverAnswers;
    if (data.attempt.status === "submitted") {
      setResult(data.attempt);
    }
    setAnswersReady(true);
  }, []);

  const loadQuiz = useCallback(async () => {
    try {
      const attemptsData = await getMyQuizAttempts();
      const currentAttempt = (attemptsData.attempts || []).find(
        (item) =>
          String(item.quiz_id) === String(quizId) &&
          item.status === "in_progress"
      );

      if (currentAttempt) {
        await applyAttempt(currentAttempt.attempt_id);
      } else {
        const data = await getQuiz(quizId);
        setQuiz(data.quiz);
        const usedAttempts = (attemptsData.attempts || []).filter(
          (item) => String(item.quiz_id) === String(quizId)
        ).length;
        setAttemptsRemaining(
          Math.max(0, Number(data.quiz.max_attempts) - usedAttempts)
        );
        setAttempt(null);
        setResult(null);
        setAnswers({});
        setFlags({});
        setAnswersReady(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this assessment.");
    } finally {
      setLoading(false);
    }
  }, [applyAttempt, quizId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadQuiz();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQuiz]);

  useEffect(() => {
    if (!attempt?.deadline || result) return undefined;
    const timer = window.setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(attempt.deadline).getTime() - Date.now()) / 1000)
      );
      setRemaining(seconds);
      if (seconds === 0 && attempt.status === "in_progress") {
        submitRef.current?.(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.deadline, attempt?.status, result]);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!attempt || !answersReady) return;
    localStorage.setItem(
      `learnsphere-quiz-${attempt.id}`,
      JSON.stringify(answers)
    );
  }, [answers, answersReady, attempt]);

  useEffect(() => {
    if (!attempt || !answersReady || result || attempt.status !== "in_progress") {
      return undefined;
    }

    const changedAnswers = Object.entries(answers).filter(
      ([questionId, answer]) =>
        JSON.stringify(previousAnswers.current[questionId] || null) !==
        JSON.stringify(answer)
    );
    if (!changedAnswers.length) return undefined;

    setSaveState(offline ? "offline" : "saving");
    setSaveError("");
    const timer = window.setTimeout(async () => {
      try {
        if (offline) {
          setSaveState("offline");
          return;
        }
        await Promise.all(
          changedAnswers.map(([questionId, answer]) =>
            saveQuizAnswer(attempt.id, questionId, answer)
          )
        );
        for (const [questionId, answer] of changedAnswers) {
          previousAnswers.current[questionId] = answer;
        }
        setSaveState("saved");
      } catch (err) {
        setSaveState("failed");
        setSaveError(
          err.response?.data?.message || "Your latest answer was not saved."
        );
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [answers, answersReady, attempt, offline, result]);

  const submit = useCallback(
    async (automatic = false) => {
      if (!attempt || result || submitting) return;
      if (!automatic && !window.confirm(
        unansweredCount
          ? `You have ${unansweredCount} unanswered question(s). Submit anyway?`
          : "Submit your assessment now?"
      )) {
        return;
      }

      try {
        setSubmitting(true);
        setError("");
        if (!offline && attempt.status === "in_progress" && remaining > 0) {
          const unsaved = Object.entries(answers).filter(
            ([questionId, answer]) =>
              JSON.stringify(previousAnswers.current[questionId] || null) !==
              JSON.stringify(answer)
          );
          await Promise.all(
            unsaved.map(([questionId, answer]) =>
              saveQuizAnswer(attempt.id, questionId, answer)
            )
          );
        }
        const response = await submitQuizAttempt(attempt.id);
        setResult(response.result);
        setAttempt((current) => ({ ...current, status: "submitted" }));
        localStorage.removeItem(`learnsphere-quiz-${attempt.id}`);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            (automatic
              ? "The time expired, but submission could not be confirmed. Retry when connected."
              : "Could not submit your assessment.")
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      answers,
      attempt,
      offline,
      remaining,
      result,
      submitting,
      unansweredCount,
    ]
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  async function beginAttempt() {
    try {
      setStarting(true);
      setError("");
      const response = await startQuizAttempt(quizId);
      await applyAttempt(response.attempt.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not start this assessment.");
    } finally {
      setStarting(false);
    }
  }

  function updateAnswer(questionId, answer) {
    setAnswers((current) => ({
      ...current,
      [String(questionId)]: answer,
    }));
  }

  async function toggleFlag(questionId, flagName) {
    const id = String(questionId);
    const nextFlags = {
      ...(flags[id] || { is_bookmarked: false, needs_revision: false }),
      [flagName]: !(flags[id]?.[flagName] || false),
    };
    setFlags((current) => ({ ...current, [id]: nextFlags }));
    try {
      await updateQuizQuestionFlags(attempt.id, id, nextFlags);
    } catch (err) {
      setFlags((current) => ({ ...current, [id]: flags[id] || {} }));
      setError(err.response?.data?.message || "Could not update question flags.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f6f4] text-slate-600">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading assessment...
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <main className="min-h-screen bg-[#f3f6f4] p-8 text-slate-800">
        <p role="alert" className="text-red-700">{error}</p>
        <Link to="/my-learning" className="mt-4 inline-flex items-center gap-2 underline">
          <ArrowLeft className="h-4 w-4" /> Back to My Learning
        </Link>
      </main>
    );
  }

  if (result) {
    const pending = result.grading_status === "pending_manual";
    const released = result.released ?? result.score != null;
    return (
      <main className="min-h-screen bg-[#f3f6f4] px-4 py-12 text-slate-800">
        <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {pending ? (
            <Clock3 className="mx-auto h-14 w-14 text-amber-500" />
          ) : (
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          )}
          <h1 className="mt-4 text-2xl font-bold">
            {pending ? "Submitted for review" : "Assessment submitted"}
          </h1>
          <p className="mt-2 text-slate-600">
            {pending
              ? "Your written response is awaiting instructor grading."
              : released
                ? "Your score has been calculated."
                : "Your result will be available when your instructor publishes it."}
          </p>
          {!pending && released && result.score != null && (
            <>
              <p className="mt-6 text-5xl font-bold text-indigo-600">
                {result.percentage ?? 0}%
              </p>
              <p className="mt-2 text-slate-600">
                {result.score} / {result.total_points} points
              </p>
            </>
          )}
          <Link
            to="/my-learning"
            className="mt-7 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            Return to My Learning
          </Link>
        </section>
      </main>
    );
  }

  const isStarted = Boolean(attempt);
  const currentAnswer = currentQuestion
    ? answers[String(currentQuestion.id)] || { option_ids: [], answer_text: "" }
    : { option_ids: [], answer_text: "" };
  const visibleQuestions = showUnanswered
    ? questions.filter((question) => !answeredIds.has(String(question.id)))
    : questions;
  return (
    <main className="min-h-screen bg-[#f3f6f4] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Link to="/my-learning" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <span className="font-bold text-slate-900">LearnSphere Exams</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span
              role="status"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
                offline
                  ? "bg-amber-50 text-amber-800"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {offline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
              {offline ? "Offline" : "Connected"}
            </span>
            <span className="hidden text-slate-500 sm:inline">
              {saveState === "saving" ? "Saving answers..." :
                saveState === "failed" ? "Save failed" :
                  saveState === "offline" ? "Saved on this device" : "All answers saved"}
            </span>
          </div>
        </header>

        {(error || saveError) && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error || saveError}
          </div>
        )}

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
                {attempt ? `Attempt ${attempt.attempt_number}` : "Assessment"}
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                {quiz?.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                {quiz?.description}
              </p>
              {quiz?.instructions && !isStarted && (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  {quiz.instructions}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {questions.length} questions
              </span>
              <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {quiz?.time_limit_minutes || 30} minutes
              </span>
              {!isStarted && attemptsRemaining !== null && (
                <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {attemptsRemaining} attempts remaining
                </span>
              )}
              {isStarted ? (
                <span className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
                  remaining <= 60 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                }`}>
                  <Clock3 className="h-4 w-4" /> {formatTime(remaining)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={beginAttempt}
                  disabled={starting || !questions.length || attemptsRemaining === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {starting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {attemptsRemaining === 0 ? "No attempts remaining" : "Start assessment"}
                </button>
              )}
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs font-medium text-slate-500">
              <span>{answeredIds.size} of {questions.length} answered</span>
              <span>{completion}% complete</span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={completion}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Assessment completion"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </section>

        {isStarted && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              {currentQuestion ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-indigo-600">
                        Question {currentIndex + 1} of {questions.length}
                      </p>
                      <h2 className="mt-3 text-xl font-semibold leading-relaxed text-slate-900">
                        {currentQuestion.question_text}
                      </h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                      {currentQuestion.points} points
                    </span>
                  </div>

                  {["single_choice", "multiple_choice", "true_false"].includes(
                    currentQuestion.question_type || "single_choice"
                  ) ? (
                    <fieldset className="mt-7 space-y-3">
                      <legend className="sr-only">Choose an answer</legend>
                      {(currentQuestion.options || []).map((option) => {
                        const selected = currentAnswer.option_ids.includes(String(option.id));
                        const multi = currentQuestion.question_type === "multiple_choice";
                        return (
                          <label
                            key={option.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                              selected
                                ? "border-indigo-500 bg-indigo-50"
                                : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type={multi ? "checkbox" : "radio"}
                              name={`question-${currentQuestion.id}`}
                              checked={selected}
                              onChange={() => {
                                const selectedIds = multi
                                  ? selected
                                    ? currentAnswer.option_ids.filter((id) => id !== String(option.id))
                                    : [...currentAnswer.option_ids, String(option.id)]
                                  : [String(option.id)];
                                updateAnswer(currentQuestion.id, {
                                  option_ids: selectedIds,
                                  answer_text: "",
                                });
                              }}
                              className="h-4 w-4 accent-indigo-600"
                            />
                            <span className="text-slate-700">{option.option_text}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : (
                    <label className="mt-7 block">
                      <span className="mb-2 block text-sm font-medium text-slate-700">
                        {currentQuestion.question_type === "essay"
                          ? "Your response"
                          : "Your answer"}
                      </span>
                      <textarea
                        rows={currentQuestion.question_type === "essay" ? 8 : 3}
                        maxLength={20000}
                        value={currentAnswer.answer_text}
                        onChange={(event) =>
                          updateAnswer(currentQuestion.id, {
                            option_ids: [],
                            answer_text: event.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        placeholder="Type your answer..."
                      />
                    </label>
                  )}

                  <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFlag(currentQuestion.id, "is_bookmarked")}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          flags[String(currentQuestion.id)]?.is_bookmarked
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Bookmark className="h-4 w-4" />
                        {flags[String(currentQuestion.id)]?.is_bookmarked ? "Bookmarked" : "Bookmark"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFlag(currentQuestion.id, "needs_revision")}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          flags[String(currentQuestion.id)]?.needs_revision
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Flag className="h-4 w-4" />
                        {flags[String(currentQuestion.id)]?.needs_revision ? "Saved for revision" : "Save for revision"}
                      </button>
                    </div>
                    <span className="text-xs text-slate-500" aria-live="polite">
                      {saveState === "saving" ? "Saving..." :
                        saveState === "failed" ? "Not saved" :
                          saveState === "offline" ? "Saved locally; sync pending" : "Saved"}
                    </span>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentIndex(0)}
                        disabled={currentIndex === 0}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
                      >
                        First
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                        disabled={currentIndex === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
                      >
                        <ArrowLeft className="h-4 w-4" /> Previous
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentIndex(questions.length - 1)}
                        disabled={currentIndex === questions.length - 1}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
                      >
                        Last
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
                        disabled={currentIndex === questions.length - 1}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        Next <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => submit(false)}
                    disabled={submitting}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    {submitting ? "Submitting..." : "Submit assessment"}
                  </button>
                </>
              ) : (
                <p className="py-10 text-center text-slate-600">This assessment has no questions yet.</p>
              )}
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Question navigator</h2>
                <span className="text-sm text-slate-500">{answeredIds.size}/{questions.length}</span>
              </div>
              <button
                type="button"
                aria-pressed={showUnanswered}
                onClick={() => setShowUnanswered((current) => !current)}
                className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {showUnanswered ? "Show all questions" : `Show unanswered (${unansweredCount})`}
              </button>
              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5">
                {visibleQuestions.map((question) => {
                  const originalIndex = questions.findIndex(
                    (item) => String(item.id) === String(question.id)
                  );
                  const questionId = String(question.id);
                  const active = currentIndex === originalIndex;
                  const answered = answeredIds.has(questionId);
                  const bookmarked = flags[questionId]?.is_bookmarked;
                  const revision = flags[questionId]?.needs_revision;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      aria-label={`Question ${originalIndex + 1}${answered ? ", answered" : ", unanswered"}${bookmarked ? ", bookmarked" : ""}${revision ? ", saved for revision" : ""}`}
                      aria-current={active ? "step" : undefined}
                      onClick={() => setCurrentIndex(originalIndex)}
                      className={`relative flex aspect-square items-center justify-center rounded-lg border text-sm font-semibold ${
                        active
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : answered
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {originalIndex + 1}
                      {bookmarked && <Bookmark className="absolute -right-1 -top-1 h-3 w-3 fill-indigo-500 text-indigo-500" />}
                      {revision && <Flag className="absolute -bottom-1 -right-1 h-3 w-3 fill-amber-400 text-amber-500" />}
                      {answered && !active && <Check className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full bg-emerald-600 p-0.5 text-white" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-indigo-600" /> Current</p>
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" /> Answered</p>
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-slate-200 bg-white" /> Unanswered</p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
