
import { useState } from "react";
import { CheckCircle2, LoaderCircle, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { enrollInCourse } from "../services/enrollmentService";

export default function EnrollButton({
  courseId,
  initialEnrolled = false,
  onEnrolled,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleEnroll() {
    setError("");
    setMessage("");

    if (!user) {
      navigate("/login");
      return;
    }

    if (user.role !== "student") {
      setError("Only student accounts can enroll in courses.");
      return;
    }

    setLoading(true);

    try {
      const response = await enrollInCourse(courseId);
      setEnrolled(true);
      setMessage(response.message || "Enrollment successful.");
      onEnrolled?.(response.data);
    } catch (err) {
      setError(
        err.response?.data?.message || "Enrollment failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (enrolled) {
    return (
      <div className="space-y-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          You are enrolled
        </p>
        {message && <p className="text-sm text-slate-300">{message}</p>}
        <button
          type="button"
          onClick={() => navigate(`/courses/${courseId}/learn`)}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
        >
          Go to course
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : (
          <UserPlus className="h-5 w-5" />
        )}
        {loading ? "Enrolling..." : "Enroll in course"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
