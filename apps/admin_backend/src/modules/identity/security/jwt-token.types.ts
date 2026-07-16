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
  refresh_token_family_id?: string;
}

export interface JwtRefreshPayload {
  sub: string;
  token_type: typeof JWT_TOKEN_TYPES.REFRESH;
  jti?: string;
  refresh_token_family_id?: string;
}

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
