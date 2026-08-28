import { UserRole } from '../entities/user.entity';
import {
  AppPermission,
  APP_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasAllPermissions,
  hasPermission,
  resolveEffectivePermissions,
} from './permissions.enum';

describe('Permissions Matrix & Resolution (Slice 10.1)', () => {
  describe('AppPermission enum & constants', () => {
    it('defines all required granular permission capabilities', () => {
      expect(AppPermission.SALES_VOID_INVOICE).toBe('sales:void_invoice');
      expect(AppPermission.SALES_DISCOUNT_OVERRIDE).toBe(
        'sales:discount_override',
      );
      expect(AppPermission.SALES_ITEM_CANCEL).toBe('sales:item_cancel');
      expect(AppPermission.SALES_PRICE_OVERRIDE).toBe('sales:price_override');
      expect(AppPermission.CASH_MANUAL_DRAWER_OPEN).toBe(
        'cash:manual_drawer_open',
      );
      expect(AppPermission.CASH_REOPEN_SHIFT).toBe('cash:reopen_shift');
      expect(AppPermission.INVENTORY_RECIPE_EDIT).toBe('inventory:recipe_edit');
      expect(AppPermission.REPORTS_VIEW_FISCAL).toBe('reports:view_fiscal');

      expect(APP_PERMISSIONS.SALES_VOID_INVOICE).toBe('sales:void_invoice');
    });
  });

  describe('DEFAULT_ROLE_PERMISSIONS matrix', () => {
    it('grants full permission capabilities to OWNER', () => {
      const ownerPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.OWNER];
      expect(ownerPerms).toContain(AppPermission.SALES_VOID_INVOICE);
      expect(ownerPerms).toContain(AppPermission.SALES_DISCOUNT_OVERRIDE);
      expect(ownerPerms).toContain(AppPermission.SALES_ITEM_CANCEL);
      expect(ownerPerms).toContain(AppPermission.SALES_PRICE_OVERRIDE);
      expect(ownerPerms).toContain(AppPermission.CASH_MANUAL_DRAWER_OPEN);
      expect(ownerPerms).toContain(AppPermission.CASH_REOPEN_SHIFT);
      expect(ownerPerms).toContain(AppPermission.INVENTORY_RECIPE_EDIT);
      expect(ownerPerms).toContain(AppPermission.REPORTS_VIEW_FISCAL);
      expect(ownerPerms.length).toBe(8);
    });

    it('grants operational supervisor permissions to MANAGER but excludes INVENTORY_RECIPE_EDIT', () => {
      const managerPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.MANAGER];
      expect(managerPerms).toContain(AppPermission.SALES_VOID_INVOICE);
      expect(managerPerms).toContain(AppPermission.SALES_DISCOUNT_OVERRIDE);
      expect(managerPerms).toContain(AppPermission.SALES_ITEM_CANCEL);
      expect(managerPerms).toContain(AppPermission.SALES_PRICE_OVERRIDE);
      expect(managerPerms).toContain(AppPermission.CASH_MANUAL_DRAWER_OPEN);
      expect(managerPerms).toContain(AppPermission.CASH_REOPEN_SHIFT);
      expect(managerPerms).toContain(AppPermission.REPORTS_VIEW_FISCAL);
      expect(managerPerms).not.toContain(AppPermission.INVENTORY_RECIPE_EDIT);
    });

    it('denies all critical permissions by default to CASHIER and WAITER', () => {
      expect(DEFAULT_ROLE_PERMISSIONS[UserRole.CASHIER]).toEqual([]);
      expect(DEFAULT_ROLE_PERMISSIONS[UserRole.WAITER]).toEqual([]);
    });
  });

  describe('resolveEffectivePermissions', () => {
    it('returns default role permissions when no custom permissions are provided', () => {
      const effective = resolveEffectivePermissions(UserRole.OWNER);
      expect(effective).toEqual(DEFAULT_ROLE_PERMISSIONS[UserRole.OWNER]);
    });

    it('merges custom permissions with role defaults without duplicates', () => {
      const cashierEffective = resolveEffectivePermissions(UserRole.CASHIER, [
        AppPermission.SALES_DISCOUNT_OVERRIDE,
        AppPermission.CASH_MANUAL_DRAWER_OPEN,
      ]);

      expect(cashierEffective).toEqual([
        AppPermission.SALES_DISCOUNT_OVERRIDE,
        AppPermission.CASH_MANUAL_DRAWER_OPEN,
      ]);

      const managerEffective = resolveEffectivePermissions(UserRole.MANAGER, [
        AppPermission.INVENTORY_RECIPE_EDIT,
        AppPermission.SALES_VOID_INVOICE, // already in default
      ]);

      expect(managerEffective).toContain(AppPermission.INVENTORY_RECIPE_EDIT);
      expect(managerEffective).toContain(AppPermission.SALES_VOID_INVOICE);
      // Ensure no duplicates
      const uniqueCount = new Set(managerEffective).size;
      expect(managerEffective.length).toBe(uniqueCount);
    });

    it('filters out invalid or unknown permission strings safely', () => {
      const perms = resolveEffectivePermissions(UserRole.WAITER, [
        'invalid:permission',
        AppPermission.SALES_ITEM_CANCEL,
        null,
      ]);

      expect(perms).toEqual([AppPermission.SALES_ITEM_CANCEL]);
    });

    it('handles null / undefined / empty arguments gracefully', () => {
      expect(resolveEffectivePermissions(undefined)).toEqual([]);
      expect(resolveEffectivePermissions(null)).toEqual([]);
      expect(resolveEffectivePermissions('UNKNOWN_ROLE')).toEqual([]);
    });
  });

  describe('hasPermission & hasAllPermissions', () => {
    it('checks single permission correctly', () => {
      const perms = [
        AppPermission.SALES_VOID_INVOICE,
        AppPermission.CASH_MANUAL_DRAWER_OPEN,
      ];
      expect(hasPermission(perms, AppPermission.SALES_VOID_INVOICE)).toBe(true);
      expect(hasPermission(perms, AppPermission.INVENTORY_RECIPE_EDIT)).toBe(
        false,
      );
    });

    it('checks multiple permissions with hasAllPermissions', () => {
      const perms = [
        AppPermission.SALES_VOID_INVOICE,
        AppPermission.CASH_MANUAL_DRAWER_OPEN,
        AppPermission.REPORTS_VIEW_FISCAL,
      ];

      expect(
        hasAllPermissions(perms, [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.REPORTS_VIEW_FISCAL,
        ]),
      ).toBe(true);

      expect(
        hasAllPermissions(perms, [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.INVENTORY_RECIPE_EDIT,
        ]),
      ).toBe(false);

      expect(hasAllPermissions(perms, [])).toBe(true);
    });
  });
});
