import { useCallback, useEffect, useState } from "react";
import { Bell, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getUnreadNotificationCount } from "../services/notificationService";

export default function NotificationBell({ light = false }) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCount = useCallback(async () => {
    try {
      const response = await getUnreadNotificationCount();
      setCount(response.unread_count);
      setError("");
    } catch {
      setError("Could not load unread notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) void loadCount();
    };

    Promise.resolve().then(refresh);
    window.addEventListener("notifications:changed", refresh);

    return () => {
      active = false;
      window.removeEventListener("notifications:changed", refresh);
    };
  }, [loadCount]);

  return (
    <Link
      to="/notifications"
      aria-label={
        error
          ? "Notifications (count unavailable)"
          : loading
            ? "Notifications (loading unread count)"
          : `Notifications${count ? `, ${count} unread` : ""}`
      }
      title={error || "Notifications"}
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
        light
          ? "border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          : "border-white/10 text-slate-300 hover:border-indigo-400/30 hover:bg-indigo-400/10 hover:text-white"
      }`}
    >
      {loading ? (
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <Bell className="h-5 w-5" aria-hidden="true" />
      )}
      {count > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
      {error && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-400"
        />
      )}
      <span className="sr-only" role={error ? "status" : undefined}>
        {error}
      </span>
    </Link>
  );
}
