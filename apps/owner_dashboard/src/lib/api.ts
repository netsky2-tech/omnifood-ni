import { getApiBaseUrl } from "./api-base-url";

const STORAGE_KEY_ACCESS = "oc_access_token";
const STORAGE_KEY_REFRESH = "oc_refresh_token";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorInit {
  status: number;
  code?: unknown;
  responseBody?: Record<string, unknown> | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code?: unknown;
  readonly responseBody: Record<string, unknown> | null;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.statusCode = init.status;
    this.code = init.code;
    this.responseBody = init.responseBody ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseSubjectFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const parsed = JSON.parse(jsonPayload) as { sub?: string };
    return typeof parsed?.sub === "string" && parsed.sub.trim().length > 0 ? parsed.sub : null;
  } catch {
    return null;
  }
}

let accessToken: string | null = sessionStorage.getItem(STORAGE_KEY_ACCESS);
let refreshToken: string | null = sessionStorage.getItem(STORAGE_KEY_REFRESH);
let refreshPromise: Promise<string> | null = null;

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

export function notifyAuthExpired(): void {
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function setTokens(tokens: TokenPair): void {
  if (
    !tokens ||
    !isNonBlankString(tokens.accessToken) ||
    !isNonBlankString(tokens.refreshToken)
  ) {
    clearTokens();
    return;
  }
  const cleanAccess = tokens.accessToken.trim();
  const cleanRefresh = tokens.refreshToken.trim();
  accessToken = cleanAccess;
  refreshToken = cleanRefresh;
  sessionStorage.setItem(STORAGE_KEY_ACCESS, cleanAccess);
  sessionStorage.setItem(STORAGE_KEY_REFRESH, cleanRefresh);
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  sessionStorage.removeItem(STORAGE_KEY_ACCESS);
  sessionStorage.removeItem(STORAGE_KEY_REFRESH);
}

export function getAccessToken(): string | null {
  if (isNonBlankString(accessToken)) {
    return accessToken;
  }
  const storedAccess = sessionStorage.getItem(STORAGE_KEY_ACCESS);
  if (isNonBlankString(storedAccess)) {
    accessToken = storedAccess.trim();
    return accessToken;
  }
  return null;
}

export function hasStoredRefreshToken(): boolean {
  if (isNonBlankString(refreshToken)) {
    return true;
  }
  const storedRefresh = sessionStorage.getItem(STORAGE_KEY_REFRESH);
  if (isNonBlankString(storedRefresh)) {
    refreshToken = storedRefresh.trim();
    return true;
  }
  return false;
}

export async function refreshAccessToken(): Promise<string> {
  const currentRefresh = refreshToken || sessionStorage.getItem(STORAGE_KEY_REFRESH);
  if (!isNonBlankString(currentRefresh)) {
    clearTokens();
    throw new Error("No refresh token");
  }

  const currentAccess = accessToken || sessionStorage.getItem(STORAGE_KEY_ACCESS);
  const userId =
    (isNonBlankString(currentAccess) && parseSubjectFromJwt(currentAccess)) ||
    parseSubjectFromJwt(currentRefresh) ||
    "";

  const payload = userId
    ? { userId, refreshToken: currentRefresh.trim() }
    : { refreshToken: currentRefresh.trim() };

  const response = await fetch(`${getApiBaseUrl()}/identity/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    clearTokens();
    throw new Error("Refresh failed");
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    clearTokens();
    throw new Error("Malformed refresh response");
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    clearTokens();
    throw new Error("Malformed refresh response");
  }

  const record = raw as Record<string, unknown>;
  const nextAccess =
    isNonBlankString(record.access_token)
      ? record.access_token.trim()
      : isNonBlankString(record.accessToken)
        ? record.accessToken.trim()
        : null;

  const nextRefresh =
    isNonBlankString(record.refresh_token)
      ? record.refresh_token.trim()
      : isNonBlankString(record.refreshToken)
        ? record.refreshToken.trim()
        : null;

  if (!nextAccess || !nextRefresh) {
    clearTokens();
    throw new Error("Malformed refresh response");
  }

  setTokens({ accessToken: nextAccess, refreshToken: nextRefresh });
  return nextAccess;
}

async function getValidAccessToken(): Promise<string> {
  const token = getAccessToken();
  if (isNonBlankString(token)) return token;

  if (hasStoredRefreshToken()) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (isNonBlankString(refreshed)) {
      return refreshed;
    }
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
    ...(token && isNonBlankString(token) ? { Authorization: `Bearer ${token}` } : {}),
    ...(customHeaders as Record<string, string>),
  };

  if (headers.Authorization && !headers.Authorization.replace(/^Bearer\s*/, "").trim()) {
    delete headers.Authorization;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && hasStoredRefreshToken()) {
    try {
      const newToken = await refreshAccessToken();
      const retryHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(newToken && isNonBlankString(newToken) ? { Authorization: `Bearer ${newToken}` } : {}),
        ...(customHeaders as Record<string, string>),
      };

      if (retryHeaders.Authorization && !retryHeaders.Authorization.replace(/^Bearer\s*/, "").trim()) {
        delete retryHeaders.Authorization;
      }

      const retryResponse = await fetch(`${getApiBaseUrl()}${path}`, {
        ...rest,
        headers: retryHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!retryResponse.ok) {
        const errorBody = (await retryResponse.json().catch(() => null)) as Record<string, unknown> | null;
        const message =
          typeof errorBody?.message === "string" && errorBody.message.trim().length > 0
            ? errorBody.message
            : `API error: ${retryResponse.status}`;
        throw new ApiError(message, {
          status: retryResponse.status,
          code: errorBody?.code,
          responseBody: errorBody,
        });
      }

      return retryResponse.json() as Promise<T>;
    } catch (refreshErr) {
      clearTokens();
      notifyAuthExpired();
      if (refreshErr instanceof ApiError) {
        throw refreshErr;
      }
      throw new Error("Session expired");
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const message =
      typeof errorBody?.message === "string" && errorBody.message.trim().length > 0
        ? errorBody.message
        : `API error: ${response.status}`;
    throw new ApiError(message, {
      status: response.status,
      code: errorBody?.code,
      responseBody: errorBody,
    });
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
  return isNonBlankString(accessToken) || isNonBlankString(sessionStorage.getItem(STORAGE_KEY_ACCESS));
}
