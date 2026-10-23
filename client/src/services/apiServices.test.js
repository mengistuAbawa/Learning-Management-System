import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "./api";
import { getAnalyticsOverview } from "./analyticsService";
import {
  deleteNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notificationService";
import { getCourses } from "./courseService";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("client API service contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retrieves analytics from the authenticated overview endpoint", async () => {
    const analytics = { role: "student", summary: { enrolledCourses: 2 } };
    api.get.mockResolvedValue({ data: { success: true, analytics } });

    await expect(getAnalyticsOverview()).resolves.toEqual(analytics);
    expect(api.get).toHaveBeenCalledWith("/analytics/overview");
  });

  it("requests course catalog data with the supplied filters", async () => {
    const result = { courses: [{ id: 17, title: "Learning" }] };
    const params = { search: "learning", page: 2 };
    api.get.mockResolvedValue({ data: result });

    await expect(getCourses(params)).resolves.toEqual(result);
    expect(api.get).toHaveBeenCalledWith("/courses", { params });
  });

  it("uses the notification endpoints and emits refresh events after mutations", async () => {
    const notifications = { notifications: [], unread_count: 0 };
    api.get
      .mockResolvedValueOnce({ data: notifications })
      .mockResolvedValueOnce({ data: { unread_count: 0 } });
    api.patch.mockResolvedValue({ data: { success: true } });
    api.delete.mockResolvedValue({ data: { success: true } });

    await expect(getNotifications()).resolves.toEqual(notifications);
    await getUnreadNotificationCount();
    await markNotificationRead(41);
    await markAllNotificationsRead();
    await deleteNotification(41);

    expect(api.get).toHaveBeenNthCalledWith(1, "/notifications", {
      params: { limit: 20, offset: 0 },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/notifications/unread-count");
    expect(api.patch).toHaveBeenNthCalledWith(1, "/notifications/41/read");
    expect(api.patch).toHaveBeenNthCalledWith(2, "/notifications/read-all");
    expect(api.delete).toHaveBeenCalledWith("/notifications/41");
    expect(window.dispatchEvent).toHaveBeenCalledTimes(3);
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "notifications:changed" })
    );
  });

  it("does not emit a refresh event when a notification mutation fails", async () => {
    api.patch.mockRejectedValue(new Error("request failed"));

    await expect(markNotificationRead(41)).rejects.toThrow("request failed");
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
});
