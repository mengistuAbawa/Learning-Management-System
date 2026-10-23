import api from "./api";

function notifyChanged() {
  window.dispatchEvent(new Event("notifications:changed"));
}

export async function getNotifications({ limit = 20, offset = 0 } = {}) {
  const response = await api.get("/notifications", {
    params: { limit, offset },
  });
  return response.data;
}

export async function getUnreadNotificationCount() {
  const response = await api.get("/notifications/unread-count");
  return response.data;
}

export async function markNotificationRead(notificationId) {
  const response = await api.patch(`/notifications/${notificationId}/read`);
  notifyChanged();
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await api.patch("/notifications/read-all");
  notifyChanged();
  return response.data;
}

export async function deleteNotification(notificationId) {
  const response = await api.delete(`/notifications/${notificationId}`);
  notifyChanged();
  return response.data;
}
