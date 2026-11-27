const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";
let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as {
    data?: T;
    error?: { message?: string; details?: unknown };
  };
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? "Request failed", response.status, payload.error?.details);
  }
  return payload.data as T;
}

export function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    });
    const payload = await parseResponse<{ accessToken: string }>(response);
    setAccessToken(payload.accessToken);
    return payload.accessToken;
  })();
  return refreshInFlight.finally(() => { refreshInFlight = null; });
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry && accessToken && path !== "/auth/refresh") {
    try {
      await refreshAccessToken();
      return apiRequest<T>(path, init, false);
    } catch {
      setAccessToken(null);
    }
  }
  return parseResponse<T>(response);
}

export async function requestStepUpToken(): Promise<string | null> {
  const password = window.prompt("Confirm your account password to perform this sensitive action.");
  if (password === null || !password) return null;
  const otp = window.prompt("Enter your authenticator or recovery code if MFA is enabled. Leave blank if MFA is disabled.") ?? "";
  const result = await apiRequest<{ token: string }>("/auth/step-up", {
    method: "POST",
    body: JSON.stringify({ password, ...(otp.trim() ? { otp: otp.trim() } : {}) }),
  });
  return result.token;
}
