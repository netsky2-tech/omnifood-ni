import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import {
  AppPermission,
  hasAllPermissions,
  resolveEffectivePermissions,
} from '../security/permissions.enum';
import { UserRole } from '../entities/user.entity';

export interface UserContext {
  sub?: string;
  id?: string;
  role?: UserRole | string;
  custom_permissions?: string[];
  permissions?: string[];
  [key: string]: unknown;
}

export interface RequestWithUserContext extends Request {
  user?: UserContext;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<
      AppPermission[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUserContext>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context is missing');
    }

    const explicitPerms = Array.isArray(user.custom_permissions)
      ? user.custom_permissions
      : Array.isArray(user.permissions)
        ? user.permissions
        : [];

    const effective = resolveEffectivePermissions(user.role, explicitPerms);

    const hasAccess = hasAllPermissions(effective, requiredPermissions);

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
