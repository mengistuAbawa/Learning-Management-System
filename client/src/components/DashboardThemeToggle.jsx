import { Moon, Sun } from "lucide-react";

export default function DashboardThemeToggle({ darkTheme, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${darkTheme ? "light" : "dark"} theme`}
      aria-pressed={darkTheme}
      title={`Switch to ${darkTheme ? "light" : "dark"} theme`}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
    >
      {darkTheme ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
