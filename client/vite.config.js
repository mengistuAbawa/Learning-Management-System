
import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiURL = env.VITE_API_URL;

  if (process.env.VERCEL && mode === "production") {
    if (!apiURL) {
      throw new Error(
        "VITE_API_URL is required for Vercel deployments. Set it to https://<your-render-service>.onrender.com/api and redeploy.",
      );
    }

    let parsedApiURL;
    try {
      parsedApiURL = new URL(apiURL);
    } catch {
      throw new Error(
        "VITE_API_URL must be an absolute HTTPS URL ending in /api.",
      );
    }

    if (
      parsedApiURL.protocol !== "https:" ||
      !["", "/api"].includes(parsedApiURL.pathname.replace(/\/+$/, "")) ||
      /localhost|127\.0\.0\.1/i.test(parsedApiURL.hostname)
    ) {
      throw new Error(
        "VITE_API_URL must be your public HTTPS Render API origin, optionally followed by /api, not localhost.",
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: false,
    },
  };
});
