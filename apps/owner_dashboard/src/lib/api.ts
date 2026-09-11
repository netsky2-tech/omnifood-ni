const API_BASE = "/api";

const STORAGE_KEY_ACCESS = "oc_access_token";
const STORAGE_KEY_REFRESH = "oc_refresh_token";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let accessToken: string | null = sessionStorage.getItem(STORAGE_KEY_ACCESS);
let refreshToken: string | null = sessionStorage.getItem(STORAGE_KEY_REFRESH);
let refreshPromise: Promise<string> | null = null;

export function setTokens(tokens: TokenPair): void {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  sessionStorage.setItem(STORAGE_KEY_ACCESS, tokens.accessToken);
  sessionStorage.setItem(STORAGE_KEY_REFRESH, tokens.refreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  sessionStorage.removeItem(STORAGE_KEY_ACCESS);
  sessionStorage.removeItem(STORAGE_KEY_REFRESH);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasStoredRefreshToken(): boolean {
  return refreshToken !== null;
}

export async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) throw new Error("No refresh token");

  const response = await fetch(`${API_BASE}/identity/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    throw new Error("Refresh failed");
  }

  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  setTokens(data);
  return data.accessToken;
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
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestInit = {},
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const token = await getValidAccessToken();

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
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      (errorBody as { message?: string })?.message ?? `API error: ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
