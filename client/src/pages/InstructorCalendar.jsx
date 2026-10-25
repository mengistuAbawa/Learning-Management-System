import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, FileQuestion, Video, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../services/api";

function asDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventIcon(type) {
  if (type === "live_class") return Video;
  if (type === "assignment_due") return ClipboardList;
  return FileQuestion;
}

function eventLabel(type) {
  return {
    live_class: "Live classroom",
    quiz_opening: "Quiz opens",
    quiz_closing: "Quiz closes",
    assignment_due: "Assignment due",
  }[type] || "Course event";
}

function eventPath(event) {
  if (event.event_type === "live_class") {
    return `/live-classes/${event.event_id}/room`;
  }
  if (event.event_type.startsWith("quiz_")) {
    return `/courses/${event.course_id}/quizzes/manage`;
  }
  return `/courses/${event.course_id}/assignments`;
}

function formatEventDate(event) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(event.time_zone ? { timeZone: event.time_zone } : {}),
  }).format(new Date(event.event_at));
}

export default function InstructorCalendar() {
  const initialFrom = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const [from, setFrom] = useState(asDateInput(initialFrom));
  const [to, setTo] = useState(() => {
    const date = new Date(initialFrom);
    date.setDate(date.getDate() + 60);
    return asDateInput(date);
  });
  const [events, setEvents] = useState([]);
  const [view, setView] = useState("agenda");
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/analytics/calendar", {
        params: {
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
        },
      });
      setEvents(response.data.events || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "The teaching calendar could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const request = window.setTimeout(() => loadEvents(), 0);
    return () => window.clearTimeout(request);
  }, [loadEvents]);

  const visibleEvents = useMemo(() => {
    if (!selectedDate) return events;
    return events.filter(
      (event) => new Date(event.event_at).toLocaleDateString("en-CA") === selectedDate
    );
  }, [events, selectedDate]);

  const monthDays = useMemo(() => {
    const monthStart = new Date(`${from}T00:00:00`);
    const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return {
        date: asDateInput(day),
        day: day.getDate(),
        inMonth: day.getMonth() === monthStart.getMonth(),
        events: events.filter(
          (event) => new Date(event.event_at).toLocaleDateString("en-CA") === asDateInput(day)
        ),
      };
    });
  }, [events, from]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/instructor-dashboard" className="text-sm font-medium text-indigo-700 hover:underline">
          ← Instructor dashboard
        </Link>
        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <CalendarDays className="h-4 w-4" /> Teaching
            </p>
            <h1 className="mt-2 text-3xl font-bold">Schedule &amp; calendar</h1>
            <p className="mt-2 text-slate-600">
              Live sessions, quiz availability, and assignment deadlines from your courses.
            </p>
          </div>
          <Link
            to="/live-classes"
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Schedule a live class
          </Link>
        </header>

        <section className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-medium">
            From
            <input
              aria-label="Calendar start date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            Through
            <input
              aria-label="Calendar end date"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="ml-auto flex gap-2" role="group" aria-label="Calendar view">
            <button
              type="button"
              onClick={() => { setView("agenda"); setSelectedDate(""); }}
              aria-pressed={view === "agenda"}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "agenda" ? "bg-indigo-100 text-indigo-800" : "border border-slate-300 text-slate-700"}`}
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => { setView("calendar"); setSelectedDate(""); }}
              aria-pressed={view === "calendar"}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "calendar" ? "bg-indigo-100 text-indigo-800" : "border border-slate-300 text-slate-700"}`}
            >
              Calendar
            </button>
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button type="button" onClick={loadEvents} className="ml-3 font-semibold underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="mt-6 animate-pulse rounded-xl border border-slate-200 bg-white p-8 text-slate-500">
            Loading calendar events…
          </div>
        ) : view === "calendar" ? (
          <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="p-3">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthDays.map((day) => (
                <button
                  type="button"
                  key={day.date}
                  onClick={() => { setSelectedDate(day.date); setView("agenda"); }}
                  className={`min-h-24 border-b border-r border-slate-100 p-2 text-left hover:bg-indigo-50 ${day.inMonth ? "" : "bg-slate-50 text-slate-400"}`}
                  aria-label={`${day.date}, ${day.events.length} events`}
                >
                  <span className="text-sm font-semibold">{day.day}</span>
                  {day.events.slice(0, 2).map((event) => (
                    <span key={`${event.event_type}-${event.event_id}-${event.event_at}`} className="mt-1 block truncate rounded bg-indigo-100 px-1.5 py-1 text-[10px] text-indigo-800">
                      {event.title}
                    </span>
                  ))}
                  {day.events.length > 2 && (
                    <span className="text-[10px] text-slate-500">+{day.events.length - 2} more</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 space-y-3">
            {selectedDate && (
              <button type="button" onClick={() => setSelectedDate("")} className="text-sm font-semibold text-indigo-700 hover:underline">
                Clear date filter
              </button>
            )}
            {visibleEvents.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
                No scheduled classes, quiz windows, or assignment deadlines in this date range.
              </div>
            ) : visibleEvents.map((event) => {
              const Icon = eventIcon(event.event_type);
              return (
                <article key={`${event.event_type}-${event.event_id}-${event.event_at}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="rounded-lg bg-indigo-50 p-3 text-indigo-700"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{eventLabel(event.event_type)}</p>
                    <h2 className="mt-1 truncate font-semibold">{event.title}</h2>
                    <p className="text-sm text-slate-600">{event.course_title} · {formatEventDate(event)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{event.status}</span>
                  <Link to={eventPath(event)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Open
                  </Link>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
