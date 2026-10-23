
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import {
  getCourseEnrollments,
  updateEnrollmentStatus,
} from "../services/enrollmentService";
import { useAuth } from "../context/AuthContext";

export default function CourseEnrollments() {
  const { courseId } = useParams();
  const { user } = useAuth();

  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canManage = ["admin", "instructor"].includes(user?.role);

  const loadEnrollments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getCourseEnrollments(courseId);
      setEnrollments(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not load enrollments. Check your course permissions."
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  async function changeStatus(enrollment, status) {
    setBusyId(enrollment.id);
    setError("");
    setNotice("");

    try {
      const response = await updateEnrollmentStatus(enrollment.id, status);

      setEnrollments((current) =>
        current.map((item) =>
          item.id === enrollment.id
            ? { ...item, status: response.data.status }
            : item
        )
      );

      setNotice(response.message || "Enrollment updated.");
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not update enrollment status."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6">
          <h1 className="text-xl font-bold">Access restricted</h1>
          <p className="mt-2 text-slate-400">
            This page is for instructors and administrators. The backend also
            verifies that instructors own the selected course.
          </p>
          <Link to="/courses" className="mt-4 inline-block text-indigo-300">
            Return to courses
          </Link>
        </div>
      </main>
    );
  }

  const activeCount = enrollments.filter(
    (item) => item.status === "active"
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          to={`/courses/${courseId}/learn`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course
        </Link>

        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 text-sm text-indigo-300">
              <Users className="h-4 w-4" />
              Enrollment administration
            </div>
            <h1 className="text-3xl font-extrabold">Enrolled students</h1>
            <p className="mt-2 text-slate-400">
              Review student enrollment status and learning completion.
            </p>
          </div>

          <button
            type="button"
            onClick={loadEnrollments}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            <CircleAlert className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Total enrollments</p>
            <p className="mt-2 text-3xl font-bold">{enrollments.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Active enrollments</p>
            <p className="mt-2 text-3xl font-bold text-emerald-300">{activeCount}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading enrollments...
          </div>
        ) : enrollments.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-10 text-center text-slate-400">
            No students are enrolled in this course yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
                <tr>
                  <th className="px-5 py-4 font-medium">Student</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Progress</th>
                  <th className="px-5 py-4 font-medium">Enrolled</th>
                  <th className="px-5 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">
                        {enrollment.student_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {enrollment.student_email}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-slate-300">
                        {enrollment.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="mb-2 text-xs text-slate-300">
                        {enrollment.completed_lessons} / {enrollment.total_lessons} lessons ·{" "}
                        {enrollment.completion_percentage}%
                      </p>
                      <div className="h-1.5 w-36 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{
                            width: `${Math.max(0, Math.min(100, Number(enrollment.completion_percentage) || 0))}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-400">
                      {enrollment.created_at
                        ? new Date(enrollment.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      {enrollment.status === "active" ? (
                        <button
                          type="button"
                          disabled={busyId === enrollment.id}
                          onClick={() => changeStatus(enrollment, "cancelled")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {busyId === enrollment.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          Cancel
                        </button>
                      ) : enrollment.status === "cancelled" ? (
                        <button
                          type="button"
                          disabled={busyId === enrollment.id}
                          onClick={() => changeStatus(enrollment, "active")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          {busyId === enrollment.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Activate
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-300">
                          Completed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
