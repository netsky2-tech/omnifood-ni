import { setTokens, getAccessToken, clearTokens, type TokenPair } from './api';

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

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/identity/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }
  );

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