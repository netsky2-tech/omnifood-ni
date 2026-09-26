import { setTokens, getAccessToken, clearTokens, type TokenPair } from './api';
import { getApiBaseUrl } from './api-base-url';

export interface LoginCredentials {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenant_id: string;
  };
}

/**
 * Derives the tenant slug from a hostname's first DNS label.
 * - Subdomain hosts (e.g. soho.nhilospos.com, soho.localhost): first label,
 *   unless it is 'www' or 'app' (reserved front-facing hosts).
 * - Hosts without a tenant subdomain (localhost, apex domains, IP addresses):
 *   null. The login page fails closed: it renders a notice instead of the
 *   credentials form (no manual slug entry on a public page).
 */
export function resolveTenantSlug(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();
  if (!host) return null;

  // Strip the port before splitting into labels.
  const withoutPort = host.split(":")[0] ?? "";
  const labels = withoutPort.split(".").filter(Boolean);
  const first = labels[0];
  if (!first) return null;

  // IP addresses (e.g. 127.0.0.1) never carry a tenant subdomain.
  if (labels.every((label) => /^\d+$/.test(label))) return null;

  // Single-label hosts (e.g. localhost) and apex domains have no subdomain.
  // The loopback TLD 'localhost' keeps its subdomain (soho.localhost -> soho).
  if (labels.length === 1) return null;
  if (labels.length === 2 && labels[labels.length - 1] !== "localhost") return null;

  if (first === "www" || first === "app") return null;
  return first;
}

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(`${getApiBaseUrl()}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Credenciales inválidas');
  }

  const data = await response.json();
  const tokens: TokenPair = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
  setTokens(tokens);
  return data;
}

export function logout() {
  clearTokens();
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function getAuthHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}