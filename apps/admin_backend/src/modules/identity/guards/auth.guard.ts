import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import {
  getIdentityJwtConfig,
  IdentityJwtConfig,
} from '../config/identity-jwt.config';
import {
  isAccessTokenPayload,
  JwtAccessPayload,
} from '../security/jwt-token.types';

interface RequestWithUser extends Request {
  user?: JwtAccessPayload;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtConfig: IdentityJwtConfig;

  constructor(
    private jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtConfig = getIdentityJwtConfig(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token, {
        secret: this.jwtConfig.secret,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        algorithms: [this.jwtConfig.algorithm],
        clockTolerance: this.jwtConfig.clockToleranceSeconds,
      });
      if (
        !isAccessTokenPayload(
          payload,
          this.jwtConfig.issuer,
          this.jwtConfig.audience,
        )
      )
        throw new UnauthorizedException();
      request.user = payload;
    } catch {
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
