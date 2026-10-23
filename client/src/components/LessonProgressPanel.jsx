
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import {
  getCourseProgress,
  getCourseLessonProgress,
  updateLessonProgress,
} from "../services/progressService";

export default function LessonProgressPanel({
  courseId,
  lessonId,
  onProgressUpdated,
}) {
  const [lessonProgress, setLessonProgress] = useState(null);
  const [courseProgress, setCourseProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [lessonResponse, courseResponse] = await Promise.all([
        getCourseLessonProgress(courseId),
        getCourseProgress(courseId),
      ]);

      const lessons = Array.isArray(lessonResponse.data)
        ? lessonResponse.data
        : [];

      const current = lessons.find(
        (item) => String(item.lesson_id) === String(lessonId)
      );

      setLessonProgress(current || null);
      setCourseProgress(courseResponse.data || null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load progress. Make sure you are enrolled."
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  async function toggleCompleted() {
    if (!lessonProgress || saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await updateLessonProgress(lessonId, {
        completed: !lessonProgress.completed,
        last_position_seconds: lessonProgress.last_position_seconds || 0,
      });

      const updated = response.data;
      setLessonProgress((previous) => ({
        ...previous,
        ...updated.lesson_progress,
      }));
      setCourseProgress(updated.course_progress);
      onProgressUpdated?.(updated.course_progress);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not save lesson progress. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Loading progress...
      </div>
    );
  }

  if (error && !lessonProgress) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-amber-300">{error}</p>
        <button
          type="button"
          onClick={loadProgress}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!lessonProgress) {
    return (
      <p className="text-sm text-slate-400">
        Lesson progress is not available for this lesson.
      </p>
    );
  }

  const percentage = Number(courseProgress?.completion_percentage) || 0;

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Your learning progress</h3>
          <p className="mt-1 text-sm text-slate-400">
            {courseProgress?.completed_lessons ?? 0} of{" "}
            {courseProgress?.total_lessons ?? 0} lessons completed
          </p>
        </div>
        <span className="text-xl font-bold text-cyan-300">
          {percentage}%
        </span>
      </div>

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

      <button
        type="button"
        onClick={toggleCompleted}
        disabled={saving}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60 ${
          lessonProgress.completed
            ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            : "bg-indigo-600 text-white hover:bg-indigo-500"
        }`}
      >
        {saving ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : lessonProgress.completed ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}

        {saving
          ? "Saving..."
          : lessonProgress.completed
            ? "Mark as incomplete"
            : "Mark lesson as complete"}
      </button>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      {courseProgress?.is_completed && (
        <p className="text-sm font-medium text-emerald-300">
          Congratulations! You have completed every lesson in this course.
        </p>
      )}
    </section>
  );
}
