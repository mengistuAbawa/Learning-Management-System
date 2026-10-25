import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, BookOpen, Check, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, Plus, RefreshCw, Search, ShieldCheck, Users,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import AdminWorkspace from "../components/AdminWorkspace";
import api from "../services/api";

const titles = {
  students: "Students",
  instructors: "Instructors",
  approvals: "Pending approvals",
  accounts: "Accounts and roles",
  courses: "Course management",
  categories: "Course categories",
  enrollments: "Enrollment management",
  announcements: "Announcements",
  analytics: "Platform analytics",
  "system-health": "System health",
  "audit-logs": "Audit logs",
  settings: "Platform settings",
};
const emptyPage = { page: 1, limit: 20, total: 0, pages: 0, has_more: false };
const knownStatuses = ["all", "active", "suspended", "pending", "approved", "rejected"];

function dateText(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : parsed.toLocaleDateString();
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : "—";
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [columns.map(quote).join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ value }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700",
    approved: "bg-emerald-50 text-emerald-700",
    published: "bg-emerald-50 text-emerald-700",
    completed: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-800",
    draft: "bg-slate-100 text-slate-700",
    archived: "bg-slate-100 text-slate-600",
    cancelled: "bg-slate-100 text-slate-600",
    suspended: "bg-rose-50 text-rose-700",
    rejected: "bg-rose-50 text-rose-700",
  };
  const label = value === true ? "Active" : value === false ? "Suspended" : String(value || "unknown");
  const key = value === true ? "active" : value === false ? "suspended" : String(value || "").toLowerCase();
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[key] || "bg-slate-100 text-slate-600"}`}>{label}</span>;
}

function SectionHeading({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Feedback({ error, success }) {
  if (!error && !success) return null;
  return (
    <div role={error ? "alert" : "status"} className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
      {error || success}
    </div>
  );
}

function LoadingBlock() {
  return <div className="grid gap-3" aria-label="Loading"><div className="h-12 animate-pulse rounded-xl bg-slate-100" /><div className="h-52 animate-pulse rounded-2xl bg-slate-100" /></div>;
}

function TableFrame({ children }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[760px] border-collapse text-left text-sm">{children}</table></div>;
}

function Pagination({ page, pagination, onChange }) {
  if (!pagination || pagination.pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
      <span>Page {page} of {pagination.pages} · {formatNumber(pagination.total)} records</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
        <button disabled={page >= pagination.pages} onClick={() => onChange(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function TableToolbar({ search, setSearch, status, setStatus, statuses = ["all"] }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <label className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </label>
      {setStatus ? (
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" aria-label="Filter by status">
          {statuses.map((value) => <option key={value} value={value}>{value === "all" ? "All statuses" : value[0].toUpperCase() + value.slice(1)}</option>)}
        </select>
      ) : null}
    </div>
  );
}

function Metric({ title, value, note, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></div>
        <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

export default function AdminManagementPage() {
  const { section } = useParams();
  const title = titles[section] || "Administration";
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState(emptyPage);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedRole, setSelectedRole] = useState("student");
  const [courseCategory, setCourseCategory] = useState("");
  const [courseInstructor, setCourseInstructor] = useState("");
  const [courseCategories, setCourseCategories] = useState([]);
  const [instructorOptions, setInstructorOptions] = useState([]);
  const [enrollmentOptions, setEnrollmentOptions] = useState({ courses: [], students: [] });
  const [manualEnrollment, setManualEnrollment] = useState({ course_id: "", student_email: "" });
  const [page, setPage] = useState(1);
  const [months, setMonths] = useState(12);
  const [auditDate, setAuditDate] = useState("");
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState({});
  const [categories, setCategories] = useState([]);
  const [announcement, setAnnouncement] = useState({ title: "", message: "", audience: "all", status: "draft" });
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [expandedId, setExpandedId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (section === "approvals") {
        const response = await api.get("/admin/dashboard/approvals", { params: { page, limit: 20, search } });
        setRows(response.data.users || []);
        setPagination(response.data.pagination || emptyPage);
      } else if (["students", "instructors", "accounts"].includes(section)) {
        const roles = section === "students" ? ["student"] : section === "instructors" ? ["instructor"] : [selectedRole];
        const results = await Promise.all(roles.map((role) => api.get(`/admin/dashboard/people/${role}`, {
          params: {
            page, limit: 20, search,
            status,
          },
        })));
        setRows(results.flatMap((result) => result.data.users || []));
        setPagination(results[0]?.data.pagination || emptyPage);
      } else if (section === "courses") {
        const response = await api.get("/admin/dashboard/courses", {
          params: {
            page, limit: 20, search, status,
            ...(courseCategory ? { category: courseCategory } : {}),
            ...(courseInstructor ? { instructor_id: courseInstructor } : {}),
          },
        });
        setRows(response.data.courses || []);
        setPagination(response.data.pagination || emptyPage);
      } else if (section === "enrollments") {
        const response = await api.get("/admin/dashboard/enrollments", { params: { page, limit: 20, search, status } });
        setRows(response.data.enrollments || []);
        setPagination(response.data.pagination || emptyPage);
      } else if (section === "categories") {
        const response = await api.get("/courses/categories");
        const found = response.data.categories || [];
        setCategories(found.filter((category) => !search || category.category.toLowerCase().includes(search.toLowerCase())));
        setPagination({ ...emptyPage, total: found.length, pages: 1 });
      } else if (section === "announcements") {
        const response = await api.get("/admin/announcements", { params: { limit: 100 } });
        setRows(response.data.announcements || []);
        setPagination({ ...emptyPage, total: response.data.announcements?.length || 0, pages: 1 });
      } else if (section === "analytics") {
        const [overview, analytics] = await Promise.all([
          api.get("/admin/dashboard/overview"),
          api.get("/admin/dashboard/analytics", { params: { months } }),
        ]);
        setSummary({ ...overview.data.summary, ...analytics.data });
        setRows(analytics.data.popular_courses || []);
      } else if (section === "system-health") {
        const response = await api.get("/admin/health");
        setHealth(response.data);
      } else if (section === "audit-logs") {
        const response = await api.get("/admin/audit-logs", {
          params: {
            page,
            limit: 20,
            search,
            ...(auditDate ? { from: auditDate, to: auditDate } : {}),
          },
        });
        setRows(response.data.logs || []);
        setPagination(response.data.pagination || emptyPage);
      } else if (section === "settings") {
        const response = await api.get("/admin/settings");
        setSettings(response.data.settings || {});
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to load ${title.toLowerCase()}.`);
      if (section === "system-health") setHealth(requestError.response?.data || null);
    } finally {
      setLoading(false);
    }
  }, [section, page, search, status, selectedRole, months, title, auditDate, courseCategory, courseInstructor]);

  useEffect(() => {
    const timer = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (section !== "courses") return undefined;
    let active = true;
    Promise.all([
      api.get("/courses/categories"),
      api.get("/admin/dashboard/people/instructor", { params: { page: 1, limit: 100 } }),
    ])
      .then(([categoryResponse, instructorResponse]) => {
        if (!active) return;
        setCourseCategories(categoryResponse.data.categories || []);
        setInstructorOptions(instructorResponse.data.users || []);
      })
      .catch(() => {
        if (!active) return;
        setCourseCategories([]);
        setInstructorOptions([]);
      });
    return () => { active = false; };
  }, [section]);

  useEffect(() => {
    if (section !== "enrollments") return undefined;
    let active = true;
    Promise.all([
      api.get("/admin/dashboard/courses", { params: { page: 1, limit: 100, status: "published" } }),
      api.get("/admin/dashboard/people/student", { params: { page: 1, limit: 100, status: "active" } }),
    ])
      .then(([coursesResponse, studentsResponse]) => {
        if (!active) return;
        setEnrollmentOptions({
          courses: coursesResponse.data.courses || [],
          students: (studentsResponse.data.users || []).filter(
            (student) => student.approval_status === "approved",
          ),
        });
      })
      .catch(() => {
        if (active) setEnrollmentOptions({ courses: [], students: [] });
      });
    return () => { active = false; };
  }, [section]);

  function updateSearch(value) {
    setSearch(value);
    setPage(1);
  }

  function updateStatus(value) {
    setStatus(value);
    setPage(1);
  }

  function updateRole(value) {
    setSelectedRole(value);
    setPage(1);
  }

  function updateAuditDate(value) {
    setAuditDate(value);
    setPage(1);
  }

  async function runAction(key, action, successMessage) {
    setBusy(key);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(successMessage);
      await refresh();
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The requested change could not be saved.");
      return false;
    } finally {
      setBusy("");
    }
  }

  const availableStatuses = useMemo(() => {
    if (section === "courses") return ["all", "published", "draft", "archived"];
    if (section === "enrollments") return ["all", "active", "completed", "cancelled"];
    return ["all", ...knownStatuses.slice(1)];
  }, [section]);

  if (!titles[section]) {
    return <AdminWorkspace title="Administration"><div className="rounded-2xl border border-slate-200 bg-white p-8"><h2 className="text-xl font-semibold">Admin section not found</h2><Link className="mt-3 inline-block text-indigo-700 underline" to="/admin-dashboard">Back to dashboard</Link></div></AdminWorkspace>;
  }

  return (
    <AdminWorkspace title={title}>
      <Feedback error={error} success={success} />
      <SectionHeading
        title={title}
        description={descriptions[section]}
      >
        <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </SectionHeading>

      {section === "analytics" ? (
        <AnalyticsPanel loading={loading} summary={summary} rows={rows} months={months} setMonths={setMonths} />
      ) : section === "system-health" ? (
        <HealthPanel loading={loading} health={health} />
      ) : section === "settings" ? (
        <SettingsPanel settings={settings} busy={busy} onSave={(key, value) => runAction(key, () => api.put(`/admin/settings/${key}`, { value: key === "support_email" && value === "" ? null : value }), `${key.replaceAll("_", " ")} saved.`)} />
      ) : section === "categories" ? (
        <CategoryPanel categories={categories} loading={loading} search={search} setSearch={setSearch} name={categoryName} setName={setCategoryName} description={categoryDescription} setDescription={setCategoryDescription} editing={editingCategory} setEditing={setEditingCategory} busy={busy} onCreate={() => runAction("category-create", async () => { await api.post("/courses/categories", { name: categoryName, description: categoryDescription }); setCategoryName(""); setCategoryDescription(""); }, "Category created.")} onRename={(oldName, newName, description) => runAction(`category-${oldName}`, () => api.put(`/courses/categories/${encodeURIComponent(oldName)}`, { name: newName, description }), "Category updated.")} onDelete={(name) => runAction(`category-${name}`, () => api.delete(`/courses/categories/${encodeURIComponent(name)}`), "Category deleted.")} />
      ) : section === "announcements" ? (
        <AnnouncementPanel rows={rows} loading={loading} draft={announcement} setDraft={setAnnouncement} editing={editingAnnouncement} setEditing={setEditingAnnouncement} busy={busy} onSubmit={() => runAction("announcement-save", async () => {
          if (editingAnnouncement) await api.patch(`/admin/announcements/${editingAnnouncement}`, announcement);
          else await api.post("/admin/announcements", announcement);
          setAnnouncement({ title: "", message: "", audience: "all", status: "draft" });
          setEditingAnnouncement(null);
        }, editingAnnouncement ? "Announcement updated." : "Announcement saved.")} onToggle={(item) => runAction(`announcement-${item.id}`, () => api.patch(`/admin/announcements/${item.id}`, { status: item.status === "published" ? "draft" : "published" }), item.status === "published" ? "Announcement unpublished." : "Announcement published.")} />
      ) : section === "audit-logs" ? (
        <AuditLogs rows={rows} loading={loading} page={page} pagination={pagination} onPage={setPage} search={search} setSearch={updateSearch} auditDate={auditDate} setAuditDate={updateAuditDate} />
      ) : (
        <PeopleAcademicPanel
          section={section}
          rows={rows}
          loading={loading}
          page={page}
          pagination={pagination}
          onPage={setPage}
          search={search}
          setSearch={updateSearch}
          status={status}
          setStatus={updateStatus}
          statuses={availableStatuses}
          role={selectedRole}
          setRole={updateRole}
          courseCategory={courseCategory}
          setCourseCategory={(value) => { setCourseCategory(value); setPage(1); }}
          courseInstructor={courseInstructor}
          setCourseInstructor={(value) => { setCourseInstructor(value); setPage(1); }}
          courseCategories={courseCategories}
          instructorOptions={instructorOptions}
          enrollmentOptions={enrollmentOptions}
          manualEnrollment={manualEnrollment}
          setManualEnrollment={setManualEnrollment}
          onManualEnrollment={() => runAction(
            "manual-enrollment",
            () => api.post(
              `/enrollments/courses/${manualEnrollment.course_id}/students`,
              { student_email: manualEnrollment.student_email },
            ),
            "Student enrolled successfully.",
          )}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          busy={busy}
          onStatus={(user) => runAction(`status-${user.id}`, () => api.patch(`/users/${user.id}/status`, { is_active: !user.is_active }), user.is_active ? "Account suspended." : "Account reactivated.")}
          onApproval={(user, approvalStatus, reason) => runAction(`approval-${user.id}`, () => api.patch(`/users/${user.role === "instructor" ? "instructors" : "students"}/${user.id}/approval`, { approval_status: approvalStatus, reason }), `Application ${approvalStatus}.`)}
          onPublish={(course, nextStatus) => runAction(`course-${course.id}`, () => api.patch(`/courses/${course.id}`, { status: nextStatus }), `Course ${nextStatus}.`)}
          onExport={() => downloadCsv(`${section}-page-${page}.csv`, rows)}
        />
      )}
    </AdminWorkspace>
  );
}

