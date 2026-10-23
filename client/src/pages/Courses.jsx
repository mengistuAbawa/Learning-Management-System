import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  ArrowDownUp,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Edit3,
  GraduationCap,
  ImagePlus,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import {
  createCourse,
  deleteCourse,
  getCourses,
  updateCourse,
} from "../services/courseService";

const INITIAL_FORM = {
  title: "",
  description: "",
  category: "Programming",
  level: "beginner",
  thumbnail_url: "",
  price: "0",
  status: "draft",
};

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "all_levels", label: "All levels" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function getErrorMessage(error) {
  const errors = error.response?.data?.errors;

  if (Array.isArray(errors) && errors.length) {
    return errors.join(" ");
  }

  return (
    error.response?.data?.message ||
    "Something went wrong. Please try again."
  );
}

function formatPrice(price) {
  const amount = Number(price || 0);

  if (amount === 0) return "Free";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function StatusBadge({ status }) {
  const styles = {
    published: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    draft: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    archived: "bg-slate-400/10 text-slate-300 ring-slate-400/20",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
        styles[status] || styles.draft
      }`}
    >
      {status}
    </span>
  );
}

function CourseForm({ initialCourse, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => {
    if (!initialCourse) return INITIAL_FORM;

    return {
      title: initialCourse.title || "",
      description: initialCourse.description || "",
      category: initialCourse.category || "",
      level: initialCourse.level || "beginner",
      thumbnail_url: initialCourse.thumbnail_url || "",
      price: String(initialCourse.price ?? 0),
      status: initialCourse.status || "draft",
    };
  });

  const [error, setError] = useState("");

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const price = Number(form.price);

    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid non-negative price.");
      return;
    }

    if (form.title.trim().length < 3) {
      setError("The course title must contain at least 3 characters.");
      return;
    }

    if (form.description.trim().length < 10) {
      setError("The description must contain at least 10 characters.");
      return;
    }

    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        level: form.level,
        thumbnail_url: form.thumbnail_url.trim() || null,
        price,
        status: form.status,
      });
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-form-title"
        className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 p-5 sm:p-6">
          <div>
            <h2 id="course-form-title" className="text-xl font-bold">
              {initialCourse ? "Edit course" : "Create a course"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Enter the course details below.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200"
            >
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="course-title" className="mb-2 block text-sm font-medium">
              Course title *
            </label>
            <input
              id="course-title"
              name="title"
              required
              minLength={3}
              maxLength={200}
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Full Stack Web Development"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>

          <div>
            <label htmlFor="course-description" className="mb-2 block text-sm font-medium">
              Description *
            </label>
            <textarea
              id="course-description"
              name="description"
              required
              minLength={10}
              maxLength={20000}
              rows={4}
              value={form.description}
              onChange={handleChange}
              placeholder="Explain what learners will learn in this course..."
              className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="course-category" className="mb-2 block text-sm font-medium">
                Category *
              </label>
              <input
                id="course-category"
                name="category"
                required
                minLength={2}
                maxLength={100}
                value={form.category}
                onChange={handleChange}
                placeholder="Programming"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label htmlFor="course-level" className="mb-2 block text-sm font-medium">
                Difficulty level *
              </label>
              <select
                id="course-level"
                name="level"
                value={form.level}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
              >
                {LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="course-price" className="mb-2 block text-sm font-medium">
                Price (USD)
              </label>
              <input
                id="course-price"
                name="price"
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                required
                value={form.price}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label htmlFor="course-status" className="mb-2 block text-sm font-medium">
                Status
              </label>
              <select
                id="course-status"
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"
              >
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="course-thumbnail" className="mb-2 block text-sm font-medium">
              Thumbnail image URL (optional)
            </label>
            <div className="relative">
              <ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                id="course-thumbnail"
                name="thumbnail_url"
                type="url"
                maxLength={2048}
                value={form.thumbnail_url}
                onChange={handleChange}
                placeholder="https://example.com/course.jpg"
                className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-11 pr-4 outline-none focus:border-indigo-400"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Enter an image URL. File uploads can be added in a later step.
            </p>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-60"
            >
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {initialCourse ? "Save changes" : "Create course"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CourseCard({ course, canManage, onEdit, onDelete, onArchive }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 transition duration-300 hover:-translate-y-1 hover:border-indigo-400/30 hover:bg-slate-900">
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-600/30 to-cyan-500/10">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={`${course.title} course thumbnail`}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BookOpen className="h-14 w-14 text-indigo-200/70" />
          </div>
        )}

        <div className="absolute left-3 top-3">
          <StatusBadge status={course.status} />
        </div>

        <div className="absolute bottom-3 right-3 rounded-lg bg-slate-950/85 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
          {formatPrice(course.price)}
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-indigo-400/10 px-2.5 py-1 text-indigo-200">
            {course.category}
          </span>
          <span className="capitalize">{course.level.replace("_", " ")}</span>
        </div>

        <h2 className="mt-4 line-clamp-2 min-h-14 text-lg font-bold leading-7">
          {course.title}
        </h2>

        <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-400">
          {course.description}
        </p>

        <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-sm text-slate-400">
          <GraduationCap className="h-4 w-4 shrink-0 text-indigo-300" />
          <span className="truncate">
            {course.instructor_name || "Course instructor"}
          </span>
        </div>

        <Link
          to={`/courses/${course.id}/learn`}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500 hover:text-white"
        >
          <BookOpen className="h-4 w-4" />
          View curriculum
        </Link>

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEdit(course)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>

            {course.status !== "archived" && (
              <button
                type="button"
                onClick={() => onArchive(course)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/10"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>
            )}

            <button
              type="button"
              onClick={() => onDelete(course)}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function Courses() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "instructor";

  const [courses, setCourses] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    level: "",
    status: "",
    sort: "newest",
  });
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorCourse, setEditorCourse] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const queryParams = useMemo(
    () => ({
      page,
      limit: 12,
      search: appliedSearch || undefined,
      category: filters.category || undefined,
      level: filters.level || undefined,
      status: canManage ? filters.status || undefined : undefined,
      sort: filters.sort,
    }),
    [page, appliedSearch, filters.category, filters.level, filters.status, filters.sort, canManage]
  );

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getCourses(queryParams);
      setCourses(result.courses || []);
      setPagination(result.pagination || {
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0,
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses, refreshKey]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }

  function handleSearch(event) {
    event.preventDefault();
    setAppliedSearch(filters.search.trim());
    setPage(1);
  }

  function openCreate() {
    setEditorCourse(null);
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function openEdit(course) {
    setEditorCourse(course);
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  async function handleSave(form) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editorCourse) {
        await updateCourse(editorCourse.id, form);
        setNotice("Course updated successfully.");
      } else {
        await createCourse(form);
        setNotice("Course created successfully.");
        setPage(1);
        setAppliedSearch("");
        setFilters((current) => ({ ...current, search: "" }));
      }

      setEditorOpen(false);
      setEditorCourse(null);
      setRefreshKey((key) => key + 1);
    } catch (saveError) {
      throw saveError;
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(course) {
    const confirmed = window.confirm(
      `Archive "${course.title}"? It will no longer appear in the student catalog.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await updateCourse(course.id, { status: "archived" });
      setNotice("Course archived successfully.");
      setRefreshKey((key) => key + 1);
    } catch (archiveError) {
      setError(getErrorMessage(archiveError));
    }
  }

  async function handleDelete(course) {
    const confirmed = window.confirm(
      `Permanently delete "${course.title}"? Courses with related learning records cannot be deleted.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await deleteCourse(course.id);
      setNotice("Course deleted successfully.");
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  const categories = useMemo(
    () => [...new Set(courses.map((course) => course.category).filter(Boolean))].sort(),
    [courses]
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">LearnSphere</span>
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            <Link
              to="/dashboard"
              className="rounded-xl px-3 py-2 text-slate-300 hover:bg-white/5 hover:text-white"
            >
              Dashboard
            </Link>
            <span className="rounded-xl bg-indigo-500/10 px-3 py-2 font-semibold text-indigo-200">
              Courses
            </span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-600/10 p-7 sm:p-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-indigo-200">
                <GraduationCap className="h-4 w-4" />
                LEARNING LIBRARY
              </span>

              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
                Discover your next skill.
              </h1>

              <p className="mt-4 leading-7 text-slate-300">
                Explore learning opportunities, find the right level, and
                build your skills with LearnSphere.
              </p>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold hover:bg-indigo-400"
              >
                <Plus className="h-5 w-5" />
                Create course
              </button>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
          <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Search courses..."
                maxLength={100}
                aria-label="Search courses"
                className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-400"
              />
            </div>

            <select
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
              aria-label="Filter by category"
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={filters.level}
              onChange={(event) => updateFilter("level", event.target.value)}
              aria-label="Filter by difficulty"
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">All levels</option>
              {LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>

            {canManage ? (
              <select
                value={filters.status}
                onChange={(event) => updateFilter("status", event.target.value)}
                aria-label="Filter by status"
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-indigo-400"
              >
                <option value="">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={filters.sort}
                onChange={(event) => updateFilter("sort", event.target.value)}
                aria-label="Sort courses"
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-indigo-400"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title_asc">Title A–Z</option>
                <option value="title_desc">Title Z–A</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            )}

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold hover:bg-indigo-400"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </form>

          {canManage && (
            <div className="mt-3 flex justify-end">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <ArrowDownUp className="h-4 w-4" />
                Sort by
                <select
                  value={filters.sort}
                  onChange={(event) => updateFilter("sort", event.target.value)}
                  aria-label="Sort courses"
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="title_asc">Title A–Z</option>
                  <option value="title_desc">Title Z–A</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                </select>
              </label>
            </div>
          )}
        </section>

        {notice && (
          <div role="status" className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {notice}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section className="mt-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Course catalog</h2>
              <p className="mt-1 text-sm text-slate-400">
                {pagination.total} {pagination.total === 1 ? "course" : "courses"} found
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <CircleDollarSign className="h-4 w-4" />
              Prices shown in USD
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-slate-400">
              <LoaderCircle className="h-8 w-8 animate-spin text-indigo-400" />
              <p>Loading courses...</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 px-6 py-16 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-slate-600" />
              <h3 className="mt-4 text-lg font-semibold">No courses found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                Try changing your search or filters. If you manage courses,
                create a new course to get started.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold hover:bg-indigo-400"
                >
                  <Plus className="h-4 w-4" />
                  Create course
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  canManage={canManage}
                  onEdit={openEdit}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {!loading && pagination.totalPages > 1 && (
            <nav aria-label="Course pages" className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/5"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/5"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          )}
        </section>

        <footer className="mt-14 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} LearnSphere LMS</span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Learn at your own pace
          </span>
        </footer>
      </div>

      {editorOpen && (
        <CourseForm
          key={editorCourse?.id || "new-course"}
          initialCourse={editorCourse}
          saving={saving}
          onClose={() => {
            if (!saving) {
              setEditorOpen(false);
              setEditorCourse(null);
            }
          }}
          onSave={handleSave}
        />
      )}
    </main>
  );
}