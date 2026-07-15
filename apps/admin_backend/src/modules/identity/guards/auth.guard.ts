import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../config/identity-jwt.config';
import {
  JWT_TOKEN_TYPES,
  type JwtSignPayload,
} from '../security/jwt-token.types';

interface RequestWithUser extends Request {
  user?: unknown;
}

interface StrictAccessTokenPayload extends Omit<
  JwtSignPayload,
  'token_type' | 'security_version'
> {
  token_type: typeof JWT_TOKEN_TYPES.ACCESS;
  security_version: number;
}

const isStrictAccessTokenPayload = (
  payload: unknown,
): payload is StrictAccessTokenPayload => {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const claims = payload as Record<string, unknown>;
  return (
    typeof claims.sub === 'string' &&
    typeof claims.email === 'string' &&
    typeof claims.tenant_id === 'string' &&
    typeof claims.role === 'string' &&
    claims.is_active === true &&
    claims.token_type === JWT_TOKEN_TYPES.ACCESS &&
    Number.isInteger(claims.security_version) &&
    (claims.security_version as number) > 0
  );
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(IDENTITY_JWT_CONFIG)
    private readonly config: IdentityJwtConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token, {
        secret: this.config.secret,
        algorithms: [this.config.algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockToleranceSeconds,
      });
      if (!isStrictAccessTokenPayload(payload)) {
        throw new UnauthorizedException();
      }
      request.user = payload;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
