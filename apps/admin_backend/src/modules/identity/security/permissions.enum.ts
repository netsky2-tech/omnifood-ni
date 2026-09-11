import { UserRole } from '../entities/user.entity';

export enum AppPermission {
  SALES_VOID_INVOICE = 'sales:void_invoice',
  SALES_DISCOUNT_OVERRIDE = 'sales:discount_override',
  SALES_ITEM_CANCEL = 'sales:item_cancel',
  SALES_PRICE_OVERRIDE = 'sales:price_override',
  CASH_MANUAL_DRAWER_OPEN = 'cash:manual_drawer_open',
  CASH_REOPEN_SHIFT = 'cash:reopen_shift',
  INVENTORY_RECIPE_EDIT = 'inventory:recipe_edit',
  REPORTS_VIEW_FISCAL = 'reports:view_fiscal',
  LOYALTY_PROGRAM_READ = 'loyalty:program_read',
  LOYALTY_PROGRAM_WRITE = 'loyalty:program_write',
  LOYALTY_REWARD_READ = 'loyalty:reward_read',
  LOYALTY_REWARD_WRITE = 'loyalty:reward_write',
  LOYALTY_CUSTOMER_READ = 'loyalty:customer_read',
  LOYALTY_HISTORY_READ = 'loyalty:history_read',
  LOYALTY_ADJUST = 'loyalty:adjust',
  LOYALTY_REDEEM = 'loyalty:redeem',
  ONBOARDING_READ = 'onboarding:read',
  ONBOARDING_START = 'onboarding:start',
  ONBOARDING_FISCAL_CONFIGURE = 'onboarding:fiscal:configure',
  ONBOARDING_TEMPLATE_APPLY = 'onboarding:template:apply',
  ONBOARDING_PRODUCT_IMPORT_MANAGE = 'onboarding:product_import:manage',
  ONBOARDING_ACTIVATION_MANAGE = 'onboarding:activation:manage',
  ONBOARDING_SUPPORT_ASSIST = 'onboarding:support:assist',
  INVENTORY_REMEDIATION_EXECUTE = 'inventory.remediation.execute',
}

export type Permission = `${AppPermission}` | AppPermission;

export const APP_PERMISSIONS = {
  SALES_VOID_INVOICE: AppPermission.SALES_VOID_INVOICE,
  SALES_DISCOUNT_OVERRIDE: AppPermission.SALES_DISCOUNT_OVERRIDE,
  SALES_ITEM_CANCEL: AppPermission.SALES_ITEM_CANCEL,
  SALES_PRICE_OVERRIDE: AppPermission.SALES_PRICE_OVERRIDE,
  CASH_MANUAL_DRAWER_OPEN: AppPermission.CASH_MANUAL_DRAWER_OPEN,
  CASH_REOPEN_SHIFT: AppPermission.CASH_REOPEN_SHIFT,
  INVENTORY_RECIPE_EDIT: AppPermission.INVENTORY_RECIPE_EDIT,
  REPORTS_VIEW_FISCAL: AppPermission.REPORTS_VIEW_FISCAL,
  LOYALTY_PROGRAM_READ: AppPermission.LOYALTY_PROGRAM_READ,
  LOYALTY_PROGRAM_WRITE: AppPermission.LOYALTY_PROGRAM_WRITE,
  LOYALTY_REWARD_READ: AppPermission.LOYALTY_REWARD_READ,
  LOYALTY_REWARD_WRITE: AppPermission.LOYALTY_REWARD_WRITE,
  LOYALTY_CUSTOMER_READ: AppPermission.LOYALTY_CUSTOMER_READ,
  LOYALTY_HISTORY_READ: AppPermission.LOYALTY_HISTORY_READ,
  LOYALTY_ADJUST: AppPermission.LOYALTY_ADJUST,
  LOYALTY_REDEEM: AppPermission.LOYALTY_REDEEM,
  ONBOARDING_READ: AppPermission.ONBOARDING_READ,
  ONBOARDING_START: AppPermission.ONBOARDING_START,
  ONBOARDING_FISCAL_CONFIGURE: AppPermission.ONBOARDING_FISCAL_CONFIGURE,
  ONBOARDING_TEMPLATE_APPLY: AppPermission.ONBOARDING_TEMPLATE_APPLY,
  ONBOARDING_PRODUCT_IMPORT_MANAGE:
    AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE,
  ONBOARDING_ACTIVATION_MANAGE: AppPermission.ONBOARDING_ACTIVATION_MANAGE,
  ONBOARDING_SUPPORT_ASSIST: AppPermission.ONBOARDING_SUPPORT_ASSIST,
  INVENTORY_REMEDIATION_EXECUTE: AppPermission.INVENTORY_REMEDIATION_EXECUTE,
} as const;

