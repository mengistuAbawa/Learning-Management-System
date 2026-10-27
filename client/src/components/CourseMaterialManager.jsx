import { useEffect, useState } from "react";
import { FileText, LoaderCircle, Send, Trash2, Upload } from "lucide-react";
import api from "../services/api";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];

function errorMessage(error) {
  return error.response?.data?.message || error.message || "Request failed.";
}

function formatSize(bytes) {
  const size = Number(bytes);
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function CourseMaterialManager({ courses }) {
  const [courseId, setCourseId] = useState("");
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!courseId) return undefined;

    let active = true;
    Promise.all([
      api.get(`/courses/${courseId}/modules`),
      api.get(`/course-materials/courses/${courseId}`),
    ])
      .then(async ([moduleResponse, materialResponse]) => {
        const modules = moduleResponse.data.modules || [];
        const lessonResults = await Promise.all(
          modules.map((module) => api.get(`/modules/${module.id}/lessons`))
        );
        if (!active) return;
        const nextLessons = lessonResults.flatMap((result, index) =>
          (result.data.lessons || []).map((lesson) => ({
            ...lesson,
            module_title: modules[index].title,
          }))
        );
        setLessons(nextLessons);
        setMaterials(materialResponse.data.materials || []);
        setLessonId((current) =>
          nextLessons.some((lesson) => String(lesson.id) === current)
            ? current
            : ""
        );
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selected) return;
    const extension = `.${selected.name.split(".").pop()}`.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setFile(null);
      setError("Choose a PDF, DOC, DOCX, PPT, or PPTX document.");
      return;
    }
    if (!selected.size || selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Choose a document between 1 byte and 50 MB.");
      return;
    }
    setFile(selected);
    setTitle((current) => current || selected.name.replace(/\.[^.]+$/, ""));
    setError("");
    setMessage("");
  }

  async function upload(status) {
    if (!courseId || !lessonId || !file) {
      setError("Choose a course, lesson, and document before uploading.");
      return;
    }
    const form = new FormData();
    form.append("lesson_id", lessonId);
    form.append("title", title.trim() || file.name.replace(/\.[^.]+$/, ""));
    form.append("status", status);
    form.append("file", file);

    setUploading(true);
    setProgress(0);
    setError("");
    setMessage("");
    try {
      await api.post(`/course-materials/courses/${courseId}`, form, {
        timeout: 120000,
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      setFile(null);
      setTitle("");
      setMessage(
        status === "published"
          ? "Material sent. Enrolled students can download it from this lesson."
          : "Material saved as a draft. Students cannot access it until you send it."
      );
      const response = await api.get(`/course-materials/courses/${courseId}`);
      setMaterials(response.data.materials || []);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function publish(material) {
    setError("");
    setMessage("");
    try {
      await api.patch(`/course-materials/${material.id}/publish`);
      setMessage("Material sent. Enrolled students can now download it.");
      const response = await api.get(`/course-materials/courses/${courseId}`);
      setMaterials(response.data.materials || []);
    } catch (publishError) {
      setError(errorMessage(publishError));
    }
  }

  async function removeMaterial(material) {
    if (!window.confirm(`Delete "${material.title}" from this course?`)) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/course-materials/${material.id}`);
      setMaterials((current) =>
        current.filter((item) => String(item.id) !== String(material.id))
      );
      setMessage("Material deleted.");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-5 flex items-center gap-3">
        <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-bold text-slate-900">Course documents</h3>
          <p className="text-sm text-slate-600">
            Upload PDF, Word, or PowerPoint files up to 50 MB and send them to enrolled students.
          </p>
        </div>
      </header>

      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Course
          <select
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setLoading(Boolean(event.target.value));
              setError("");
              setMessage("");
              setLessons([]);
              setLessonId("");
              setMaterials([]);
              setFile(null);
              setTitle("");
            }}
            disabled={uploading}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Select a course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Lesson
          <select
            value={lessonId}
            onChange={(event) => setLessonId(event.target.value)}
            disabled={!courseId || loading || uploading}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
          >
            <option value="">Select a lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.module_title}: {lesson.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm font-medium text-slate-700">
        Document title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          disabled={uploading}
          placeholder="Title shown to students"
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Select document (PDF, DOC, DOCX, PPT, PPTX)
        <input
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={chooseFile}
          disabled={!courseId || !lessonId || uploading}
          className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700 disabled:bg-slate-100"
        />
      </label>
      {file && <p className="mt-2 text-sm text-slate-600">Selected: {file.name}</p>}
      {uploading && (
        <div className="mt-3">
          <p role="status" className="text-sm text-slate-600">Uploading document… {progress}%</p>
          <progress className="mt-1 w-full accent-indigo-600" max="100" value={progress} aria-label="Document upload progress" />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void upload("draft")}
          disabled={!file || !lessonId || uploading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Save draft
        </button>
        <button
          type="button"
          onClick={() => void upload("published")}
          disabled={!file || !lessonId || uploading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send to students
        </button>
      </div>

      {courseId && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h4 className="font-semibold text-slate-900">Uploaded documents</h4>
          {loading ? (
            <p className="mt-2 text-sm text-slate-500">Loading course documents…</p>
          ) : materials.length === 0 ? (
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              No documents have been added to this course yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {materials.map((material) => (
                <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{material.title}</p>
                      <p className="text-xs text-slate-500">
                        {material.module_title}: {material.lesson_title} · {formatSize(material.file_size)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      material.status === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}>
                      {material.status === "published" ? "Sent" : "Draft"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {material.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => void publish(material)}
                        className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Send
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void removeMaterial(material)}
                      disabled={deleting}
                      aria-label={`Delete ${material.title}`}
                      className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
