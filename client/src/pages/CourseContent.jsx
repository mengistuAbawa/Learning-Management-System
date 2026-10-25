import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import LessonProgressPanel from "../components/LessonProgressPanel";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  Film,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  PlayCircle,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { getCourseById } from "../services/courseService";
import {
  createModule,
  deleteModule,
  getModules,
  reorderModules,
  updateModule,
} from "../services/moduleService";
import {
  createLesson,
  deleteLesson,
  getLessonById,
  getLessons,
  reorderLessons,
  updateLesson,
} from "../services/lessonService";
import { getQuizzes } from "../services/quizService";

const EMPTY_MODULE = { title: "", description: "" };

const EMPTY_LESSON = {
  title: "",
  content: "",
  video_url: "",
  resource_url: "",
  duration_minutes: "0",
  is_preview: false,
};

function errorText(error) {
  const errors = error.response?.data?.errors;
  if (Array.isArray(errors) && errors.length) return errors.join(" ");
  return error.response?.data?.message || "Something went wrong.";
}

function ActionButton({ children, onClick, disabled = false, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-rose-400/20 text-rose-200 hover:bg-rose-400/10"
          : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function EditorModal({
  type,
  initialData,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(() => ({
    ...(type === "module" ? EMPTY_MODULE : EMPTY_LESSON),
    ...(initialData || {}),
    ...(initialData
      ? {
          video_url: initialData.video_url || "",
          resource_url: initialData.resource_url || "",
          duration_minutes: String(initialData.duration_minutes ?? 0),
        }
      : {}),
  }));

  const [error, setError] = useState("");

  function change(event) {
    const { name, value, type: inputType, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: inputType === "checkbox" ? checked : value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    const payload = { ...form };

    if (type === "lesson") {
      const duration = Number(payload.duration_minutes);

      if (!Number.isInteger(duration) || duration < 0 || duration > 10000) {
        setError("Duration must be a whole number from 0 to 10,000.");
        return;
      }

      payload.duration_minutes = duration;
      payload.video_url = payload.video_url.trim() || null;
      payload.resource_url = payload.resource_url.trim() || null;
    }

    try {
      await onSave(payload);
    } catch (saveError) {
      setError(errorText(saveError));
    }
  }

  const isModule = type === "module";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-editor-title"
        className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <h2 id="content-editor-title" className="text-xl font-bold">
              {initialData?.id
                ? `Edit ${type}`
                : `Add ${type}`}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {isModule
                ? "Organize a section of your course."
                : "Add lesson content and optional video resources."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-5 p-5">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="content-title" className="mb-2 block text-sm font-medium">
              Title *
            </label>
            <input
              id="content-title"
              name="title"
              required
              minLength={2}
              maxLength={200}
              value={form.title || ""}
              onChange={change}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          {isModule ? (
            <div>
              <label htmlFor="module-description" className="mb-2 block text-sm font-medium">
                Description
              </label>
              <textarea
                id="module-description"
                name="description"
                maxLength={5000}
                rows={3}
                value={form.description || ""}
                onChange={change}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
              />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="lesson-content" className="mb-2 block text-sm font-medium">
                  Lesson content *
                </label>
                <textarea
                  id="lesson-content"
                  name="content"
                  required
                  minLength={1}
                  maxLength={100000}
                  rows={7}
                  value={form.content || ""}
                  onChange={change}
                  placeholder="Write lesson text and learning instructions..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 leading-6 outline-none focus:border-indigo-400"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="lesson-video" className="mb-2 block text-sm font-medium">
                    Video URL
                  </label>
                  <input
                    id="lesson-video"
                    name="video_url"
                    type="url"
                    maxLength={2048}
                    value={form.video_url || ""}
                    onChange={change}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label htmlFor="lesson-resource" className="mb-2 block text-sm font-medium">
                    Resource URL
                  </label>
                  <input
                    id="lesson-resource"
                    name="resource_url"
                    type="url"
                    maxLength={2048}
                    value={form.resource_url || ""}
                    onChange={change}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lesson-duration" className="mb-2 block text-sm font-medium">
                  Duration in minutes
                </label>
                <input
                  id="lesson-duration"
                  name="duration_minutes"
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={form.duration_minutes ?? "0"}
                  onChange={change}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
                />
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950 p-4">
                <input
                  type="checkbox"
                  name="is_preview"
                  checked={Boolean(form.is_preview)}
                  onChange={change}
                  className="mt-1 h-4 w-4 accent-indigo-500"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    Free preview lesson
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Allow students who are not enrolled to open this lesson.
                  </span>
                </span>
              </label>
            </>
          )}

          <footer className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save {type}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function CourseContent() {
  const { courseId } = useParams();
  const { user } = useAuth();

  const canManage =
    user?.role === "admin" || user?.role === "instructor";

  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [lessonsByModule, setLessonsByModule] = useState({});
  const [expanded, setExpanded] = useState({});
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [courseVideos, setCourseVideos] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [quizError, setQuizError] = useState("");
  const [lessonPlaybackUrl, setLessonPlaybackUrl] = useState("");
  const [videoPlaybackError, setVideoPlaybackError] = useState("");
  const [videoProgressMessage, setVideoProgressMessage] = useState("");
  const lastVideoProgressPosition = useRef({});

  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const courseResult = await getCourseById(courseId);
      const moduleResult = await getModules(courseId);
      try {
        const quizResult = await getQuizzes(courseId);
        setQuizzes(quizResult.quizzes || []);
        setQuizError("");
      } catch (loadError) {
        setQuizzes([]);
        setQuizError(errorText(loadError));
      }
      let availableVideos = [];
      try {
        const videoResult = await api.get("/course-videos");
        availableVideos = (videoResult.data.videos || []).filter(
          (video) => String(video.course_id) === String(courseId)
        );
      } catch {
        // A separate course recording list must not block access to text lessons.
      }

      setCourse(courseResult.course);
      setModules(moduleResult.modules || []);
      setCourseVideos(availableVideos);

      const lessonResults = await Promise.all(
        (moduleResult.modules || []).map(async (module) => {
          const result = await getLessons(module.id);
          return [String(module.id), result.lessons || []];
        })
      );

      setLessonsByModule(Object.fromEntries(lessonResults));
      setExpanded((current) => {
        const next = { ...current };
        if ((moduleResult.modules || []).length && Object.keys(next).length === 0) {
          next[String(moduleResult.modules[0].id)] = true;
        }
        return next;
      });
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadPage();
  }, [loadPage, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  function refresh(message) {
    setNotice(message);
    setEditor(null);
    setSelectedLesson(null);
    setRefreshKey((value) => value + 1);
  }

  async function saveEditor(data) {
    setSaving(true);

    try {
      if (editor.type === "module") {
        if (editor.item?.id) {
          await updateModule(editor.item.id, data);
          refresh("Module updated successfully.");
        } else {
          await createModule(courseId, data);
          refresh("Module created successfully.");
        }
      } else {
        if (editor.item?.id) {
          await updateLesson(editor.item.id, data);
          refresh("Lesson updated successfully.");
        } else {
          await createLesson(editor.moduleId, data);
          refresh("Lesson created successfully.");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeModule(module) {
    const confirmed = window.confirm(
      `Delete "${module.title}" and all its lessons?`
    );

    if (!confirmed) return;

    try {
      await deleteModule(module.id);
      refresh("Module deleted successfully.");
    } catch (removeError) {
      setError(errorText(removeError));
    }
  }

  async function removeLesson(lesson) {
    const confirmed = window.confirm(
      `Delete "${lesson.title}"? This may be restricted if learning records refer to it.`
    );

    if (!confirmed) return;

    try {
      await deleteLesson(lesson.id);
      refresh("Lesson deleted successfully.");
    } catch (removeError) {
      setError(errorText(removeError));
    }
  }

  async function moveModule(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= modules.length) return;

    const reordered = [...modules];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];

    setModules(reordered);

    try {
      await reorderModules(
        courseId,
        reordered.map((module) => String(module.id))
      );
    } catch (reorderError) {
      setError(errorText(reorderError));
      setRefreshKey((value) => value + 1);
    }
  }

  async function moveLesson(moduleId, index, direction) {
    const current = lessonsByModule[String(moduleId)] || [];
    const target = index + direction;

    if (target < 0 || target >= current.length) return;

    const reordered = [...current];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];

    setLessonsByModule((previous) => ({
      ...previous,
      [String(moduleId)]: reordered,
    }));

    try {
      await reorderLessons(
        moduleId,
        reordered.map((lesson) => String(lesson.id))
      );
    } catch (reorderError) {
      setError(errorText(reorderError));
      setRefreshKey((value) => value + 1);
    }
  }

  async function openLesson(lesson) {
    setError("");
    setNotice("");
    setLessonPlaybackUrl("");
    setVideoPlaybackError("");
    setVideoProgressMessage("");

    try {
      const result = await getLessonById(lesson.id);
      setSelectedLesson(result.lesson);
    } catch (lessonError) {
      setSelectedLesson(null);
      setError(errorText(lessonError));
    }
  }

  const linkedVideo = courseVideos.find(
    (video) => String(video.lesson_id) === String(selectedLesson?.id)
  );

  async function playLinkedVideo(video) {
    setVideoPlaybackError("");
    try {
      const response = await api.post(`/course-videos/${video.id}/playback`);
      const baseUrl = new URL(
        api.defaults.baseURL,
        window.location.origin
      ).toString().replace(/\/?$/, "/");
      setLessonPlaybackUrl(new URL(response.data.path, baseUrl).toString());
    } catch (playError) {
      setVideoPlaybackError(
        playError.response?.data?.message ||
          "The recorded lesson could not be opened."
      );
    }
  }

  function resumeLinkedVideo(video, element) {
    const position = Number(video.last_position_seconds) || 0;
    if (
      position > 0 &&
      Number.isFinite(element.duration) &&
      position < element.duration - 2
    ) {
      element.currentTime = position;
    }
  }

  async function saveLinkedVideoProgress(video, element, force = false) {
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    const position = Math.floor(element.currentTime);
    if (
      !force &&
      position - (lastVideoProgressPosition.current[video.id] ?? 0) < 15
    ) return;
    lastVideoProgressPosition.current[video.id] = position;
    try {
      const response = await api.patch(`/course-videos/${video.id}/progress`, {
        position_seconds: position,
        duration_seconds: Math.floor(element.duration),
      });
      setCourseVideos((current) =>
        current.map((item) =>
          item.id === video.id ? { ...item, ...response.data.progress } : item
        )
      );
      setVideoProgressMessage(
        response.data.progress.completed ? "Video lesson completed." : "Progress saved."
      );
    } catch (progressError) {
      setVideoProgressMessage(
        progressError.response?.data?.message || "Video progress could not be saved."
      );
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-6 w-6 animate-spin text-indigo-400" />
          Loading course content...
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Unable to open course</h1>
          <p className="mt-3 text-slate-400">
            {error || "This course could not be found."}
          </p>
          <Link to="/courses" className="mt-5 inline-flex rounded-xl bg-indigo-500 px-4 py-3 font-semibold">
            Return to courses
          </Link>
        </div>
      </main>
    );
  }

  const totalLessons = Object.values(lessonsByModule)
    .reduce((sum, lessons) => sum + lessons.length, 0);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link to="/courses" className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Course catalog
          </Link>
          <Link to="/dashboard" className="flex items-center gap-2 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500">
              <BookOpen className="h-5 w-5" />
            </span>
            LearnSphere
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-500/10 p-6 sm:p-9">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-200">
                <GraduationCap className="h-4 w-4" />
                Course learning space
                <span className="rounded-full border border-white/10 px-2 py-1 normal-case tracking-normal text-slate-300">
                  {course.status}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {course.title}
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-slate-300">
                {course.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  {modules.length} modules
                </span>
                <span className="inline-flex items-center gap-2">
                  <PlayCircle className="h-4 w-4" />
                  {totalLessons} lessons
                </span>
              </div>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() => setEditor({
                  type: "module",
                  item: null,
                })}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold hover:bg-indigo-400"
              >
                <Plus className="h-5 w-5" />
                Add module
              </button>
            )}
          </div>
        </section>

        {notice && (
          <div role="status" className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {notice}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
            <X className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {(canManage || quizzes.length > 0 || quizError) && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-cyan-300" />
                  <h2 className="text-xl font-bold">Course quizzes & assessments</h2>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Timed quizzes, practice, and graded course assessments.
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/instructor/quizzes/grading"
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"
                  >
                    Review submissions
                  </Link>
                  <Link
                    to={`/courses/${courseId}/quizzes/manage`}
                    className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
                  >
                    Manage quizzes
                  </Link>
                </div>
              )}
            </div>

            {quizError ? (
              <p role="alert" className="mt-4 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">
                {quizError}
              </p>
            ) : quizzes.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                {canManage
                  ? "No assessments yet. Create one to add questions and assessment rules."
                  : "There are no published assessments for this course yet."}
              </p>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {quizzes.map((quiz) => {
                  const opensAt = quiz.opens_at ? new Date(quiz.opens_at).getTime() : null;
                  const closesAt = quiz.closes_at ? new Date(quiz.closes_at).getTime() : null;
                  const upcoming = opensAt !== null && now < opensAt;
                  const closed = closesAt !== null && now >= closesAt;
                  const disabled = !canManage && (upcoming || closed);

                  return (
                    <article
                      key={quiz.id}
                      className="rounded-xl border border-white/10 bg-slate-950/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-white">{quiz.title}</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            {quiz.question_count} questions · {quiz.time_limit_minutes} minutes ·{" "}
                            {quiz.max_attempts} attempts · Pass {quiz.passing_score}%
                          </p>
                          {(opensAt || closesAt) && (
                            <p className="mt-2 text-xs text-slate-500">
                              {opensAt && `Opens ${new Date(opensAt).toLocaleString()}`}
                              {opensAt && closesAt && " · "}
                              {closesAt && `Closes ${new Date(closesAt).toLocaleString()}`}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            quiz.is_published
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "bg-amber-400/10 text-amber-200"
                          }`}>
                            {quiz.is_published ? "Published" : "Draft"}
                          </span>
                        )}
                      </div>
                      {!canManage && (
                        <Link
                          aria-disabled={disabled}
                          tabIndex={disabled ? -1 : undefined}
                          to={`/quizzes/${quiz.id}/take`}
                          className={`mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-semibold ${
                            disabled
                              ? "pointer-events-none bg-slate-800 text-slate-500"
                              : "bg-cyan-600 text-white hover:bg-cyan-500"
                          }`}
                        >
                          {upcoming
                            ? "Not open yet"
                            : closed
                              ? "Assessment closed"
                              : "Open assessment"}
                        </Link>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold">Course curriculum</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Open a lesson to view its content.
                </p>
              </div>
            </div>

            {modules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-slate-600" />
                <p className="mt-3 font-semibold">No modules yet</p>
                <p className="mt-2 text-sm text-slate-400">
                  {canManage
                    ? "Add a module to start building the course curriculum."
                    : "The instructor has not added course content yet."}
                </p>
              </div>
            ) : (
              modules.map((module, moduleIndex) => {
                const moduleKey = String(module.id);
                const lessons = lessonsByModule[moduleKey] || [];
                const isExpanded = Boolean(expanded[moduleKey]);

                return (
                  <article
                    key={module.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60"
                  >
                    <div className="flex items-start gap-3 p-4 sm:p-5">
                      <button
                        type="button"
                        onClick={() => setExpanded((previous) => ({
                          ...previous,
                          [moduleKey]: !previous[moduleKey],
                        }))}
                        aria-expanded={isExpanded}
                        className="mt-1 rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                          Module {moduleIndex + 1}
                        </p>
                        <h3 className="mt-1 font-bold">{module.title}</h3>
                        {module.description && (
                          <p className="mt-1 text-sm leading-6 text-slate-400">
                            {module.description}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                          {lessons.length} lessons
                        </p>
                      </div>

                      {canManage && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <ActionButton
                            disabled={moduleIndex === 0}
                            onClick={() => moveModule(moduleIndex, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton
                            disabled={moduleIndex === modules.length - 1}
                            onClick={() => moveModule(moduleIndex, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton
                            onClick={() => setEditor({
                              type: "module",
                              item: module,
                            })}
                          >
                            <Edit3 className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton danger onClick={() => removeModule(module)}>
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-white/10 bg-slate-950/40 p-3 sm:p-4">
                        {lessons.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-slate-500">
                            No lessons in this module yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {lessons.map((lesson, lessonIndex) => {
                              const isSelected =
                                String(selectedLesson?.id) === String(lesson.id);

                              return (
                                <div
                                  key={lesson.id}
                                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                                    isSelected
                                      ? "border-indigo-400/30 bg-indigo-400/10"
                                      : "border-white/5 hover:border-white/10 hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => openLesson(lesson)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                  >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-indigo-300">
                                      {lesson.video_url ? (
                                        <Film className="h-4 w-4" />
                                      ) : (
                                        <FileText className="h-4 w-4" />
                                      )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">
                                        {lesson.title}
                                      </span>
                                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {lesson.duration_minutes} min
                                        </span>
                                        {lesson.is_preview && (
                                          <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                                            Preview
                                          </span>
                                        )}
                                        {!lesson.is_preview &&
                                          user?.role === "student" &&
                                          !lesson.content && (
                                            <LockKeyhole className="h-3 w-3" />
                                          )}
                                      </span>
                                    </span>
                                  </button>

                                  {canManage && (
                                    <div className="flex shrink-0 flex-wrap gap-1">
                                      <ActionButton
                                        disabled={lessonIndex === 0}
                                        onClick={() => moveLesson(module.id, lessonIndex, -1)}
                                      >
                                        <ArrowUp className="h-4 w-4" />
                                      </ActionButton>
                                      <ActionButton
                                        disabled={lessonIndex === lessons.length - 1}
                                        onClick={() => moveLesson(module.id, lessonIndex, 1)}
                                      >
                                        <ArrowDown className="h-4 w-4" />
                                      </ActionButton>
                                      <ActionButton
                                        onClick={() => setEditor({
                                          type: "lesson",
                                          item: lesson,
                                          moduleId: module.id,
                                        })}
                                      >
                                        <Edit3 className="h-4 w-4" />
                                      </ActionButton>
                                      <ActionButton danger onClick={() => removeLesson(lesson)}>
                                        <Trash2 className="h-4 w-4" />
                                      </ActionButton>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setEditor({
                              type: "lesson",
                              item: null,
                              moduleId: module.id,
                            })}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-indigo-400/30 px-3 py-2.5 text-sm font-semibold text-indigo-200 hover:bg-indigo-400/10"
                          >
                            <Plus className="h-4 w-4" />
                            Add lesson
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>

          <aside className="lg:sticky lg:top-6">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
              <header className="border-b border-white/10 p-5">
                <div className="flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-indigo-300" />
                  <h2 className="font-bold">Lesson viewer</h2>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Select a lesson from the curriculum.
                </p>
              </header>

              {selectedLesson ? (
                <div className="p-5">
                  <h3 className="text-xl font-bold">
                    {selectedLesson.title}
                  </h3>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {selectedLesson.duration_minutes} minutes
                    </span>
                    {selectedLesson.is_preview && (
                      <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-300">
                        Preview lesson
                      </span>
                    )}
                  </div>

                  {linkedVideo && (
                    <section className="mt-5 rounded-xl border border-indigo-400/20 bg-slate-950 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{linkedVideo.title}</p>
                          {linkedVideo.description && (
                            <p className="mt-1 text-sm text-slate-400">{linkedVideo.description}</p>
                          )}
                        </div>
                        {!lessonPlaybackUrl && (
                          <button
                            type="button"
                            onClick={() => playLinkedVideo(linkedVideo)}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                          >
                            Play recorded lesson
                          </button>
                        )}
                      </div>
                      {videoPlaybackError && (
                        <p role="alert" className="mt-3 text-sm text-rose-300">{videoPlaybackError}</p>
                      )}
                      {lessonPlaybackUrl && (
                        <video
                          controls
                          playsInline
                          src={lessonPlaybackUrl}
                          onLoadedMetadata={(event) =>
                            resumeLinkedVideo(linkedVideo, event.currentTarget)
                          }
                          onTimeUpdate={(event) =>
                            saveLinkedVideoProgress(linkedVideo, event.currentTarget)
                          }
                          onPause={(event) =>
                            saveLinkedVideoProgress(linkedVideo, event.currentTarget, true)
                          }
                          onEnded={(event) =>
                            saveLinkedVideoProgress(linkedVideo, event.currentTarget, true)
                          }
                          onError={() =>
                            setVideoPlaybackError(
                              "The recording is unavailable or its playback link expired. Reopen it to try again."
                            )
                          }
                          className="mt-4 w-full rounded-lg bg-black"
                        />
                      )}
                      {Number(linkedVideo.duration_seconds) > 0 && (
                        <p className="mt-2 text-xs text-slate-400">
                          {linkedVideo.completed
                            ? "Completed"
                            : `Resume at ${Math.floor(Number(linkedVideo.last_position_seconds) / 60)}:${String(Math.floor(Number(linkedVideo.last_position_seconds) % 60)).padStart(2, "0")}`}
                        </p>
                      )}
                      {videoProgressMessage && (
                        <p role="status" className="mt-2 text-xs text-slate-400">{videoProgressMessage}</p>
                      )}
                    </section>
                  )}

                  {selectedLesson.video_url && (
                    <a
                      href={selectedLesson.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 p-4 hover:border-indigo-400/30"
                    >
                      <Film className="h-5 w-5 text-indigo-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Watch lesson video</span>
                        <span className="mt-1 block truncate text-xs text-slate-400">
                          {selectedLesson.video_url}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                    </a>
                  )}

                  {selectedLesson.resource_url && (
                    <a
                      href={selectedLesson.resource_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 p-4 hover:border-indigo-400/30"
                    >
                      <FileText className="h-5 w-5 text-indigo-300" />
                      <span className="font-semibold">Open lesson resource</span>
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-500" />
                    </a>
                  )}

                  <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                    {selectedLesson.content}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-400/10">
                    <PlayCircle className="h-7 w-7 text-indigo-300" />
                  </div>
                  <h3 className="mt-4 font-semibold">Ready to learn?</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Select a lesson from the curriculum to open its learning content.
                    If the lesson is restricted, enroll in the course to access it.
                  </p>
                </div>
              )}
            </section>

            {user?.role === "student" && selectedLesson && (
              <div className="mt-4">
                <LessonProgressPanel
                  courseId={courseId}
                  lessonId={selectedLesson.id}
                />
              </div>
            )}
          </aside>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-5 text-sm text-slate-500">
          © {new Date().getFullYear()} LearnSphere LMS
        </footer>
      </div>

      {editor && (
        <EditorModal
          key={`${editor.type}-${editor.item?.id || "new"}-${editor.moduleId || ""}`}
          type={editor.type}
          initialData={editor.item}
          saving={saving}
          onClose={() => !saving && setEditor(null)}
          onSave={saveEditor}
        />
      )}
    </main>
  );
}