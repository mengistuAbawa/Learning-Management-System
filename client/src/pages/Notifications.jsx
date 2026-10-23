import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";

const PAGE_SIZE = 20;

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

function safeInternalPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPage = useCallback(async (pageOffset, isCurrent = () => true) => {
    try {
      const response = await getNotifications({
        limit: PAGE_SIZE,
        offset: pageOffset,
      });
      if (!isCurrent()) return;

      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
      setHasMore(response.pagination.has_more);
      setError("");
    } catch (loadError) {
      if (isCurrent()) setError(getErrorMessage(loadError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadPage(offset, () => active);
    });

    return () => {
      active = false;
    };
  }, [loadPage, offset]);

  async function handleMarkRead(notificationId) {
    setBusyId(notificationId);
    setError("");
    setSuccess("");
    try {
      await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) =>
          String(item.id) === String(notificationId)
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      setSuccess("Notification marked as read.");
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAllRead() {
    setBusyAction(true);
    setError("");
    setSuccess("");
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || readAt }))
      );
      setUnreadCount(0);
      setSuccess("All notifications marked as read.");
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyAction(false);
    }
  }

  async function handleDelete(notificationId) {
    if (!window.confirm("Delete this notification? This cannot be undone.")) {
      return;
    }

    setBusyId(notificationId);
    setError("");
    setSuccess("");
    try {
      const deleted = notifications.find(
        (item) => String(item.id) === String(notificationId)
      );
      await deleteNotification(notificationId);
      const remaining = notifications.filter(
        (item) => String(item.id) !== String(notificationId)
      );
      setNotifications(remaining);
      if (deleted && !deleted.is_read) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      setSuccess("Notification deleted.");
      if (remaining.length === 0 && offset > 0) {
        setOffset((current) => Math.max(0, current - PAGE_SIZE));
      }
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  function changePage(nextOffset) {
    setLoading(true);
    setOffset(nextOffset);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              to="/dashboard"
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to dashboard
            </Link>
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <Bell className="h-7 w-7 text-indigo-300" />
              Notifications
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction || unreadCount === 0 || loading}
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all as read
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadPage(offset);
              }}
              className="font-semibold underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        )}
        {success && (
          <p
            role="status"
            className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"
          >
            {success}
          </p>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-300">
            <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/60 px-6 py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-slate-500" />
            <h2 className="mt-4 text-xl font-semibold">You’re all caught up</h2>
            <p className="mt-2 text-sm text-slate-400">
              New course and assessment updates will appear here.
            </p>
          </div>
        ) : (
          <section aria-label="Your notifications" className="space-y-3">
            {notifications.map((notification) => {
              const internalPath = safeInternalPath(notification.link_url);
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    notification.is_read
                      ? "border-white/10 bg-slate-900/60"
                      : "border-indigo-400/30 bg-indigo-500/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        notification.is_read ? "bg-slate-600" : "bg-indigo-300"
                      }`}
                      aria-label={notification.is_read ? "Read" : "Unread"}
                      title={notification.is_read ? "Read" : "Unread"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="font-semibold text-white">
                            {notification.title}
                          </h2>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                            {notification.message}
                          </p>
                        </div>
                        <time
                          dateTime={notification.created_at}
                          className="text-xs text-slate-400"
                        >
                          {formatDate(notification.created_at)}
                        </time>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs capitalize text-slate-300">
                          {String(notification.type || "general").replaceAll("_", " ")}
                        </span>
                        {internalPath && (
                          <Link
                            to={internalPath}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/10"
                          >
                            View details
                          </Link>
                        )}
                        {!notification.is_read && (
                          <button
                            type="button"
                            disabled={busyId === notification.id}
                            onClick={() => handleMarkRead(notification.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                          >
                            {busyId === notification.id ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Mark as read
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === notification.id}
                          onClick={() => handleDelete(notification.id)}
                          aria-label={`Delete notification: ${notification.title}`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {(offset > 0 || hasMore) && !loading && (
          <nav
            aria-label="Notification pages"
            className="flex items-center justify-between border-t border-white/10 pt-4"
          >
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Newer
            </button>
            <span className="text-xs text-slate-500">
              {Math.floor(offset / PAGE_SIZE) + 1}
            </span>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => changePage(offset + PAGE_SIZE)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-40"
            >
              Older
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
