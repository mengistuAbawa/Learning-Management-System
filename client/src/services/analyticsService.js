
import api from "./api";

export async function getAnalyticsOverview() {
  const response = await api.get("/analytics/overview");
  return response.data.analytics;
}
