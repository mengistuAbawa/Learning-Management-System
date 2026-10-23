import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  addQuestion,
  createQuiz,
  getQuizzes,
} from "../services/quizService";

const initialQuiz = {
  title: "",
  description: "",
  time_limit_minutes: 30,
  passing_score: 50,
  max_attempts: 3,
  is_published: false,
};

const initialQuestion = {
  question_text: "",
  points: 1,
  options: [
    { text: "", is_correct: true },
    { text: "", is_correct: false },
    { text: "", is_correct: false },
    { text: "", is_correct: false },
  ],
};

export default function QuizManagement() {
  const { courseId } = useParams();
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState("");
  const [quizForm, setQuizForm] = useState(initialQuiz);
  const [questionForm, setQuestionForm] = useState(initialQuestion);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadQuizzes = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await getQuizzes(courseId);
      setQuizzes(result.quizzes || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load quizzes.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  async function handleCreateQuiz(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const result = await createQuiz(courseId, {
        ...quizForm,
        time_limit_minutes: Number(quizForm.time_limit_minutes),
        passing_score: Number(quizForm.passing_score),
        max_attempts: Number(quizForm.max_attempts),
      });

      setSelectedQuiz(String(result.quiz.id));
      setQuizForm(initialQuiz);
      setMessage("Quiz created. Now add questions.");
      await loadQuizzes();
    } catch (err) {
      setError(err.response?.data?.message || "Could not create quiz.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddQuestion(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      setError("");

      await addQuestion(selectedQuiz, {
        ...questionForm,
        points: Number(questionForm.points),
        options: questionForm.options.filter((option) => option.text.trim()),
      });

      setQuestionForm(initialQuestion);
      setMessage("Question added successfully.");
      await loadQuizzes();
    } catch (err) {
      setError(err.response?.data?.message || "Could not add question.");
    } finally {
      setSaving(false);
    }
  }

  function updateOption(index, changes) {
    setQuestionForm((previous) => ({
      ...previous,
      options: previous.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...changes } : option
      ),
    }));
  }

  function addOption() {
    if (questionForm.options.length >= 10) return;
    setQuestionForm((previous) => ({
      ...previous,
      options: [...previous.options, { text: "", is_correct: false }],
    }));
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-400">INSTRUCTOR WORKSPACE</p>
            <h1 className="mt-2 text-3xl font-bold">Quiz Management</h1>
            <p className="mt-2 text-slate-400">
              Create assessments and build multiple-choice questions.
            </p>
          </div>

          <Link
            to={`/courses/${courseId}/learn`}
            className="rounded-xl border border-slate-700 px-4 py-3 hover:bg-slate-800"
          >
            Back to course
          </Link>
        </header>

        {message && (
          <div className="rounded-xl bg-emerald-500/10 p-4 text-emerald-300">
            {message}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 flex items-center gap-2 text-xl font-bold">
            <Plus className="h-5 w-5 text-indigo-400" />
            Create quiz
          </h2>

          <form onSubmit={handleCreateQuiz} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm text-slate-300">Quiz title</span>
              <input
                required
                minLength={2}
                maxLength={200}
                value={quizForm.title}
                onChange={(event) => setQuizForm({
                  ...quizForm,
                  title: event.target.value,
                })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-500"
                placeholder="e.g. React Fundamentals Quiz"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm text-slate-300">Description</span>
              <textarea
                rows={3}
                value={quizForm.description}
                onChange={(event) => setQuizForm({
                  ...quizForm,
                  description: event.target.value,
                })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-500"
                placeholder="Describe what students will be assessed on."
              />
            </label>

            <NumberField
              label="Time limit (minutes)"
              min={1}
              max={600}
              value={quizForm.time_limit_minutes}
              onChange={(value) => setQuizForm({
                ...quizForm,
                time_limit_minutes: value,
              })}
            />
            <NumberField
              label="Passing percentage"
              min={0}
              max={100}
              value={quizForm.passing_score}
              onChange={(value) => setQuizForm({
                ...quizForm,
                passing_score: value,
              })}
            />
            <NumberField
              label="Maximum attempts"
              min={1}
              max={20}
              value={quizForm.max_attempts}
              onChange={(value) => setQuizForm({
                ...quizForm,
                max_attempts: value,
              })}
            />

            <label className="flex items-center gap-3 self-end rounded-xl border border-slate-700 p-3">
              <input
                type="checkbox"
                checked={quizForm.is_published}
                onChange={(event) => setQuizForm({
                  ...quizForm,
                  is_published: event.target.checked,
                })}
                className="h-4 w-4 accent-indigo-500"
              />
              <span className="text-sm">Publish quiz</span>
            </label>

            <button
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-60 sm:col-span-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create quiz
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 flex items-center gap-2 text-xl font-bold">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            Add question
          </h2>

          <form onSubmit={handleAddQuestion} className="space-y-5">
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Choose a quiz</span>
              <select
                required
                value={selectedQuiz}
                onChange={(event) => setSelectedQuiz(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              >
                <option value="">Select a quiz</option>
                {quizzes.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Question</span>
              <textarea
                required
                minLength={3}
                maxLength={5000}
                rows={3}
                value={questionForm.question_text}
                onChange={(event) => setQuestionForm({
                  ...questionForm,
                  question_text: event.target.value,
                })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                placeholder="Write your question..."
              />
            </label>

            <NumberField
              label="Points"
              min={0.01}
              max={10000}
              step={0.5}
              value={questionForm.points}
              onChange={(value) => setQuestionForm({
                ...questionForm,
                points: value,
              })}
            />

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-300">
                Answer options — select exactly one correct answer
              </p>

              {questionForm.options.map((option, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 p-3"
                >
                  <input
                    required
                    value={option.text}
                    onChange={(event) => updateOption(index, {
                      text: event.target.value,
                    })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
                    placeholder={`Option ${index + 1}`}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={option.is_correct}
                      onChange={() => setQuestionForm((previous) => ({
                        ...previous,
                        options: previous.options.map((item, itemIndex) => ({
                          ...item,
                          is_correct: itemIndex === index,
                        })),
                      }))}
                      className="accent-emerald-500"
                    />
                    Correct
                  </label>
                  {questionForm.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setQuestionForm((previous) => ({
                        ...previous,
                        options: previous.options
                          .filter((_, optionIndex) => optionIndex !== index)
                          .map((item) => ({ ...item, is_correct: false })),
                      }))}
                      className="text-sm text-red-300 hover:text-red-200"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addOption}
                disabled={questionForm.options.length >= 10}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                + Add option
              </button>
            </div>

            <button
              disabled={saving || !selectedQuiz}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add question
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Existing quizzes</h2>
            <button
              onClick={loadQuizzes}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {quizzes.length === 0 ? (
            <p className="text-slate-400">No quizzes have been created yet.</p>
          ) : (
            <div className="space-y-3">
              {quizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 p-4"
                >
                  <div>
                    <h3 className="font-semibold">{quiz.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {quiz.question_count} questions · {quiz.time_limit_minutes} minutes
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    quiz.is_published
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-amber-500/10 text-amber-300"
                  }`}>
                    {quiz.is_published ? "Published" : "Draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function NumberField({ label, min, max, step = 1, value, onChange }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        type="number"
        required
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
      />
    </label>
  );
}