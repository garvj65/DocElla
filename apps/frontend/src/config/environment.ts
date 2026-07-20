export interface FrontendEnvironment {
  readonly apiBaseUrl: string;
}

export const parseFrontendEnvironment = (source: ImportMetaEnv): FrontendEnvironment => {
  const rawBaseUrlValue: unknown = source.VITE_API_BASE_URL;
  const rawBaseUrl = typeof rawBaseUrlValue === "string" ? rawBaseUrlValue : "";
  const apiBaseUrl = rawBaseUrl.trim().replace(/\/+$/u, "");

  if (apiBaseUrl.length === 0) {
    return { apiBaseUrl: "" };
  }

  let parsed: URL;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    throw new Error("VITE_API_BASE_URL must be empty or a valid HTTP(S) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("VITE_API_BASE_URL must use http: or https:.");
  }

  return { apiBaseUrl };
};
