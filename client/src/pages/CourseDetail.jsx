import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LoaderCircle,
  Play,
  Users,
  UserRound,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { getCourseById } from "../services/courseService";
import EnrollButton from "../components/EnrollButton";

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

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modulesExpanded, setModulesExpanded] = useState(false);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getCourseById(courseId);
      setCourse(response.course);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => navigate("/courses")}
            className="mb-6 inline-flex items-center gap-2 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to courses
          </button>

          <div className="space-y-6 animate-pulse">
            <div className="h-80 bg-slate-800 rounded-2xl" />
            <div className="h-12 bg-slate-800 rounded-lg w-3/4" />
            <div className="space-y-2">
              <div className="h-4 bg-slate-800 rounded w-full" />
              <div className="h-4 bg-slate-800 rounded w-5/6" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => navigate("/courses")}
            className="mb-6 inline-flex items-center gap-2 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to courses
          </button>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p>{error}</p>
                <button
                  onClick={loadCourse}
                  className="mt-2 inline-flex rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold hover:bg-red-500"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!error && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/50 px-6 py-16 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-slate-500" />
              <h2 className="mt-4 text-xl font-bold">Course not found</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                The course you are looking for does not exist or you don't have
                access to it.
              </p>
            </div>
          )}
        </div>
      </main>
    );
  }

  const isEnrolled = isAuthenticated && user?.role === "student";
  const isCompleted = isEnrolled; // Would need enrollment status to implement properly
  const isInstructor = isAuthenticated && (user?.role === "instructor" || user?.role === "admin");

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        {/* Back Button */}
        <button
          onClick={() => navigate("/courses")}
          className="mb-6 inline-flex items-center gap-2 text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to courses
        </button>

        {/* Hero Section */}
        <div className="mb-8 grid gap-6 md:grid-cols-3">
          {/* Thumbnail */}
          <div className="md:col-span-2">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/30 to-cyan-500/10">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <BookOpen className="h-20 w-20 text-indigo-200/70" />
                </div>
              )}

              {/* Play Button Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500">
                  <Play className="h-6 w-6 fill-current" />
                </div>
              </div>
            </div>
          </div>

          {/* Enrollment Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-6 space-y-2">
              <div className="text-3xl font-bold text-indigo-300">
                {formatPrice(course.price)}
              </div>
              {course.stats?.enrollmentCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Users className="h-4 w-4" />
                  {course.stats.enrollmentCount.toLocaleString()} enrolled
                </div>
              )}
            </div>

            {isAuthenticated && !isInstructor ? (
              <EnrollButton courseId={Number(courseId)} onSuccess={loadCourse} />
            ) : !isAuthenticated ? (
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500"
              >
                Sign in to enroll
              </Link>
            ) : (
              <div className="rounded-xl bg-slate-800 px-5 py-3 text-center text-sm font-semibold text-slate-300">
                Instructor view
              </div>
            )}

            <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase">
                  Course Info
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Category:</span>
                    <span className="text-white">{course.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Level:</span>
                    <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 capitalize text-indigo-200">
                      {course.level}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-8 md:grid-cols-3">
          {/* Description & Modules */}
          <div className="md:col-span-2">
            {/* Title & Metadata */}
            <div className="mb-8">
              <h1 className="mb-4 text-4xl font-bold leading-tight">
                {course.title}
              </h1>

              <p className="text-lg leading-7 text-slate-300">
                {course.description}
              </p>
            </div>

            {/* Modules */}
            {course.modules && course.modules.length > 0 && (
              <div className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-3 text-2xl font-bold">
                    <GraduationCap className="h-6 w-6 text-indigo-400" />
                    Course Content
                  </h2>
                  <button
                    onClick={() => setModulesExpanded(!modulesExpanded)}
                    className="text-sm font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    {modulesExpanded ? "Collapse" : "Expand all"}
                  </button>
                </div>

                <div className="space-y-3">
                  {course.modules.map((module, index) => (
                    <details
                      key={module.id}
                      open={modulesExpanded}
                      className="group rounded-xl border border-white/10 bg-slate-900/50 transition hover:border-indigo-400/30"
                    >
                      <summary className="flex cursor-pointer items-center justify-between px-5 py-4 font-semibold">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-sm text-indigo-300">
                            {index + 1}
                          </span>
                          <span>{module.title}</span>
                        </div>
                        <span className="text-xs font-normal text-slate-400">
                          {module.lesson_count} lesson{module.lesson_count !== 1 ? "s" : ""}
                        </span>
                      </summary>
                      {module.description && (
                        <div className="border-t border-white/5 px-5 py-3 text-sm text-slate-400">
                          {module.description}
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            {course.stats && (
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-6 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-400">Modules</p>
                  <p className="mt-1 text-2xl font-bold">
                    {course.stats.moduleCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Lessons</p>
                  <p className="mt-1 text-2xl font-bold">
                    {course.stats.lessonCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Enrolled</p>
                  <p className="mt-1 text-2xl font-bold">
                    {course.stats.enrollmentCount}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Instructor Card */}
          {course.instructor && (
            <div>
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-6">
                <p className="mb-4 text-sm font-semibold uppercase text-slate-400">
                  Instructor
                </p>

                <div className="mb-6 flex items-center gap-4">
                  {course.instructor.avatar ? (
                    <img
                      src={course.instructor.avatar}
                      alt={course.instructor.name}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-slate-800">
                      <UserRound className="h-8 w-8 text-indigo-300" />
                    </div>
                  )}

                  <div>
                    <h3 className="font-bold">{course.instructor.name}</h3>
                    <p className="text-sm text-slate-400">
                      Course Instructor
                    </p>
                  </div>
                </div>

                {course.instructor.bio && (
                  <p className="text-sm leading-6 text-slate-400">
                    {course.instructor.bio}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
