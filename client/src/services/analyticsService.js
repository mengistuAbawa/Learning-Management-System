
import api from "./api";

export async function getAnalyticsOverview() {
  const response = await api.get("/analytics/overview");
  return response.data.analytics;
}

export async function getAdminAnalyticsOverview() {
  const response = await api.get("/analytics/admin/overview");
  return response.data.analytics;
}

export async function getInstructorStudentPerformance(params) {
  const response = await api.get("/analytics/students", { params });
  return response.data;
}
