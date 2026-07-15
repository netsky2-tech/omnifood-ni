export const JWT_TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

type JwtTokenType = (typeof JWT_TOKEN_TYPES)[keyof typeof JWT_TOKEN_TYPES];

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
}

export interface JwtAccessPayload extends JwtIdentityClaims {
  token_type: typeof JWT_TOKEN_TYPES.ACCESS;
  security_version: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
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
