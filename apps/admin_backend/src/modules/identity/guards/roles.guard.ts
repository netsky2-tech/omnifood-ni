import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../entities/user.entity';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { InventoryBohPermissionDto } from '../dto/identity.dto';

export const INVENTORY_BOH_PERMISSION = {
  shell: 'inventory.boh.shell',
  purchasesView: 'inventory.boh.purchases.view',
  productionView: 'inventory.boh.production.view',
  countsView: 'inventory.boh.counts.view',
  alertsView: 'inventory.boh.alerts.view',
  kardexView: 'inventory.boh.kardex.view',
  recipesView: 'inventory.boh.recipes.view',
} as const satisfies Record<string, InventoryBohPermissionDto>;

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));

const BOH_PERMISSION_MATRIX: Record<
  UserRole,
  readonly InventoryBohPermissionDto[]
> = {
  [UserRole.OWNER]: Object.values(INVENTORY_BOH_PERMISSION),
  [UserRole.MANAGER]: Object.values(INVENTORY_BOH_PERMISSION),
  [UserRole.CASHIER]: [],
  [UserRole.WAITER]: [],
};

const isUserRole = (value?: string): value is UserRole =>
  typeof value === 'string' && USER_ROLE_VALUES.has(value);

export const resolveInventoryBohPermissions = (
  role?: UserRole | string,
): InventoryBohPermissionDto[] => {
  if (!isUserRole(role)) {
    return [];
  }

  return [...BOH_PERMISSION_MATRIX[role]];
};

export const hasInventoryBohPermission = (
  role: UserRole | string | undefined,
  permission: InventoryBohPermissionDto,
): boolean => resolveInventoryBohPermissions(role).includes(permission);

interface RequestWithUser extends Request {
  user?: {
    role: UserRole;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return false;

    return requiredRoles.some((role) => user.role === role);
  }
}
