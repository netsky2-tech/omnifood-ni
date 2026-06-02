import { UserRole } from '../entities/user.entity';
import {
  hasInventoryBohPermission,
  INVENTORY_BOH_PERMISSION,
  resolveInventoryBohPermissions,
} from './roles.guard';

describe('RolesGuard inventory BOH permission matrix', () => {
  it('grants the full BOH workspace matrix to owners and managers', () => {
    const ownerPermissions = resolveInventoryBohPermissions(UserRole.OWNER);
    const managerPermissions = resolveInventoryBohPermissions(UserRole.MANAGER);
    const expectedPermissions = Object.values(INVENTORY_BOH_PERMISSION);

    expect(ownerPermissions).toEqual(expectedPermissions);
    expect(managerPermissions).toEqual(expectedPermissions);
  });

  it('denies BOH workspace permissions to cashier and waiter roles', () => {
    expect(resolveInventoryBohPermissions(UserRole.CASHIER)).toEqual([]);
    expect(resolveInventoryBohPermissions(UserRole.WAITER)).toEqual([]);
    expect(
      hasInventoryBohPermission(
        UserRole.CASHIER,
        INVENTORY_BOH_PERMISSION.kardexView,
      ),
    ).toBe(false);
  });

  it('treats unknown role values as no-access for BOH routes', () => {
    expect(resolveInventoryBohPermissions('SUPERVISOR')).toEqual([]);
    expect(
      hasInventoryBohPermission('SUPERVISOR', INVENTORY_BOH_PERMISSION.shell),
    ).toBe(false);
  });
});
