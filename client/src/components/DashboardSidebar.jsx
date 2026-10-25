import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Video,
  FileText,
  LayoutDashboard,
  LogOut,
  PlayCircle,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  ChartNoAxesCombined,
  Tags,
  GraduationCap,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";

const dashboardNavigation = {
  student: {
    title: "Student workspace",
    sections: [
      {
        heading: "Overview",
        items: [
          { label: "Dashboard", to: "/student-dashboard", icon: LayoutDashboard },
        ],
      },
      {
        heading: "Learning",
        items: [
          { label: "Browse courses", to: "/courses", icon: BookOpen },
          { label: "My courses", to: "/my-learning", icon: Activity },
          { label: "Continue learning", to: "/my-learning", icon: PlayCircle },
          { label: "Course materials", to: "/my-learning", icon: FileText },
          { label: "Video lessons", to: "/student-dashboard#videos", icon: Video },
          { label: "Learning progress", to: "/analytics", icon: ChartNoAxesCombined },
        ],
      },
      {
        heading: "Assessments",
        items: [
          { label: "Available quizzes", to: "/my-assessments#quizzes", icon: GraduationCap },
          { label: "My quiz attempts", to: "/my-assessments#attempts", icon: ClipboardCheck },
          { label: "Assignments", to: "/my-assessments#assignments", icon: FileText },
          { label: "My submissions", to: "/my-assessments#submissions", icon: ClipboardCheck },
          { label: "Grades and feedback", to: "/my-assessments#grades", icon: CheckCircle2 },
        ],
      },
      {
        heading: "Schedule",
        items: [
          { label: "Learning calendar", to: "/live-classes", icon: CalendarDays },
          { label: "Upcoming live classes", to: "/live-classes", icon: Video },
          { label: "Upcoming deadlines", to: "/my-assessments#assignments", icon: CalendarDays },
        ],
      },
      {
        heading: "Communication",
        items: [
          { label: "Notifications", to: "/notifications", icon: Bell, badge: "notifications" },
        ],
      },
      {
        heading: "Account",
        items: [
          { label: "Log out", action: "logout", icon: LogOut },
        ],
      },
    ],
  },
  instructor: {
    title: "Instructor workspace",
    sections: [
      {
        heading: "Overview",
        items: [
          { label: "Dashboard", to: "/instructor-dashboard", icon: LayoutDashboard },
        ],
      },
      {
        heading: "Course management",
        items: [
          { label: "My courses & builder", to: "/courses", icon: BookOpen },
          { label: "Recorded video lessons", action: "video-lessons", icon: Video },
        ],
      },
      {
        heading: "Teaching",
        items: [
          { label: "Students & progress", to: "/analytics", icon: Users },
          { label: "Schedule & calendar", to: "/instructor/calendar", icon: CalendarDays },
          { label: "Live classes", to: "/live-classes", icon: CalendarDays },
        ],
      },
      {
        heading: "Assessment",
        items: [
          { label: "Course quizzes & assignments", to: "/courses", icon: FileText },
          { label: "Grade essays", to: "/instructor/quizzes/grading", icon: ClipboardCheck, badge: "pendingGrading" },
        ],
      },
      {
        heading: "Analytics",
        items: [
          { label: "Teaching analytics", to: "/analytics", icon: ChartNoAxesCombined },
        ],
      },
      {
        heading: "Account",
        items: [
          { label: "Notifications", to: "/notifications", icon: Bell },
        ],
      },
    ],
  },
  admin: {
    title: "LearnSphere Admin",
    sections: [
      {
        heading: "Overview",
        items: [
          { label: "Dashboard", to: "/admin-dashboard", icon: LayoutDashboard },
          { label: "Platform analytics", to: "/admin/analytics", icon: ChartNoAxesCombined },
        ],
      },
      {
        heading: "People management",
        items: [
          { label: "Students", to: "/admin/students", icon: GraduationCap },
          { label: "Instructors", to: "/admin/instructors", icon: Users },
          { label: "Pending approvals", to: "/admin/approvals", icon: UserCheck, badge: "approvals" },
          { label: "Accounts and roles", to: "/admin/accounts", icon: ShieldCheck },
        ],
      },
      {
        heading: "Academic management",
        items: [
          { label: "Courses", to: "/admin/courses", icon: BookOpen },
          { label: "Course categories", to: "/admin/categories", icon: Tags },
          { label: "Enrollments", to: "/admin/enrollments", icon: ClipboardCheck },
          { label: "Learning sessions", to: "/live-classes", icon: CalendarDays },
          { label: "Quizzes and assessments", to: "/courses", icon: FileText },
        ],
      },
      {
        heading: "Communication",
        items: [
          { label: "Announcements", to: "/admin/announcements", icon: Bell },
          { label: "Notifications", to: "/notifications", icon: Activity, badge: "notifications" },
        ],
      },
      {
        heading: "System management",
        items: [
          { label: "System health", to: "/admin/system-health", icon: Activity },
          { label: "Audit logs", to: "/admin/audit-logs", icon: FileText },
          { label: "Platform settings", to: "/admin/settings", icon: Settings },
        ],
      },
    ],
  },
};

