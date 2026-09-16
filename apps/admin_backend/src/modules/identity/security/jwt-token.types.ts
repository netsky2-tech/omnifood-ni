export const JWT_TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  DEVICE_SYNC_ACCESS: 'device_sync_access',
} as const;

export const DEVICE_SYNC_TOKEN_TYPE = JWT_TOKEN_TYPES.DEVICE_SYNC_ACCESS;
export const DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM = 'device_sync' as const;

export interface DeviceSyncJwtClaims {
  sub: string;
  principal_type: typeof DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM;
  token_type: typeof DEVICE_SYNC_TOKEN_TYPE;
  tenant_id: string;
  device_id: string;
  scopes: string[];
  credential_version: number;
  jti: string;
}

export interface DeviceSyncJwtAccessPayload extends DeviceSyncJwtClaims {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type JwtTokenType =
  (typeof JWT_TOKEN_TYPES)[keyof typeof JWT_TOKEN_TYPES];

interface JwtIdentityClaims {
  sub: string;
  email: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  token_type: JwtTokenType;
}

export interface JwtSignPayload extends JwtIdentityClaims {
  security_version?: number;
  refresh_token_family_id?: string;
}

export interface JwtAccessPayload extends JwtIdentityClaims {
  token_type: typeof JWT_TOKEN_TYPES.ACCESS;
  security_version: number;
  [claim: string]: unknown;
}

export interface JwtRefreshPayload {
  sub: string;
  token_type: typeof JWT_TOKEN_TYPES.REFRESH;
  jti?: string;
  refresh_token_family_id?: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isAccessTokenPayload = (
  value: unknown,
  issuer: string,
  audience: string,
): value is JwtAccessPayload => {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    isNonEmptyString(payload.sub) &&
    isNonEmptyString(payload.email) &&
    isNonEmptyString(payload.tenant_id) &&
    isNonEmptyString(payload.role) &&
    payload.is_active === true &&
    payload.token_type === JWT_TOKEN_TYPES.ACCESS &&
    Number.isInteger(payload.security_version) &&
    (payload.security_version as number) >= 1 &&
    payload.iss === issuer &&
    payload.aud === audience &&
    Number.isFinite(payload.iat) &&
    Number.isFinite(payload.exp)
  );
};

export const isRefreshTokenPayloadForSubject = (
  payload: unknown,
  userId: string,
): payload is JwtRefreshPayload =>
  typeof payload === 'object' &&
  payload !== null &&
  'sub' in payload &&
  'token_type' in payload &&
  typeof payload.sub === 'string' &&
  payload.sub.length > 0 &&
  payload.sub === userId &&
  payload.token_type === JWT_TOKEN_TYPES.REFRESH &&
  (!('jti' in payload) ||
    (typeof payload.jti === 'string' && payload.jti.trim().length > 0)) &&
  (!('refresh_token_family_id' in payload) ||
    typeof payload.refresh_token_family_id === 'string');

export const isDeviceSyncAccessTokenPayload = (
  value: unknown,
  issuer: string,
  audience: string,
): value is DeviceSyncJwtAccessPayload => {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    isNonEmptyString(payload.sub) &&
    payload.principal_type === DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM &&
    payload.token_type === DEVICE_SYNC_TOKEN_TYPE &&
    isNonEmptyString(payload.tenant_id) &&
    isNonEmptyString(payload.device_id) &&
    Array.isArray(payload.scopes) &&
    payload.scopes.length > 0 &&
    payload.scopes.every((scope) => isNonEmptyString(scope)) &&
    Number.isInteger(payload.credential_version) &&
    (payload.credential_version as number) >= 1 &&
    isNonEmptyString(payload.jti) &&
    payload.iss === issuer &&
    payload.aud === audience &&
    Number.isFinite(payload.iat) &&
    Number.isFinite(payload.exp)
  );
};
