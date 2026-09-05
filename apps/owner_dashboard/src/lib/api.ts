const API_BASE = "/api";

const STORAGE_KEY_ACCESS = "oc_access_token";
const STORAGE_KEY_REFRESH = "oc_refresh_token";
const STORAGE_KEY_USER_ID = "oc_user_id";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  userId?: string;
}

let accessToken: string | null = sessionStorage.getItem(STORAGE_KEY_ACCESS);
let refreshToken: string | null = sessionStorage.getItem(STORAGE_KEY_REFRESH);
let userId: string | null = sessionStorage.getItem(STORAGE_KEY_USER_ID);
let refreshPromise: Promise<string> | null = null;

export function setTokens(tokens: TokenPair): void {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  if (tokens.userId) {
    userId = tokens.userId;
    sessionStorage.setItem(STORAGE_KEY_USER_ID, tokens.userId);
  }
  sessionStorage.setItem(STORAGE_KEY_ACCESS, tokens.accessToken);
  sessionStorage.setItem(STORAGE_KEY_REFRESH, tokens.refreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  userId = null;
  sessionStorage.removeItem(STORAGE_KEY_ACCESS);
  sessionStorage.removeItem(STORAGE_KEY_REFRESH);
  sessionStorage.removeItem(STORAGE_KEY_USER_ID);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasStoredRefreshToken(): boolean {
  return refreshToken !== null;
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) throw new Error("No refresh token");
  if (!userId) throw new Error("No userId for refresh");

  const response = await fetch(`${API_BASE}/identity/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    throw new Error("Refresh failed");
  }

  const raw = (await response.json()) as { access_token: string; refresh_token: string };
  setTokens({ accessToken: raw.access_token, refreshToken: raw.refresh_token });
  return raw.access_token;
}

async function getValidAccessToken(): Promise<string> {
  if (accessToken) return accessToken;
  if (refreshToken) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }
  throw new Error("Not authenticated");
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestInit = {},
): Promise<T> {
  const { body, headers: customHeaders, auth = true, ...rest } = options;

  const token = auth ? await getValidAccessToken() : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(customHeaders as Record<string, string>),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      const retryHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
        ...(customHeaders as Record<string, string>),
      };

      const retryResponse = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: retryHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!retryResponse.ok) {
        throw new Error(`API error: ${retryResponse.status}`);
      }

      return retryResponse.json() as Promise<T>;
    } catch {
      clearTokens();
      throw new Error("Session expired");
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const message =
      (typeof errorBody?.message === "string" && errorBody.message) ||
      `API error: ${response.status}`;
    const err = new Error(message);
    (err as any).status = response.status;
    (err as any).statusCode = response.status;
    (err as any).code = errorBody?.code;
    (err as any).responseBody = errorBody;
    throw err;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: { auth?: boolean }) =>
    apiFetch<T>(path, { method: "GET", ...opts }),
  post: <T>(path: string, body: unknown, opts?: { auth?: boolean }) =>
    apiFetch<T>(path, { method: "POST", body, ...opts }),
  put: <T>(path: string, body: unknown, opts?: { auth?: boolean }) =>
    apiFetch<T>(path, { method: "PUT", body, ...opts }),
  patch: <T>(path: string, body: unknown, opts?: { auth?: boolean }) =>
    apiFetch<T>(path, { method: "PATCH", body, ...opts }),
  delete: <T>(path: string, opts?: { auth?: boolean }) =>
    apiFetch<T>(path, { method: "DELETE", ...opts }),
};

export function isAuthenticated(): boolean {
  return accessToken !== null;
}
