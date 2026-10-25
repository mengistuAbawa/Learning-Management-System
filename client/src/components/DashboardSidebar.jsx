import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const dashboardNavigation = {
  student: {
    title: "Student workspace",
    items: [
      { label: "Dashboard", to: "/student-dashboard", icon: LayoutDashboard },
      { label: "Courses", to: "/courses", icon: BookOpen },
      { label: "My learning", to: "/my-learning", icon: Activity },
      { label: "Live classes", to: "/live-classes", icon: CalendarDays },
      { label: "Notifications", to: "/notifications", icon: Bell },
      { label: "Analytics", to: "/analytics", icon: Activity },
      { label: "Grade essays", to: "/instructor/quizzes/grading", icon: ClipboardCheck },
    ],
  },
  instructor: {
    title: "Instructor workspace",
    items: [
      { label: "Dashboard", to: "/instructor-dashboard", icon: LayoutDashboard },
      { label: "Courses", to: "/courses", icon: BookOpen },
      { label: "Live classes", to: "/live-classes", icon: CalendarDays },
      { label: "Analytics", to: "/analytics", icon: Activity },
      { label: "Grade essays", to: "/instructor/quizzes/grading", icon: ClipboardCheck },
      { label: "Notifications", to: "/notifications", icon: Bell },
    ],
  },
  admin: {
    title: "Administration",
    items: [
      { label: "Dashboard", to: "/admin-dashboard", icon: LayoutDashboard },
      { label: "Courses", to: "/courses", icon: BookOpen },
      { label: "Live classes", to: "/live-classes", icon: CalendarDays },
      { label: "Analytics", to: "/analytics", icon: Activity },
      { label: "Student accounts", href: "#student-accounts", icon: Users },
      { label: "Recent users", href: "#recent-users", icon: Users },
    ],
  },
};

export default function DashboardSidebar({ role }) {
  const navigation = dashboardNavigation[role];

  if (!navigation) return null;

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-60">
      <nav
        aria-label={`${navigation.title} navigation`}
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:overflow-visible lg:p-4"
      >
        <h2 className="hidden px-3 pb-3 text-xs font-bold uppercase tracking-wider text-slate-400 lg:block">
          {navigation.title}
        </h2>
        <ul className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
          {navigation.items.map((item) => {
            const Icon = item.icon;
            const linkClassName =
              "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

            return (
              <li key={item.label}>
                {item.to ? (
                  <NavLink
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      `${linkClassName} ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ) : (
                  <a
                    href={item.href}
                    className={`${linkClassName} text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