const descriptions = {
  students: "Search learner accounts, review enrollment progress, and suspend or reactivate accounts.",
  instructors: "Review instructor profiles, course activity, approval state, and account access.",
  approvals: "Review pending student registrations and instructor applications. Decisions are saved and audited server-side.",
  accounts: "Manage student and instructor access. Administrators cannot deactivate their own account here.",
  courses: "Review courses, publication state, instructor assignment, and enrollment totals.",
  categories: "Create, rename, or remove unused course categories. Assigned categories cannot be deleted.",
  enrollments: "Inspect enrollment records and completion progress. Enrollment totals represent records, not unique students.",
  announcements: "Create and publish platform announcements. Publishing takes effect immediately; scheduling is not configured.",
  analytics: "Explore real PostgreSQL aggregates. Enrollment records are counted separately from unique learners.",
  "system-health": "Live checks of the API process and PostgreSQL connection. Sensitive infrastructure details are not shown.",
  "audit-logs": "Read-only administrative activity history. Entries are append-only through the application.",
  settings: "Manage supported platform preferences. Deployment secrets remain outside browser-editable settings.",
};

function PeopleAcademicPanel(props) {
  const {
    section, rows, loading, page, pagination, onPage, search, setSearch,
    status, setStatus, statuses, role, setRole,     expandedId, setExpandedId, courseCategory, setCourseCategory,
    courseInstructor, setCourseInstructor, courseCategories, instructorOptions,
    enrollmentOptions, manualEnrollment, setManualEnrollment, onManualEnrollment,
    busy, onStatus, onApproval, onPublish, onExport,
  } = props;
  const [manualEnrollmentOpen, setManualEnrollmentOpen] = useState(false);
  const isPeople = ["students", "instructors", "approvals", "accounts"].includes(section);
  const isCourses = section === "courses";
  const isEnrollments = section === "enrollments";
  return (
    <>
      {section === "accounts" ? (
        <label className="mb-4 block max-w-xs text-sm font-medium text-slate-700">Account type
          <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <option value="student">Students</option><option value="instructor">Instructors</option>
          </select>
        </label>
      ) : null}
      {isEnrollments ? (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setManualEnrollmentOpen((value) => !value)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Enroll a student</button>
        </div>
      ) : null}
      {section === "enrollments" && manualEnrollmentOpen ? (
        <form onSubmit={async (event) => { event.preventDefault(); if (await onManualEnrollment()) setManualEnrollmentOpen(false); }} className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium text-slate-700">Published course
            <select required value={manualEnrollment.course_id} onChange={(event) => setManualEnrollment({ ...manualEnrollment, course_id: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <option value="">Select course</option>
              {enrollmentOptions.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Approved student
            <select required value={manualEnrollment.student_email} onChange={(event) => setManualEnrollment({ ...manualEnrollment, student_email: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <option value="">Select student</option>
              {enrollmentOptions.students.map((student) => <option key={student.id} value={student.email}>{student.full_name} · {student.email}</option>)}
            </select>
          </label>
          <button disabled={Boolean(busy) || !manualEnrollment.course_id || !manualEnrollment.student_email} className="mt-auto rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Enroll</button>
          <p className="text-xs text-slate-500 sm:col-span-3">Only published courses and active, approved student accounts are accepted. Duplicate enrollments are rejected by the backend.</p>
        </form>
      ) : null}
      {section !== "approvals" ? <TableToolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={statuses} /> : <TableToolbar search={search} setSearch={setSearch} />}
      {section === "courses" ? <div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-500">Category<select value={courseCategory} onChange={(event) => setCourseCategory(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"><option value="">All categories</option>{courseCategories.map((item) => <option key={item.category} value={item.category}>{item.category}</option>)}</select></label><label className="text-xs font-medium text-slate-500">Instructor<select value={courseInstructor} onChange={(event) => setCourseInstructor(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"><option value="">All instructors</option>{instructorOptions.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label></div> : null}
      {(isPeople || isEnrollments) && rows.length > 0 ? (
        <div className="mb-3 flex justify-end"><button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><ArrowDownToLine className="h-4 w-4" />Export current page CSV</button></div>
      ) : null}
      {loading ? <LoadingBlock /> : rows.length === 0 ? <EmptyPanel label="No matching records found." /> : (
        <TableFrame>
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {(isPeople ? ["Account", "Role", "Account status", "Approval", "Courses / activity", "Joined", "Actions"] : isCourses ? ["Course", "Instructor", "Category", "Status", "Enrollments", "Created", "Actions"] : ["Student", "Course", "Instructor", "Status", "Progress", "Enrolled", "Completed"]).map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const key = String(row.id);
              const expanded = expandedId === key;
              return (
                <tr key={key} className="align-top hover:bg-slate-50/70">
                  {isPeople ? <>
                    <td className="px-4 py-4"><button type="button" onClick={() => setExpandedId(expanded ? "" : key)} className="text-left font-semibold text-slate-900 hover:text-indigo-700">{row.full_name}</button><p className="mt-1 text-xs text-slate-500">{row.email}</p>{expanded ? <div className="mt-2 max-w-sm text-xs text-slate-500"><p>{row.bio || "No profile biography provided."}</p>{row.approval_reviewed_at ? <p className="mt-1">Reviewed {dateText(row.approval_reviewed_at)}{row.approval_reviewed_by_name ? ` by ${row.approval_reviewed_by_name}` : ""}{row.approval_reason ? ` · ${row.approval_reason}` : ""}</p> : null}<p className="mt-2 font-medium text-slate-700">{row.role === "instructor" ? "Courses taught" : "Enrolled courses"}</p><ul className="mt-1 space-y-1">{(row.managed_courses || row.enrolled_courses || []).slice(0, 5).map((course) => <li key={course.id}>{course.title} · {course.status}</li>)}</ul></div> : null}</td>
                    <td className="px-4 py-4 capitalize text-slate-600">{row.role}</td>
                    <td className="px-4 py-4"><StatusPill value={row.is_active} /></td>
                    <td className="px-4 py-4"><StatusPill value={row.approval_status} /></td>
                    <td className="px-4 py-4 text-slate-600">{row.role === "instructor" ? <>{formatNumber(row.course_count)} courses · {formatNumber(row.enrollment_count)} enrollments</> : <>{formatNumber(row.enrollment_count)} enrollments · {formatNumber(row.completed_enrollments)} completed{row.average_progress !== undefined ? <div className="mt-1 text-xs">{Number(row.average_progress).toFixed(1)}% average progress</div> : null}</>}</td>
                    <td className="px-4 py-4 text-slate-600">{dateText(row.created_at)}</td>
                    <td className="px-4 py-4">
                      {section === "approvals" && row.approval_status === "pending" ? <div className="flex flex-wrap gap-2">
                        <button disabled={Boolean(busy)} onClick={() => onApproval(row, "approved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                        <button disabled={Boolean(busy)} onClick={() => { const reason = window.prompt("Optional reason for rejection:"); if (reason !== null) onApproval(row, "rejected", reason.trim()); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button>
                      </div> : <button disabled={Boolean(busy)} onClick={() => { if (!row.is_active || window.confirm(`Suspend ${row.full_name}'s account? They will lose access immediately.`)) onStatus(row); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50">{row.is_active ? "Suspend" : "Reactivate"}</button>}
                    </td>
                  </> : isCourses ? <>
                    <td className="max-w-xs px-4 py-4"><p className="font-semibold text-slate-900">{row.title}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.description}</p></td>
                    <td className="px-4 py-4 text-slate-600">{row.instructor_name}</td><td className="px-4 py-4 text-slate-600">{row.category || "Uncategorized"}</td><td className="px-4 py-4"><StatusPill value={row.status} /></td><td className="px-4 py-4 text-slate-600">{formatNumber(row.enrollment_count)}</td><td className="px-4 py-4 text-slate-600">{dateText(row.created_at)}</td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-2">{row.status !== "archived" ? <button disabled={Boolean(busy)} onClick={() => onPublish(row, row.status === "published" ? "draft" : "published")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50">{row.status === "published" ? "Unpublish" : "Publish"}</button> : <button disabled={Boolean(busy)} onClick={() => onPublish(row, "draft")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium">Restore</button>}{row.status !== "archived" ? <button disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Archive “${row.title}”? Existing enrollments and content will be preserved.`)) onPublish(row, "archived"); }} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-800 disabled:opacity-50">Archive</button> : null}</div></td>
                  </> : <>
                    <td className="px-4 py-4"><p className="font-medium text-slate-900">{row.student_name}</p><p className="text-xs text-slate-500">{row.student_email}</p></td>
                    <td className="px-4 py-4"><Link to={`/courses/${row.course_id}/detail`} className="font-medium text-indigo-700 hover:underline">{row.course_title}</Link></td><td className="px-4 py-4 text-slate-600">{row.instructor_name}</td><td className="px-4 py-4"><StatusPill value={row.status} /></td><td className="px-4 py-4 text-slate-600">{Number(row.progress_percentage || 0).toFixed(1)}%</td><td className="px-4 py-4 text-slate-600">{dateText(row.enrolled_at)}</td><td className="px-4 py-4 text-slate-600">{dateText(row.completed_at)}</td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}
      <Pagination page={page} pagination={pagination} onChange={onPage} />
    </>
  );
}

function EmptyPanel({ label }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><CircleHelp className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">{label}</p></div>;
}

function CategoryPanel({ categories, loading, search, setSearch, name, setName, description, setDescription, editing, setEditing, busy, onCreate, onRename, onDelete }) {
  return (
    <>
      <form onSubmit={(event) => { event.preventDefault(); onCreate(); }} className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_2fr_auto]">
        <label className="min-w-0 text-sm font-medium text-slate-700">New category
          <input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="e.g. Data Science" />
        </label>
        <label className="min-w-0 text-sm font-medium text-slate-700">Description (optional)
          <input maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="Short category description" />
        </label>
        <button disabled={Boolean(busy) || name.trim().length < 2} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add</button>
      </form>
      <TableToolbar search={search} setSearch={setSearch} />
      {loading ? <LoadingBlock /> : categories.length ? (
        <TableFrame><thead><tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Courses</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">
          {categories.map((category) => <tr key={category.category}>
            <td className="px-4 py-4">{editing === category.category ? <input autoFocus defaultValue={category.category} aria-label="New category name" className="rounded-lg border border-slate-200 px-3 py-2" /> : <span className="font-medium">{category.category}</span>}</td>
            <td className="px-4 py-4">{editing === category.category ? <input defaultValue={category.description || ""} aria-label="Category description" maxLength={2000} className="w-full min-w-48 rounded-lg border border-slate-200 px-3 py-2" /> : <span className="text-slate-600">{category.description || "—"}</span>}</td>
            <td className="px-4 py-4 text-slate-600">{formatNumber(category.course_count)}</td>
            <td className="px-4 py-4"><div className="flex gap-2">
              {editing === category.category ? <button disabled={Boolean(busy)} onClick={(event) => { const inputs = event.currentTarget.closest("tr").querySelectorAll("input"); onRename(category.category, inputs[0].value, inputs[1].value); }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Save</button> : <button onClick={() => setEditing(category.category)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">Edit</button>}
              <button disabled={Boolean(busy) || Number(category.course_count) > 0} title={Number(category.course_count) ? "Reassign courses before deleting this category" : "Delete category"} onClick={() => { if (window.confirm(`Delete the unused category “${category.category}”?`)) onDelete(category.category); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-40">Delete</button>
            </div></td>
          </tr>)}
        </tbody></TableFrame>
      ) : <EmptyPanel label="No categories found." />}
    </>
  );
}

function AnnouncementPanel({ rows, loading, draft, setDraft, editing, setEditing, busy, onSubmit, onToggle }) {
  const [formOpen, setFormOpen] = useState(false);
  function edit(item) {
    setEditing(item.id);
    setDraft({ title: item.title, message: item.message, audience: item.audience, status: item.status });
    setFormOpen(true);
  }
  return (
    <>
      <div className="mb-5 flex justify-end"><button type="button" onClick={() => { setEditing(null); setDraft({ title: "", message: "", audience: "all", status: "draft" }); setFormOpen((value) => !value); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Create announcement</button></div>
      {formOpen ? <form onSubmit={async (event) => { event.preventDefault(); if (await onSubmit()) setFormOpen(false); }} className="mb-5 grid gap-3 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium">Title<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Message<textarea required maxLength={10000} rows={4} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Audience<select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="all">All users</option><option value="student">Students</option><option value="instructor">Instructors</option></select></label>
          <label className="text-sm font-medium">Initial status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="draft">Draft</option><option value="published">Publish immediately</option></select></label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancel</button><button disabled={Boolean(busy)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{editing ? "Save changes" : "Save announcement"}</button></div>
      </form> : null}
      {loading ? <LoadingBlock /> : rows.length ? <div className="space-y-3">{rows.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3><StatusPill value={item.status} /><span className="text-xs capitalize text-slate-500">Audience: {item.audience}</span></div><p className="mt-2 whitespace-pre-line text-sm text-slate-600">{item.message}</p><p className="mt-3 text-xs text-slate-400">Created {dateText(item.created_at)}{item.published_at ? ` · Published ${dateText(item.published_at)}` : ""}</p></div>
        <div className="flex shrink-0 gap-2"><button onClick={() => edit(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium">Edit</button><button disabled={Boolean(busy)} onClick={() => onToggle(item)} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 disabled:opacity-50">{item.status === "published" ? "Unpublish" : "Publish"}</button></div></div>
      </article>)}</div> : <EmptyPanel label="No announcements yet." />}
    </>
  );
}

function AnalyticsPanel({ loading, summary, rows, months, setMonths }) {
  if (loading && !summary) return <LoadingBlock />;
  if (!summary) return <EmptyPanel label="No analytics data is available." />;
  const trends = summary.trends || [];
  const maxEnrollment = Math.max(1, ...trends.map((item) => Number(item.enrollments)));
  const maxGrowth = Math.max(1, ...trends.flatMap((item) => [Number(item.students), Number(item.instructors)]));
  const completion = Number(summary.course_completion_rate || 0);
  const distributions = summary.distributions || [];
  const courseStatuses = distributions.filter((item) => item.metric === "courses");
  const instructorStatuses = distributions.filter((item) => item.metric === "instructors");
  const instructorAccounts = distributions.filter((item) => item.metric === "instructor_accounts");
  const eligibleEnrollments = Number(summary.eligible_enrollments || 0);
  const incompleteEnrollments = Math.max(0, eligibleEnrollments - Number(summary.completed_enrollments || 0));
  return (
    <div className="space-y-5">
      <div className="mb-2 flex justify-end"><label className="text-xs font-medium text-slate-500">Time range
        <select value={months} onChange={(event) => setMonths(Number(event.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option><option value={24}>24 months</option></select>
      </label></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Students" value={formatNumber(summary.total_students)} note="Approved student accounts" icon={Users} />
        <Metric title="Instructors" value={formatNumber(summary.total_instructors)} note={`${formatNumber(summary.pending_instructors)} pending approval`} icon={ShieldCheck} />
        <Metric title="Courses" value={formatNumber(summary.total_courses)} note={`${formatNumber(summary.published_courses)} published`} icon={BookOpen} />
        <Metric title="Enrollments" value={formatNumber(summary.total_enrollments)} note={`${formatNumber(summary.unique_enrolled_students)} unique enrolled learners`} icon={Activity} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Enrollment trends" description="Number of enrollment records created by month.">
          {trends.length ? <div className="flex h-52 items-end gap-2 border-b border-slate-100 pb-1">{trends.map((item) => <div key={item.month} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center">
            <span className="mb-1 text-[10px] font-medium text-slate-500">{formatNumber(item.enrollments)}</span><div title={`${item.month}: ${item.enrollments} enrollments`} style={{ height: `${Number(item.enrollments) > 0 ? Math.max(2, 100 * Number(item.enrollments) / maxEnrollment) : 0}%` }} className="rounded-t-md bg-indigo-500 transition-all group-hover:bg-indigo-700" /><span className="mt-2 truncate text-[9px] text-slate-400">{item.month}</span>
          </div>)}</div> : <EmptyPanel label="No enrollment activity during this range." />}
        </ChartCard>
        <ChartCard title="Student and instructor registrations" description="Accounts created by role and month.">
          {trends.length ? <div className="flex h-52 items-end gap-2 border-b border-slate-100 pb-1">{trends.map((item) => <div key={item.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <div className="flex w-full flex-1 items-end justify-center gap-1"><div title={`${item.month}: ${item.students} students`} style={{ height: `${Number(item.students) > 0 ? Math.max(3, 100 * Number(item.students) / maxGrowth) : 0}%` }} className="w-2/5 rounded-t bg-indigo-500" /><div title={`${item.month}: ${item.instructors} instructors`} style={{ height: `${Number(item.instructors) > 0 ? Math.max(3, 100 * Number(item.instructors) / maxGrowth) : 0}%` }} className="w-2/5 rounded-t bg-emerald-500" /></div><span className="mt-2 truncate text-[9px] text-slate-400">{item.month}</span>
          </div>)}</div> : <EmptyPanel label="No registration data during this range." />}
          <div className="mt-3 flex gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded bg-indigo-500" />Students</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded bg-emerald-500" />Instructors</span></div>
        </ChartCard>
        <ChartCard title="Course completion" description="Completed enrollment records divided by active and completed records; cancelled enrollments are excluded.">
          <div className="flex items-center gap-5"><div className="grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#4f46e5 ${Math.min(100, completion)}%, #e2e8f0 0)` }} aria-label={`Completion rate ${completion}%`}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span className="text-xl font-bold">{completion.toFixed(1)}%</span></div></div><div><p className="text-sm font-medium">{formatNumber(summary.completed_enrollments)} completed</p><p className="mt-1 text-sm text-slate-500">out of {formatNumber(summary.eligible_enrollments)} active and completed enrollment records</p><p className="mt-3 text-xs text-slate-400">Not a unique-student completion rate.</p></div></div>
          <div className="mt-5"><div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${summary.completed_enrollments} completed and ${incompleteEnrollments} incomplete enrollment records`}><span className="bg-emerald-500" style={{ width: `${completion}%` }} /><span className="bg-amber-300" style={{ width: `${Math.max(0, 100 - completion)}%` }} /></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Completed: {formatNumber(summary.completed_enrollments)}</span><span>Incomplete: {formatNumber(incompleteEnrollments)}</span></div></div>
        </ChartCard>
        <ChartCard title="Course publication status" description="Current status counts from PostgreSQL.">
          <StatusDistribution items={courseStatuses} empty="No courses are recorded." />
        </ChartCard>
        <ChartCard title="Instructor approval status" description="Current status counts for instructor accounts.">
          <StatusDistribution items={instructorStatuses} empty="No instructor accounts are recorded." />
        </ChartCard>
        <ChartCard title="Instructor account access" description="Active versus suspended instructor accounts.">
          <StatusDistribution items={instructorAccounts} empty="No instructor accounts are recorded." />
        </ChartCard>
        <ChartCard title="Popular courses" description="Top 10 courses ranked by enrollment record count.">
          <ol className="space-y-3">{(summary.popular_courses || rows).length ? (summary.popular_courses || rows).map((course, index) => <li key={course.id} className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{course.title}</span><span className="text-xs text-slate-500">{formatNumber(course.enrollment_count)} enrollments</span></li>) : <li className="text-sm text-slate-500">No courses to report.</li>}</ol>
        </ChartCard>
      </div>
      <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-900"><strong>Interpretation:</strong> enrollment trend counts enrollment records, not unique learners. Current database tables do not preserve historical status changes, so status charts report current state only.</div>
    </div>
  );
}

function ChartCard({ title, description, children }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p><div className="mt-5">{children}</div></section>;
}

function StatusDistribution({ items, empty }) {
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (!total) return <p className="text-sm text-slate-500">{empty}</p>;
  return <div className="space-y-3">{items.map((item) => {
    const percentage = (100 * Number(item.count || 0)) / total;
    return <div key={item.label}>
      <div className="mb-1 flex justify-between text-xs"><span className="capitalize text-slate-600">{item.label}</span><span className="font-medium text-slate-800">{formatNumber(item.count)} · {percentage.toFixed(1)}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.label === "approved" || item.label === "published" ? "bg-emerald-500" : item.label === "pending" || item.label === "draft" ? "bg-amber-400" : "bg-slate-400"}`} style={{ width: `${percentage}%` }} /></div>
    </div>;
  })}</div>;
}

function HealthPanel({ loading, health }) {
  if (loading && !health) return <LoadingBlock />;
  const checks = health?.checks || {};
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${health?.status === "healthy" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${health?.status === "healthy" ? "bg-emerald-500" : "bg-amber-500"}`} /><div><h2 className="font-semibold capitalize">{health?.status || "Unavailable"}</h2><p className="text-sm text-slate-600">{health?.message || "The health check did not complete successfully."}</p></div></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {["api", "database"].map((key) => <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-semibold capitalize">{key === "api" ? "Backend API" : "PostgreSQL"}</h3><StatusPill value={checks[key]?.status || (health?.status === "degraded" && key === "database" ? "unavailable" : "unknown")} /></div><p className="mt-3 text-sm text-slate-500">{key === "api" ? checks.api?.uptime_seconds !== undefined ? `Version ${checks.api.version || "unknown"} · uptime: ${formatNumber(checks.api.uptime_seconds)} seconds` : "Process status could not be confirmed." : checks.database?.response_time_ms !== undefined ? `Query response: ${checks.database.response_time_ms} ms · ${formatNumber(checks.database.connections)} connections` : "Database connectivity could not be confirmed."}</p></article>)}
      </div>
      <p className="text-xs text-slate-400">Last database check: {checks.database?.checked_at ? new Date(checks.database.checked_at).toLocaleString() : "not available"}. Database host, credentials, connection strings, and secret values are intentionally excluded.</p>
    </div>
  );
}

function AuditLogs({ rows, loading, page, pagination, onPage, search, setSearch, auditDate, setAuditDate }) {
  return <>
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter loaded audit entries…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" /></label>
      <label className="relative"><Clock3 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} aria-label="Filter audit events by date" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" /></label>
    </div>
    {loading ? <LoadingBlock /> : rows.length ? <TableFrame><thead><tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">{["Time", "Actor", "Action", "Resource", "Status"].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((log) => <tr key={log.id}><td className="px-4 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td><td className="px-4 py-3"><p className="font-medium">{log.actor_name || "Deleted account"}</p><p className="text-xs text-slate-500">{log.actor_email || ""}</p></td><td className="max-w-sm px-4 py-3 text-slate-700">{log.action}</td><td className="px-4 py-3 text-slate-600">{log.resource}{log.resource_id ? ` · ${log.resource_id}` : ""}</td><td className="px-4 py-3"><StatusPill value={log.response_status >= 200 && log.response_status < 400 ? "approved" : "rejected"} /></td></tr>)}</tbody></TableFrame> : <EmptyPanel label="No matching audit events." />}
    <Pagination page={page} pagination={pagination} onChange={onPage} />
    <p className="mt-3 text-xs text-slate-400">Audit history is server-filtered and paginated. Entries are never editable from this page.</p>
  </>;
}

function SettingsPanel({ settings, busy, onSave }) {
  const fields = [
    ["platform_name", "Platform name", "text"],
    ["support_email", "Support email", "email"],
    ["platform_language", "Platform language", "select"],
    ["platform_timezone", "Platform timezone (IANA)", "text"],
    ["public_registration_enabled", "Allow public registration", "checkbox"],
  ];
  const value = (key) => settings[key]?.value ?? defaults[key];
  return <div className="max-w-3xl space-y-3">{fields.map(([key, label, type]) => <div key={key} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
    <div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">Saved setting: {String(value(key) ?? "not configured")}</p></div>
    <div className="flex min-w-0 items-center gap-2">
      {type === "checkbox" ? <input type="checkbox" checked={Boolean(value(key))} onChange={(event) => onSave(key, event.target.checked)} className="h-4 w-4 accent-indigo-600" aria-label={label} /> : type === "select" ? <select defaultValue={value(key)} onChange={(event) => onSave(key, event.target.value)} className="max-w-48 rounded-lg border border-slate-200 px-2 py-2 text-sm"><option value="en">English</option><option value="am">Amharic</option><option value="es">Spanish</option><option value="fr">French</option></select> : <><input key={`${key}-${value(key)}`} type={type} defaultValue={value(key) || ""} aria-label={label} className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button disabled={Boolean(busy)} onClick={(event) => onSave(key, event.currentTarget.parentElement.querySelector("input").value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50">Save</button></>}
    </div>
  </div>)}<p className="rounded-xl bg-sky-50 px-4 py-3 text-xs text-sky-900">Only allow-listed configuration values can be changed here. Environment secrets and database credentials are never displayed.</p></div>;
}

const defaults = {
  platform_name: "LearnSphere LMS",
  support_email: "",
  public_registration_enabled: true,
  platform_language: "en",
  platform_timezone: "UTC",
};
