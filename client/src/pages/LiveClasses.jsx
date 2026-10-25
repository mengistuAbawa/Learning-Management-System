import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Pencil,
  Plus,
  Users,
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
  const role = user?.role;
  const canSchedule = ["instructor", "admin"].includes(role);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [reviewingAttendance, setReviewingAttendance] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async (isCurrent = () => true) => {
    try {
      const [classResponse, courseResponse] = await Promise.all([
        api.get("/live-classes"),
        canSchedule ? api.get("/courses") : Promise.resolve(null),
      ]);
      if (!isCurrent()) return;
      setError("");
      setClasses(classResponse.data.classes || []);
      setCourses(courseResponse?.data?.courses || []);
      if (role === "student") {
        setAttendanceLoading(true);
        try {
          const response = await api.get("/live-classes/attendance/mine");
          if (isCurrent()) setAttendance(response.data.attendance || []);
        } catch (attendanceError) {
          if (isCurrent()) setError(getMessage(attendanceError));
        } finally {
          if (isCurrent()) setAttendanceLoading(false);
        }
      }
    } catch (requestError) {
      if (isCurrent()) setError(getMessage(requestError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [canSchedule, role]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => void loadData(() => active), 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadData]);

  useEffect(() => {
    if (!showForm || !form.course_id || !canSchedule) {
      return undefined;
    }

    let active = true;
    Promise.all([
      api.get(`/enrollments/courses/${form.course_id}`),
      editingId
        ? api.get(`/live-classes/${editingId}/permitted-participants`)
        : Promise.resolve(null),
    ])
      .then(([enrollmentResponse, permittedResponse]) => {
        if (!active) return;
        const rows = (enrollmentResponse.data.data || []).filter((row) =>
          ["active", "completed"].includes(row.status)
        );
        setEnrolledStudents(rows);
        const enrolledIds = rows.map((row) => Number(row.student_id));
        if (!permittedResponse || !permittedResponse.data.restricted) {
          setSelectedStudentIds(enrolledIds);
        } else {
          const permittedIds = permittedResponse.data.permitted_student_ids || [];
          setSelectedStudentIds(
            permittedIds.filter((id) => enrolledIds.includes(Number(id)))
          );
        }
      })
      .catch((requestError) => {
        if (active) {
          setParticipantsError(getMessage(requestError));
          setError(getMessage(requestError));
        }
      })
      .finally(() => {
        if (active) setParticipantsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canSchedule, editingId, form.course_id, showForm]);

  function changeForm(event) {
    if (event.target.name === "course_id") {
      setParticipantsLoading(true);
      setParticipantsError("");
      setEnrolledStudents([]);
      setSelectedStudentIds([]);
    }
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
      const payload = {
        ...form,
        course_id: Number(form.course_id),
        duration_minutes: Number(form.duration_minutes),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      };
      if (enrolledStudents.length) {
        payload.permitted_student_ids = selectedStudentIds;
      }
      if (editingId) {
        await api.patch(`/live-classes/${editingId}`, payload);
      } else {
        await api.post("/live-classes", payload);
      }
      setForm(emptyForm());
      setSelectedStudentIds([]);
      setParticipantsError("");
      setEditingId(null);
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

  function editClass(liveClass) {
    setError("");
    setParticipantsError("");
    setEditingId(String(liveClass.id));
    setForm({
      course_id: String(liveClass.course_id),
      title: liveClass.title,
      description: liveClass.description || "",
      learning_objectives: liveClass.learning_objectives || "",
      scheduled_at: (() => {
        const date = new Date(liveClass.scheduled_at);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      })(),
      duration_minutes: String(liveClass.duration_minutes),
      time_zone: liveClass.time_zone || "UTC",
    });
    setShowForm(true);
    setParticipantsLoading(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setSelectedStudentIds([]);
    setParticipantsLoading(false);
    setParticipantsError("");
    setForm(emptyForm());
  }

  async function reviewAttendance(liveClass) {
    setReviewingAttendance({ id: String(liveClass.id), loading: true, entries: [] });
    try {
      const response = await api.get(`/live-classes/${liveClass.id}/attendance`);
      setReviewingAttendance({
        id: String(liveClass.id),
        title: liveClass.title,
        entries: response.data.attendance || [],
      });
    } catch (requestError) {
      setReviewingAttendance(null);
      setError(getMessage(requestError));
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
                setEditingId(null);
                setForm(emptyForm());
                setSelectedStudentIds([]);
                setParticipantsError("");
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
                disabled={Boolean(editingId)}
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
            {form.course_id && (
              <fieldset className="rounded-xl border border-white/10 p-4 sm:col-span-2">
                <legend className="px-2 text-sm font-semibold text-slate-200">
                  Permitted students
                </legend>
                {participantsLoading ? (
                  <p className="text-sm text-slate-400">Loading enrolled students...</p>
                ) : participantsError ? (
                  <p role="alert" className="text-sm text-rose-300">{participantsError}</p>
                ) : enrolledStudents.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No students are currently enrolled. Future enrolled students will be allowed to join.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.length === enrolledStudents.length}
                        onChange={(event) => setSelectedStudentIds(
                          event.target.checked
                            ? enrolledStudents.map((student) => Number(student.student_id))
                            : []
                        )}
                        className="h-4 w-4 accent-indigo-500"
                      />
                      Select all enrolled students
                    </label>
                    <ul className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                      {enrolledStudents.map((student) => {
                        const studentId = Number(student.student_id);
                        const checked = selectedStudentIds.includes(studentId);
                        return (
                          <li key={studentId}>
                            <label className="flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setSelectedStudentIds((current) =>
                                  checked
                                    ? current.filter((id) => id !== studentId)
                                    : [...current, studentId]
                                )}
                                className="h-4 w-4 accent-indigo-500"
                              />
                              <span className="truncate">{student.student_name}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-slate-500">
                      Selected students only can view, receive notifications for, and join this class.
                    </p>
                  </div>
                )}
              </fieldset>
            )}
            <div className="text-xs text-slate-500 sm:col-span-2">
              Time zone: {form.time_zone}. Students see the start time in their
              local time zone.
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={
                  submitting ||
                  participantsLoading ||
                  Boolean(participantsError) ||
                  (enrolledStudents.length > 0 && selectedStudentIds.length === 0)
                }
                className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold hover:bg-indigo-500 disabled:opacity-60"
              >
                {submitting
                  ? "Saving..."
                  : editingId
                    ? "Save changes"
                    : "Schedule class"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={cancelForm}
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
                        {liveClass.status === "ended" ? "Completed" : liveClass.status}
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
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {liveClass.participants_restricted
                          ? "Selected students only"
                          : "All enrolled students"}
                      </span>
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
                    {!liveClass.can_manage && liveClass.can_join && (
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
                        onClick={() => editClass(liveClass)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                    {liveClass.can_manage && ["live", "ended"].includes(liveClass.status) && (
                      <button
                        type="button"
                        onClick={() => void reviewAttendance(liveClass)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
                      >
                        Attendance
                      </button>
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
                {reviewingAttendance?.id === String(liveClass.id) && (
                  <section className="mt-5 rounded-xl border border-white/10 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">
                        Attendance · {reviewingAttendance.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setReviewingAttendance(null)}
                        className="text-sm text-slate-400 hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                    {reviewingAttendance.loading ? (
                      <p className="mt-3 text-sm text-slate-400">Loading attendance...</p>
                    ) : reviewingAttendance.entries.length ? (
                      <ul className="mt-3 divide-y divide-white/10">
                        {reviewingAttendance.entries.map((entry) => (
                          <li key={entry.user_id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                            <span>{entry.full_name}</span>
                            <span className="text-slate-400">
                              {Math.floor(Number(entry.total_duration_seconds) / 60)} min ·{" "}
                              {entry.join_count} join{Number(entry.join_count) === 1 ? "" : "s"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">
                        No verified attendance has been recorded.
                      </p>
                    )}
                  </section>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center text-slate-400">
            No live classes are scheduled for your courses yet.
          </div>
        )}

        {user?.role === "student" && (
          <section className="mt-10 rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              My attendance history
            </h2>
            {attendanceLoading ? (
              <p className="mt-4 text-sm text-slate-400">Loading attendance...</p>
            ) : attendance.length ? (
              <ul className="mt-4 divide-y divide-white/10">
                {attendance.map((entry) => (
                  <li key={entry.live_class_id} className="flex flex-wrap justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{entry.live_class_title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {entry.course_title} · {formatDate(entry.scheduled_at)}
                      </p>
                    </div>
                    <p className="text-sm text-slate-300">
                      {Math.floor(Number(entry.total_duration_seconds) / 60)} min ·{" "}
                      {entry.join_count} join{Number(entry.join_count) === 1 ? "" : "s"}
                      {entry.connected ? " · connected" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Attendance appears here after you join a LiveKit classroom.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
