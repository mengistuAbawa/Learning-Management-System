
import {
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";

const features = [
  {
    icon: BookOpen,
    title: "Explore Courses",
    description:
      "Discover courses and organize your learning journey.",
  },
  {
    icon: GraduationCap,
    title: "Learn at Your Pace",
    description:
      "Study lessons and track your learning progress.",
  },
  {
    icon: Users,
    title: "Teach and Collaborate",
    description:
      "Give instructors tools to create and manage courses.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Learning",
    description:
      "Separate permissions for students, instructors, and administrators.",
  },
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a
            href="/"
            className="flex items-center gap-2 text-xl font-bold text-indigo-700"
          >
            <GraduationCap size={30} />
            LearnSphere
          </a>

          <span className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
            Learning starts here
          </span>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
        <section className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700">
              Your online learning platform
            </span>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-6xl">
              Learn new skills.
              <span className="block text-indigo-600">
                Build your future.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              LearnSphere brings courses, lessons, assignments,
              and learning progress together in one place.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#features"
                className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700"
              >
                Explore features
              </a>

              <a
                href="http://localhost:5000/api/health"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold hover:bg-slate-100"
              >
                Check API
              </a>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-xl sm:p-12">
            <GraduationCap size={64} />

            <h2 className="mt-6 text-3xl font-bold">
              One platform.
              <br />
              Endless possibilities.
            </h2>

            <p className="mt-4 leading-7 text-indigo-100">
              A shared learning space for students, instructors,
              and administrators.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <BookOpen size={24} />
                <p className="mt-3 font-semibold">Online courses</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <Users size={24} />
                <p className="mt-3 font-semibold">Learning community</p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Everything you need to learn
            </h2>
            <p className="mt-4 text-slate-600">
              We're building these features step by step.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <article
                  key={feature.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="inline-flex rounded-xl bg-indigo-50 p-3 text-indigo-600">
                    <Icon size={28} />
                  </div>

                  <h3 className="mt-5 text-lg font-bold">
                    {feature.title}
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-indigo-700">
            LearnSphere LMS
          </p>
          <p className="text-sm text-slate-500">
            Learn. Practice. Grow.
          </p>
        </div>
      </footer>
    </div>
  );
}
