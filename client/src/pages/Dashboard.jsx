import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";

const roleLabels = {
  student: "Student",
  instructor: "Instructor",
  admin: "Administrator",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "Learner";

  const cards = [
    {
      icon: BookOpen,
      title: "Explore courses",
      description: "Discover courses and start learning new skills.",
      status: "Course catalog is coming in Step 9.",
    },
    {
      icon: CheckCircle2,
      title: "Track your progress",
      description: "Your lesson completion and achievements will appear here.",
      status: "Progress tracking is coming soon.",
    },
    {
      icon: GraduationCap,
      title: "Quizzes and assignments",
      description: "Practice your knowledge and complete assessments.",
      status: "Assessments will be connected in a later step.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              LearnSphere
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <NavLink
              to="/analytics"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Activity size={20} />
              <span>Analytics</span>
            </NavLink>
            <Link
              to="/courses"
              className="hidden rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-indigo-400/30 hover:bg-indigo-400/10 hover:text-white sm:inline-flex"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Explore courses
            </Link>

            {user?.role === "student" && (
              <Link
                to="/my-learning"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                <BookOpen className="h-5 w-5" />
                <span>My Learning</span>
              </Link>
            )}

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.full_name}</p>
              <p className="text-xs capitalize text-slate-400">
                {roleLabels[user?.role] || user?.role}
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-5 w-5 text-indigo-300" />
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-600/10 p-7 sm:p-10 lg:p-14">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-indigo-200">
              <Sparkles className="h-4 w-4" />
              YOUR LEARNING WORKSPACE
            </span>

            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              Welcome back, {firstName}!
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Your LearnSphere account is ready. Soon, you’ll be able to explore
              courses, study lessons, complete quizzes, and track your learning
              progress from one place.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
                Signed in securely
              </span>

              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <UserRound className="h-5 w-5" />
                {roleLabels[user?.role] || user?.role}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-300">
                YOUR WORKSPACE
              </p>
              <h2 className="mt-2 text-2xl font-bold">Continue your journey</h2>
              <p className="mt-2 text-sm text-slate-400">
                Your learning tools will be enabled as we build the next
                modules.
              </p>
            </div>
            <LayoutDashboard className="hidden h-8 w-8 text-slate-600 sm:block" />
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ icon: Icon, title, description, status }) => (
              <article
                key={title}
                className="group rounded-2xl border border-white/10 bg-slate-900/70 p-6 transition duration-300 hover:-translate-y-1 hover:border-indigo-400/30 hover:bg-slate-900"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300 transition group-hover:bg-indigo-500/20">
                  <Icon className="h-6 w-6" />
                </div>

                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 min-h-14 text-sm leading-6 text-slate-400">
                  {description}
                </p>

                <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-800/70 p-3 text-xs leading-5 text-slate-400">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                  {status}
                </div>
              </article>
            ))}
          </div>
        </section>

        {user?.role === "admin" && (
          <section className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-amber-300" />
              <div>
                <h2 className="font-semibold">Administrator account</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Your account has the administrator role.
                </p>
              </div>
            </div>
          </section>
        )}

        {user?.role === "instructor" && (
          <section className="mt-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-6 w-6 text-cyan-300" />
              <div>
                <h2 className="font-semibold">Instructor workspace</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Instructor course management will be added in the course
                  module.
                </p>
              </div>
            </div>
          </section>
        )}

        <footer className="relative mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} LearnSphere LMS</p>
          <p className="flex items-center gap-2">
            Made for lifelong learners
            <ArrowRight className="h-4 w-4" />
          </p>
          <div className="absolute bottom-6 left-5 sm:left-8">
            <NotificationBell />
          </div>
        </footer>
      </main>
    </div>
  );
}