export const ALL_APP_PERMISSIONS = Object.values(AppPermission);

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));

export const DEFAULT_ROLE_PERMISSIONS: Record<
  UserRole,
  readonly AppPermission[]
> = {
  [UserRole.OWNER]: [
    AppPermission.SALES_VOID_INVOICE,
    AppPermission.SALES_DISCOUNT_OVERRIDE,
    AppPermission.SALES_ITEM_CANCEL,
    AppPermission.SALES_PRICE_OVERRIDE,
    AppPermission.CASH_MANUAL_DRAWER_OPEN,
    AppPermission.CASH_REOPEN_SHIFT,
    AppPermission.INVENTORY_RECIPE_EDIT,
    AppPermission.REPORTS_VIEW_FISCAL,
    AppPermission.LOYALTY_PROGRAM_READ,
    AppPermission.LOYALTY_PROGRAM_WRITE,
    AppPermission.LOYALTY_REWARD_READ,
    AppPermission.LOYALTY_REWARD_WRITE,
    AppPermission.LOYALTY_CUSTOMER_READ,
    AppPermission.LOYALTY_HISTORY_READ,
    AppPermission.LOYALTY_ADJUST,
    AppPermission.LOYALTY_REDEEM,
    AppPermission.ONBOARDING_READ,
    AppPermission.ONBOARDING_START,
    AppPermission.ONBOARDING_FISCAL_CONFIGURE,
    AppPermission.ONBOARDING_TEMPLATE_APPLY,
    AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE,
    AppPermission.ONBOARDING_ACTIVATION_MANAGE,
    AppPermission.INVENTORY_REMEDIATION_EXECUTE,
  ],
  [UserRole.MANAGER]: [
    AppPermission.SALES_VOID_INVOICE,
    AppPermission.SALES_DISCOUNT_OVERRIDE,
    AppPermission.SALES_ITEM_CANCEL,
    AppPermission.SALES_PRICE_OVERRIDE,
    AppPermission.CASH_MANUAL_DRAWER_OPEN,
    AppPermission.CASH_REOPEN_SHIFT,
    AppPermission.REPORTS_VIEW_FISCAL,
    AppPermission.LOYALTY_PROGRAM_READ,
    AppPermission.LOYALTY_REWARD_READ,
    AppPermission.LOYALTY_CUSTOMER_READ,
    AppPermission.LOYALTY_HISTORY_READ,
    AppPermission.ONBOARDING_READ,
    AppPermission.INVENTORY_REMEDIATION_EXECUTE,
  ],
  [UserRole.CASHIER]: [],
  [UserRole.WAITER]: [],
};

const isUserRole = (value?: string): value is UserRole =>
  typeof value === 'string' && USER_ROLE_VALUES.has(value);

const VALID_PERMISSIONS_SET = new Set<string>(Object.values(AppPermission));

export function resolveEffectivePermissions(
  role?: UserRole | string,
  customPermissions?:
    (string | AppPermission)[] | readonly (string | AppPermission)[] | null,
): AppPermission[] {
  const rolePermissions: AppPermission[] = isUserRole(role)
    ? [...DEFAULT_ROLE_PERMISSIONS[role]]
    : [];

  const customValidPermissions: AppPermission[] = Array.isArray(
    customPermissions,
  )
    ? customPermissions.filter(
        (p): p is AppPermission =>
          typeof p === 'string' && VALID_PERMISSIONS_SET.has(p),
      )
    : [];

  return Array.from(new Set([...rolePermissions, ...customValidPermissions]));
}

export function hasPermission(
  effectivePermissions: readonly (AppPermission | string)[],
  requiredPermission: AppPermission | string,
): boolean {
  return effectivePermissions.includes(requiredPermission);
}

export function hasAllPermissions(
  effectivePermissions: readonly (AppPermission | string)[],
  requiredPermissions: readonly (AppPermission | string)[],
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  return requiredPermissions.every((perm) =>
    effectivePermissions.includes(perm as AppPermission),
  );
}
