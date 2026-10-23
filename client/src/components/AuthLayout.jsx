import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Sparkles,
} from "lucide-react";

export default function AuthLayout({ children, mode = "login" }) {
  const isLogin = mode === "login";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-white/10 bg-slate-900 p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

          <Link
            to="/"
            className="relative z-10 flex w-fit items-center gap-3"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/25">
              <BookOpen className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-xl font-bold tracking-tight">
                LearnSphere
              </span>
              <span className="text-xs text-slate-400">
                Learning without limits
              </span>
            </span>
          </Link>

          <div className="relative z-10 max-w-xl">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 text-sm text-indigo-200">
              <Sparkles className="h-4 w-4" />
              Your learning journey starts here
            </span>

            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-6xl">
              Learn new skills.
              <span className="mt-2 block bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">
                Build your future.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
              Explore courses, track your progress, complete assessments,
              and turn your knowledge into real-world skills.
            </p>

            <div className="mt-10 space-y-4">
              {[
                "Learn at your own pace",
                "Track lessons and course progress",
                "Practice with quizzes and assignments",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <span className="text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between text-sm text-slate-500">
            <span>© {new Date().getFullYear()} LearnSphere LMS</span>
            <span className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Learn. Grow. Achieve.
            </span>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-12">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl lg:hidden" />

          <div className="relative w-full max-w-md">
            <Link to="/" className="mb-10 inline-flex items-center gap-3 lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500">
                <BookOpen className="h-6 w-6" />
              </span>
              <span className="text-xl font-bold">LearnSphere</span>
            </Link>

            <div className="mb-8">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
                Welcome to LearnSphere
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {isLogin ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-3 leading-6 text-slate-400">
                {isLogin
                  ? "Sign in to continue your learning journey."
                  : "Join LearnSphere and start learning new skills."}
              </p>
            </div>

            {children}

            <p className="mt-8 text-center text-xs leading-5 text-slate-500">
              By continuing, you agree to use LearnSphere responsibly.
              Keep your account credentials private.
            </p>

            <a
              href="#top"
              className="sr-only"
              aria-label="Back to top"
            >
              <ArrowUpRight />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}