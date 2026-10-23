
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  LoaderCircle,
  Plus,
  Send,
  Star,
  Upload,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import {
  getAssignments,
  createAssignment,
  submitAssignment,
  getAssignmentSubmissions,
  gradeAssignmentSubmission,
} from "../services/assignmentService";

const initialForm = {
  title: "",
  description: "",
  due_at: "",
  max_points: 100,
  is_published: false,
};

const initialSubmission = {
  submission_text: "",
  submission_url: "",
};

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function formatDate(date) {
  if (!date) return "No deadline";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Invalid date";
  }

  return parsedDate.toLocaleString();
}

function StatusBadge({ status }) {
  const styles = {
    published: "bg-emerald-100 text-emerald-700",
    draft: "bg-slate-100 text-slate-700",
    submitted: "bg-blue-100 text-blue-700",
    graded: "bg-purple-100 text-purple-700",
    late: "bg-rose-100 text-rose-700",
    completed: "bg-emerald-100 text-emerald-700",
  };

  const normalized = String(status || "published").toLowerCase();

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        styles[normalized] || "bg-amber-100 text-amber-700"
      }`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export default function CourseAssignments() {
  const { courseId } = useParams();
  const { user } = useAuth();

  const role = String(user?.role || "").toLowerCase();
  const canManage = ["admin", "instructor"].includes(role);

  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [submissions, setSubmissions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [submissionForm, setSubmissionForm] =
    useState(initialSubmission);

  const [gradeForms, setGradeForms] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedAssignment =
    assignments.find(
      (assignment) => String(assignment.id) === String(selectedId)
    ) || null;

  const loadAssignments = useCallback(async (isCurrent = () => true) => {
    try {
      const response = await getAssignments(courseId);
      if (!isCurrent()) return;

      const rows = Array.isArray(response)
        ? response
        : response?.assignments || response?.data?.assignments || [];

      setAssignments(rows);
      setError("");
      if (rows.length === 0) {
        setSubmissions([]);
      }

      setSelectedId((currentId) => {
        if (
          currentId &&
          rows.some(
            (assignment) =>
              String(assignment.id) === String(currentId)
          )
        ) {
          return currentId;
        }

        return rows.length ? rows[0].id : null;
      });
    } catch (err) {
      if (isCurrent()) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [courseId]);

  const loadSubmissions = useCallback(async (
    assignmentId,
    isCurrent = () => true
  ) => {
    if (!assignmentId || !canManage) {
      return;
    }

    try {
      const response =
        await getAssignmentSubmissions(assignmentId);
      if (!isCurrent()) return;

      const rows = Array.isArray(response)
        ? response
        : response?.submissions ||
          response?.data?.submissions ||
          [];

      setSubmissions(rows);

      const initialGrades = {};

      rows.forEach((item) => {
        initialGrades[item.id] = {
          grade: item.grade ?? "",
          feedback: item.feedback ?? "",
        };
      });

      setGradeForms(initialGrades);
    } catch (err) {
      if (isCurrent()) {
        setError(getErrorMessage(err));
      }
    }
  }, [canManage]);

  useEffect(() => {
    let isCurrent = true;
    Promise.resolve().then(() => {
      if (isCurrent) {
        return loadAssignments(() => isCurrent);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [loadAssignments]);

  useEffect(() => {
    let isCurrent = true;
    Promise.resolve().then(() => {
      if (isCurrent) {
        return loadSubmissions(selectedId, () => isCurrent);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [selectedId, loadSubmissions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        max_points: Number(form.max_points),
        is_published: form.is_published,
        due_at: form.due_at
          ? new Date(form.due_at).toISOString()
          : null,
      };

      if (payload.title.length < 2 || payload.title.length > 200) {
        throw new Error("Assignment title must contain 2–200 characters.");
      }

      if (
        payload.description.length < 5 ||
        payload.description.length > 20000
      ) {
        throw new Error("Instructions must contain 5–20000 characters.");
      }

      if (
        !Number.isFinite(payload.max_points) ||
        payload.max_points <= 0 ||
        payload.max_points > 100000
      ) {
        throw new Error("Maximum points must be between 1 and 100000.");
      }

      await createAssignment(courseId, payload);

      setForm(initialForm);
      setShowCreate(false);
      setSuccess("Assignment created successfully.");

      await loadAssignments();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedAssignment) {
      setError("Select an assignment first.");
      return;
    }

    if (
      !submissionForm.submission_text.trim() &&
      !submissionForm.submission_url.trim()
    ) {
      setError("Enter your work or provide a resource URL.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await submitAssignment(selectedAssignment.id, {
        submission_text: submissionForm.submission_text.trim(),
        submission_url: submissionForm.submission_url.trim(),
      });

      setSubmissionForm(initialSubmission);
      setShowSubmit(false);
      setSuccess("Your assignment was submitted successfully.");

      await loadAssignments();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGrade(submissionId) {
    const gradeData = gradeForms[submissionId];

    if (
      gradeData?.grade === "" ||
      gradeData?.grade === null ||
      gradeData?.grade === undefined
    ) {
      setError("Enter a grade before saving.");
      return;
    }

    const grade = Number(gradeData.grade);
    const maxPoints = Number(
      selectedAssignment?.max_points ?? 100
    );

    if (
      !Number.isFinite(grade) ||
      grade < 0 ||
      grade > maxPoints
    ) {
      setError(`Grade must be between 0 and ${maxPoints}.`);
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await gradeAssignmentSubmission(submissionId, {
        grade,
        feedback: gradeData.feedback || "",
      });

      setSuccess("Submission graded successfully.");
      await loadSubmissions(selectedId);
      await loadAssignments();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function updateGradeField(submissionId, field, value) {
    setGradeForms((current) => ({
      ...current,
      [submissionId]: {
        ...current[submissionId],
        [field]: value,
      },
    }));
  }

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Link
              to="/courses"
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-indigo-600"
            >
              <ArrowLeft size={16} />
              Back to courses
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <ClipboardList size={24} />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Course Assignments
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Manage coursework, submissions, deadlines, and grades.
                </p>
              </div>
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => {
                clearMessages();
                setShowCreate(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
            >
              <Plus size={18} />
              Create assignment
            </button>
          )}
        </header>

        {/* Alerts */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
          >
            <span>{success}</span>
            <button
              type="button"
              onClick={() => setSuccess("")}
              aria-label="Dismiss success message"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Statistics */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Total assignments
              </span>
              <ClipboardList className="text-indigo-600" size={21} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {assignments.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Upcoming deadlines
              </span>
              <Calendar className="text-amber-600" size={21} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {
                assignments.filter(
                  (item) =>
                    item.due_at &&
                    new Date(item.due_at).getTime() > now
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">
                {canManage ? "Submissions to review" : "Your submissions"}
              </span>
              <CheckCircle2 className="text-emerald-600" size={21} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {canManage
                ? submissions.filter(
                    (item) => item.grade === null || item.grade === undefined
                  ).length
                : assignments.filter(
                    (item) =>
                      item.submission_id ||
                      item.submission_status ||
                      item.grade !== null && item.grade !== undefined
                  ).length}
            </p>
          </div>
        </section>

        {/* Main content */}
        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 text-slate-500">
              <LoaderCircle className="animate-spin" size={22} />
              Loading assignments...
            </div>
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <BookOpen size={30} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              No assignments yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {canManage
                ? "Create the first assignment for this course so students can submit their work."
                : "Your instructor has not published any assignments for this course yet."}
            </p>

            {canManage && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Plus size={18} />
                Create first assignment
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
            {/* Assignment list */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900">
                  All assignments
                </h2>
                <span className="text-xs text-slate-500">
                  {assignments.length} total
                </span>
              </div>

              {assignments.map((assignment) => (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => {
                    clearMessages();
                    setSubmissions([]);
                    setSelectedId(assignment.id);
                    setShowSubmit(false);
                  }}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    String(selectedId) === String(assignment.id)
                      ? "border-indigo-300 bg-indigo-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                      <FileText size={20} />
                    </div>
                    <StatusBadge
                      status={
                        assignment.submission_status ||
                        (assignment.is_published === false
                          ? "draft"
                          : "published")
                      }
                    />
                  </div>

                  <h3 className="mt-3 font-semibold text-slate-900">
                    {assignment.title}
                  </h3>

                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                    {assignment.description ||
                      "No description provided."}
                  </p>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      {formatDate(assignment.due_at)}
                    </span>
                    <span className="font-semibold text-slate-700">
                      {assignment.max_points ?? 100} points
                    </span>
                  </div>
                </button>
              ))}
            </section>

            {/* Assignment details */}
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              {selectedAssignment ? (
                <>
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                        Assignment details
                      </p>
                      <h2 className="mt-2 text-2xl font-bold text-slate-900">
                        {selectedAssignment.title}
                      </h2>
                    </div>

                    <StatusBadge
                      status={
                        selectedAssignment.submission_status ||
                        (selectedAssignment.is_published === false
                          ? "draft"
                          : "published")
                      }
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">
                        Deadline
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {formatDate(selectedAssignment.due_at)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">
                        Maximum points
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {selectedAssignment.max_points ?? 100}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="font-semibold text-slate-900">
                      Instructions
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                      {selectedAssignment.description ||
                        "No additional instructions provided."}
                    </p>
                  </div>

                  {!canManage && (
                    <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                      <div className="flex items-start gap-3">
                        <Star
                          size={19}
                          className="mt-0.5 text-indigo-600"
                        />
                        <div>
                          <p className="font-semibold text-indigo-900">
                            Your result
                          </p>
                          <p className="mt-1 text-sm text-indigo-800">
                            {selectedAssignment.grade !== null &&
                            selectedAssignment.grade !== undefined
                              ? `Grade: ${selectedAssignment.grade} / ${
                                  selectedAssignment.max_points ?? 100
                                }`
                              : selectedAssignment.submission_id ||
                                  selectedAssignment.submission_status
                                ? "Your work has been submitted or is awaiting review."
                                : "Submit your work before the deadline."}
                          </p>

                          {selectedAssignment.feedback && (
                            <p className="mt-2 text-sm text-indigo-800">
                              Feedback: {selectedAssignment.feedback}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {!canManage && (
                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          clearMessages();
                          setShowSubmit((value) => !value);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                      >
                        {showSubmit ? (
                          <X size={17} />
                        ) : (
                          <Upload size={17} />
                        )}
                        {showSubmit ? "Cancel" : "Submit assignment"}
                      </button>
                    </div>
                  )}

                  {showSubmit && !canManage && (
                    <form
                      onSubmit={handleSubmit}
                      className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5"
                    >
                      <h3 className="font-semibold text-slate-900">
                        Submit your work
                      </h3>

                      <Field label="Written answer">
                        <textarea
                          rows={5}
                          value={submissionForm.submission_text}
                          onChange={(event) =>
                            setSubmissionForm((current) => ({
                              ...current,
                              submission_text: event.target.value,
                            }))
                          }
                          placeholder="Write your answer or describe your solution..."
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Resource URL (optional)">
                        <input
                          type="url"
                          value={submissionForm.submission_url}
                          onChange={(event) =>
                            setSubmissionForm((current) => ({
                              ...current,
                              submission_url: event.target.value,
                            }))
                          }
                          placeholder="https://github.com/username/project"
                          className={inputClass}
                        />
                      </Field>

                      <p className="text-xs leading-5 text-slate-500">
                        Upload your work to a supported file host or repository
                        and paste its URL. This form does not upload files
                        directly.
                      </p>

                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <LoaderCircle
                            size={17}
                            className="animate-spin"
                          />
                        ) : (
                          <Send size={17} />
                        )}
                        {busy ? "Submitting..." : "Submit work"}
                      </button>
                    </form>
                  )}

                  {/* Instructor grading panel */}
                  {canManage && (
                    <div className="mt-8 border-t border-slate-200 pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">
                            Student submissions
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Review work and provide grades and feedback.
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {submissions.length} submissions
                        </span>
                      </div>

                      {submissions.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center">
                          <ClipboardList
                            className="mx-auto text-slate-400"
                            size={28}
                          />
                          <p className="mt-3 text-sm text-slate-500">
                            No student submissions are available yet.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {submissions.map((submission) => (
                            <article
                              key={submission.id}
                              className="rounded-xl border border-slate-200 p-4"
                            >
                              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                                <div>
                                  <h4 className="font-semibold text-slate-900">
                                    {submission.student_name ||
                                      submission.full_name ||
                                      submission.email ||
                                      `Student #${submission.student_id}`}
                                  </h4>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Submitted:{" "}
                                    {formatDate(submission.submitted_at)}
                                  </p>
                                </div>

                                <StatusBadge
                                  status={
                                    submission.grade !== null &&
                                    submission.grade !== undefined
                                      ? "graded"
                                      : submission.status || "submitted"
                                  }
                                />
                              </div>

                              {submission.submission_text && (
                                <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                                  {submission.submission_text}
                                </div>
                              )}

                              {submission.submission_url && (
                                <a
                                  href={submission.submission_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-flex items-center gap-2 break-all text-sm font-medium text-indigo-600 hover:underline"
                                >
                                  <Upload size={15} />
                                  Open submitted resource
                                </a>
                              )}

                              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label="Grade">
                                  <input
                                    type="number"
                                    min="0"
                                    max={selectedAssignment.max_points ?? 100}
                                    step="0.01"
                                    value={
                                      gradeForms[submission.id]?.grade ?? ""
                                    }
                                    onChange={(event) =>
                                      updateGradeField(
                                        submission.id,
                                        "grade",
                                        event.target.value
                                      )
                                    }
                                    placeholder={`0–${
                                      selectedAssignment.max_points ?? 100
                                    }`}
                                    className={inputClass}
                                  />
                                </Field>

                                <Field label="Feedback">
                                  <textarea
                                    rows={2}
                                    value={
                                      gradeForms[submission.id]?.feedback ?? ""
                                    }
                                    onChange={(event) =>
                                      updateGradeField(
                                        submission.id,
                                        "feedback",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Feedback for the student..."
                                    className={inputClass}
                                  />
                                </Field>
                              </div>

                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    handleGrade(submission.id)
                                  }
                                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {busy ? (
                                    <LoaderCircle
                                      size={16}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <CheckCircle2 size={16} />
                                  )}
                                  Save grade
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-64 items-center justify-center text-center text-slate-500">
                  Select an assignment to view its details.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Create assignment modal */}
      {showCreate && canManage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setShowCreate(false);
            }
          }}
        >
          <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Create assignment
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add instructions and a deadline for your students.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <Field label="Assignment title">
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="e.g. Build a REST API"
                  className={inputClass}
                />
              </Field>

              <Field label="Instructions">
                <textarea
                  required
                  minLength={5}
                  maxLength={20000}
                  rows={5}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe the requirements, expected deliverables, and evaluation criteria..."
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Due date and time">
                  <input
                    type="datetime-local"
                    value={form.due_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        due_at: event.target.value,
                      }))
                    }
                    min={new Date().toISOString().slice(0, 16)}
                    className={inputClass}
                  />
                </Field>

                <Field label="Maximum points">
                  <input
                    type="number"
                    required
                    min="1"
                    max="100000"
                    step="1"
                    value={form.max_points}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        max_points: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_published: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  Publish assignment for students
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <LoaderCircle
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <Plus size={17} />
                  )}
                  {busy ? "Creating..." : "Create assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
