import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAccessPayload } from '../security/jwt-token.types';
import { CurrentUserAuthorizationService } from '../services/current-user-authorization.service';

interface RequestWithAccessUser extends Request {
  user?: JwtAccessPayload;
}

@Injectable()
export class AuthoritativeCurrentUserGuard implements CanActivate {
  constructor(
    private readonly currentUserAuthorization: CurrentUserAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAccessUser>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    const currentUser = await this.currentUserAuthorization.authorize(
      request.user,
    );
    Object.assign(request.user, currentUser);
    return true;
  }
}