export default function DashboardSidebar({
  role,
  onAction,
  responsive = false,
  mobileOpen = false,
  onClose = () => {},
  collapsed = false,
  onToggleCollapsed = () => {},
  counts = {},
}) {
  const [expandedSections, setExpandedSections] = useState({});
  const location = useLocation();
  const navigation = dashboardNavigation[role];
  if (!navigation) return null;

  const responsiveClasses = responsive
    ? `fixed inset-y-0 left-0 z-40 h-screen w-[min(86vw,290px)] transform transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`
    : "w-full shrink-0 lg:sticky lg:top-24 lg:w-[230px]";
  const widthClasses = responsive && collapsed ? "lg:w-[82px]" : responsive ? "lg:w-[270px]" : "";

  return (
    <>
      {responsive && mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          aria-label="Close navigation"
          onClick={onClose}
        />
      ) : null}
      <aside className={`${responsiveClasses} ${widthClasses} shrink-0`}>
        <nav
          aria-label={`${navigation.title} navigation`}
          className="h-full overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-sm lg:shadow-none"
        >
          <div className={`mb-4 flex items-center ${collapsed && responsive ? "lg:justify-center" : "justify-between"} px-2`}>
              <div className={`min-w-0 ${collapsed && responsive ? "lg:hidden" : ""}`}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">LearnSphere</p>
                <h2 className="mt-1 truncate text-sm font-semibold text-slate-900">{navigation.title}</h2>
              </div>
            {responsive ? (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 lg:inline-flex"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <span className="text-lg leading-none" aria-hidden="true">{collapsed ? "»" : "«"}</span>
              </button>
            ) : null}
          </div>

          <div className="space-y-5">
            {navigation.sections.map((section) => (
              <section key={section.heading} aria-label={section.heading}>
                <button
                  type="button"
                  aria-expanded={expandedSections[section.heading] !== false}
                  onClick={() =>
                    setExpandedSections((current) => ({
                      ...current,
                      [section.heading]: current[section.heading] === false,
                    }))
                  }
                  className={`mb-2 flex w-full items-center px-3 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${collapsed && responsive ? "lg:hidden" : ""}`}
                >
                    {section.heading}
                </button>
                {expandedSections[section.heading] !== false && <ul className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const badgeValue =
                      item.badge === "approvals"
                        ? counts.pendingApprovals
                        : item.badge === "notifications"
                          ? counts.unreadNotifications
                          : item.badge === "pendingGrading"
                            ? counts.pendingGrading
                          : 0;
                    return (
                      <li key={item.label}>
                        {item.action ? (
                          <button
                            type="button"
                            onClick={() => {
                              onAction?.(item.action);
                              onClose();
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {item.label}
                          </button>
                        ) : (
                          <NavLink
                            to={item.to}
                            end={item.to === "/admin-dashboard" || item.to === "/student-dashboard" || item.to === "/instructor-dashboard"}
                            onClick={onClose}
                            title={collapsed && responsive ? item.label : undefined}
                            aria-label={collapsed && responsive ? item.label : undefined}
                            className={({ isActive }) => {
                              const [itemPath, itemHash] = item.to.split("#");
                              const isCurrentAnchor = itemHash &&
                                location.pathname === itemPath &&
                                (location.hash
                                  ? location.hash === `#${itemHash}`
                                  : itemHash === "quizzes");
                              const isCurrentRoute = isActive &&
                                !itemHash &&
                                !location.hash;
                              return `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                                isCurrentAnchor || isCurrentRoute
                                  ? "bg-indigo-50 text-indigo-700 shadow-sm"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                              } ${collapsed && responsive ? "lg:justify-center lg:px-2" : ""}`
                            }}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className={`${collapsed && responsive ? "lg:hidden" : ""} min-w-0 flex-1`}>{item.label}</span>
                            {Number(badgeValue) > 0 ? (
                              <span className={`${collapsed && responsive ? "lg:hidden" : ""} rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800`}>
                                {Number(badgeValue) > 99 ? "99+" : badgeValue}
                              </span>
                            ) : null}
                            {collapsed && responsive && Number(badgeValue) > 0 ? (
                              <span className="absolute ml-6 mt-[-20px] h-2 w-2 rounded-full bg-amber-500 lg:block" aria-label={`${badgeValue} pending`} />
                            ) : null}
                          </NavLink>
                        )}
                      </li>
                    );
                  })}
                </ul>}
              </section>
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}
