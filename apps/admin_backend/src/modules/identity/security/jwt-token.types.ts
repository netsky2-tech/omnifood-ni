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
