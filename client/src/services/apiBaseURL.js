export function normalizeApiBaseURL(configuredURL, isDevelopment) {
  const apiURL = configuredURL?.trim();

  if (apiURL) {
    const baseURL = apiURL.replace(/\/+$/, "").replace(/\/api$/i, "");
    return `${baseURL}/api`;
  }

  return isDevelopment ? "http://localhost:5000/api" : "";
}
