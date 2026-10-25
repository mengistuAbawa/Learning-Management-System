import { describe, expect, it } from "vitest";
import { normalizeApiBaseURL } from "./apiBaseURL";

describe("normalizeApiBaseURL", () => {
  it("adds the API path when configured with the Render service origin", () => {
    expect(
      normalizeApiBaseURL("https://learning-management-system-r82m.onrender.com", false),
    ).toBe("https://learning-management-system-r82m.onrender.com/api");
  });

  it("does not duplicate an existing API path", () => {
    expect(
      normalizeApiBaseURL("https://api.example.com/api/", false),
    ).toBe("https://api.example.com/api");
  });

  it("uses localhost only for development when no API URL is configured", () => {
    expect(normalizeApiBaseURL(undefined, true)).toBe(
      "http://localhost:5000/api",
    );
    expect(normalizeApiBaseURL(undefined, false)).toBe("");
  });
});
