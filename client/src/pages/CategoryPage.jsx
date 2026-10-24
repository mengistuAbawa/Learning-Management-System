import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Search,
} from "lucide-react";

import EnrollButton from "../components/EnrollButton";
import { getCourses } from "../services/courseService";

function getErrorMessage(error) {
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

function CourseCard({ course }) {
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

        <div className="absolute bottom-3 right-3 rounded-lg bg-slate-950/85 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
          {formatPrice(course.price)}
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-indigo-400/10 px-2.5 py-1 text-indigo-200">
            {course.category}
          </span>
          <span className="capitalize">{course.level}</span>
          {course.enrollment_count > 0 && (
            <span className="text-slate-500">
              {course.enrollment_count} enrolled
            </span>
          )}
        </div>

        <h2 className="mt-4 line-clamp-2 min-h-14 text-lg font-bold leading-7">
          {course.title}
        </h2>

        <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-400">
          {course.description}
        </p>

        <div className="mt-5 space-y-3 border-t border-white/5 pt-4">
          <p className="text-xs text-slate-500">
            Instructor: {course.instructor_name}
          </p>

          <div className="flex gap-2">
            <Link
              to={`/courses/${course.id}/detail`}
              className="flex-1 rounded-xl border border-white/10 px-4 py-2 text-center text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              View details
            </Link>
            <div className="flex-1">
              <EnrollButton courseId={course.id} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CategoryPage() {
  const { categoryName } = useParams();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");

  const decodedCategory = categoryName ? decodeURIComponent(categoryName) : "";

  const loadCourses = useCallback(
    async (pageNum = 1) => {
      setLoading(true);
      setError("");

      try {
        const response = await getCourses({
          page: pageNum,
          limit: 12,
          category: decodedCategory,
          search: search.trim(),
          sort: "newest",
        });

        setCourses(response.courses || []);
        setPage(response.pagination?.page || 1);
        setTotalPages(response.pagination?.totalPages || 0);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [decodedCategory, search]
  );

  useEffect(() => {
    loadCourses(1);
  }, [loadCourses]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(1);
    loadCourses(1);
  }

  function handlePrevious() {
    if (page > 1) {
      loadCourses(page - 1);
    }
  }

  function handleNext() {
    if (page < totalPages) {
      loadCourses(page + 1);
    }
  }

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
              to="/courses"
              className="rounded-xl px-3 py-2 text-slate-300 hover:bg-white/5 hover:text-white"
            >
              Courses
            </Link>
            <span className="rounded-xl bg-indigo-500/10 px-3 py-2 font-semibold text-indigo-200">
              {decodedCategory}
            </span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-600/10 p-7 sm:p-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-indigo-200">
              <GraduationCap className="h-4 w-4" />
              BROWSE BY CATEGORY
            </span>

            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
              {decodedCategory}
            </h1>

            <p className="mt-4 leading-7 text-slate-300">
              Explore all courses in the {decodedCategory} category. Find the
              right course to develop your skills.
            </p>
          </div>
        </section>

        {/* Search Section */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
          <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search within this category..."
                maxLength={100}
                aria-label="Search courses"
                className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-400"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold hover:bg-indigo-400"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </form>
        </section>

        {/* Results Info */}
        {!loading && courses.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              Showing{" "}
              <span className="font-semibold text-white">{courses.length}</span>{" "}
              course{courses.length !== 1 ? "s" : ""}
              {search && (
                <>
                  {" "}
                  matching <span className="font-semibold">"{search}"</span>
                </>
              )}
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p>{error}</p>
              <button
                onClick={() => loadCourses(page)}
                className="mt-2 inline-flex rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold hover:bg-red-500"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-96 animate-pulse rounded-2xl border border-white/10 bg-slate-900"
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && courses.length === 0 && !error && (
          <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-slate-900/50 px-6 py-16 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-slate-500" />
            <h2 className="mt-4 text-xl font-bold">No courses found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              {search
                ? `No courses in ${decodedCategory} match your search. Try a different search term.`
                : `There are no courses in the ${decodedCategory} category yet.`}
            </p>
            <Link
              to="/courses"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500"
            >
              Browse all courses
            </Link>
          </div>
        )}

        {/* Course Grid */}
        {!loading && courses.length > 0 && (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-3">
            <button
              onClick={handlePrevious}
              disabled={page === 1}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                Page{" "}
                <span className="font-bold text-white">{page}</span> of{" "}
                <span className="font-bold text-white">{totalPages}</span>
              </span>
            </div>

            <button
              onClick={handleNext}
              disabled={page === totalPages}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
