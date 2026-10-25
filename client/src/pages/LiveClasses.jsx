import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Clock3,
  LoaderCircle,
  Plus,
  Video,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

function formatDate(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function getMessage(error) {
  const errors = error.response?.data?.errors;
  return (
    errors?.map((item) => item.message).join(" ") ||
    error.response?.data?.message ||
    "Unable to complete this request. Please try again."
  );
}

function emptyForm() {
  return {
    course_id: "",
    title: "",
    description: "",
    learning_objectives: "",
    scheduled_at: "",
    duration_minutes: "60",
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

export default function LiveClasses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canSchedule = ["instructor", "admin"].includes(user?.role);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [classResponse, courseResponse] = await Promise.all([
        api.get("/live-classes"),
        canSchedule ? api.get("/courses") : Promise.resolve(null),
      ]);
      setClasses(classResponse.data.classes || []);
      setCourses(courseResponse?.data?.courses || []);
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [canSchedule]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/live-classes"),
      canSchedule ? api.get("/courses") : Promise.resolve(null),
    ])
      .then(([classResponse, courseResponse]) => {
        if (!active) return;
        setClasses(classResponse.data.classes || []);
        setCourses(courseResponse?.data?.courses || []);
      })
      .catch((requestError) => {
        if (active) setError(getMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canSchedule]);

  function changeForm(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function submitClass(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/live-classes", {
        ...form,
        course_id: Number(form.course_id),
        duration_minutes: Number(form.duration_minutes),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      });
      setForm(emptyForm());
      setShowForm(false);
      await loadData();
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function startClass(liveClass) {
    setError("");
    try {
      if (liveClass.status === "scheduled" && user?.role !== "admin") {
        await api.post(`/live-classes/${liveClass.id}/start`);
      }
      navigate(`/live-classes/${liveClass.id}/room`);
    } catch (requestError) {
      setError(getMessage(requestError));
      await loadData();
    }
  }

  async function cancelClass(liveClass) {
    if (!window.confirm(`Cancel "${liveClass.title}"?`)) return;
    setError("");
    try {
      await api.post(`/live-classes/${liveClass.id}/cancel`);
      await loadData();
    } catch (requestError) {
      setError(getMessage(requestError));
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <header className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
              <Video className="h-4 w-4" />
              Live learning
            </p>
            <h1 className="mt-2 text-3xl font-bold">Live classes</h1>
            <p className="mt-2 text-slate-400">
              Scheduled classes for your courses.
            </p>
          </div>
          {canSchedule && !showForm && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Schedule class
            </button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mt-6 flex gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={submitClass}
            className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-slate-900 p-6 sm:grid-cols-2"
          >
            <h2 className="text-lg font-semibold sm:col-span-2">
              Schedule a live class
            </h2>
            <label className="text-sm font-medium text-slate-300 sm:col-span-2">
              Course
              <select
                name="course_id"
                required
                value={form.course_id}
                onChange={changeForm}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-white"
              >
                <option value="">Choose a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-300 sm:col-span-2">
              Class title
              <input
                name="title"
                required
                minLength={3}
                maxLength={200}
                value={form.title}
                onChange={changeForm}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-white"
              />
            </label>
            <label className="text-sm font-medium text-slate-300 sm:col-span-2">
              Description
              <textarea
                name="description"
                maxLength={4000}
                rows={3}
                value={form.description}
                onChange={changeForm}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-white"
              />
            </label>
            <label className="text-sm font-medium text-slate-300 sm:col-span-2">
              Learning objectives
              <textarea
                name="learning_objectives"
                maxLength={4000}
                rows={2}
                value={form.learning_objectives}
                onChange={changeForm}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-white"
              />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Date and time (your local time)
              <input
                name="scheduled_at"
                type="datetime-local"
                required
                value={form.scheduled_at}
                onChange={changeForm}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-white"
              />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Duration (minutes)
              <input
                name="duration_minutes"
                type="number"
                min="5"
                max="240"
                required
                value={form.duration_minutes}
                onChange={changeForm}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-white"
              />
            </label>
            <div className="text-xs text-slate-500 sm:col-span-2">
              Time zone: {form.time_zone}. Students see the start time in their
              local time zone.
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold hover:bg-indigo-500 disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Schedule class"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-white/10 px-4 py-2.5 font-semibold text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="mt-12 flex justify-center text-slate-400">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
        ) : classes.length ? (
          <div className="mt-8 grid gap-4">
            {classes.map((liveClass) => (
              <article
                key={liveClass.id}
                className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{liveClass.title}</h2>
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs capitalize text-slate-300">
                        {liveClass.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-indigo-300">
                      {liveClass.course_title}
                    </p>
                    <p className="mt-3 text-sm text-slate-400">
                      {liveClass.description || "No description provided."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        {formatDate(liveClass.scheduled_at)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Clock3 className="h-4 w-4" />
                        {liveClass.duration_minutes} minutes
                      </span>
                      <span>Instructor: {liveClass.instructor_name}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {liveClass.can_manage &&
                      ["scheduled", "live"].includes(liveClass.status) && (
                        <button
                          type="button"
                          onClick={() => startClass(liveClass)}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500"
                        >
                          {user?.role === "admin"
                            ? "Review class"
                            : liveClass.status === "live"
                              ? "Open class"
                              : "Start class"}
                        </button>
                      )}
                    {!liveClass.can_manage && liveClass.status === "live" && (
                      <Link
                        to={`/live-classes/${liveClass.id}/room`}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
                      >
                        Join class
                      </Link>
                    )}
                    {liveClass.can_manage && liveClass.status === "scheduled" && (
                      <button
                        type="button"
                        onClick={() => cancelClass(liveClass)}
                        className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center text-slate-400">
            No live classes are scheduled for your courses yet.
          </div>
        )}
      </div>
    </main>
  );
}
