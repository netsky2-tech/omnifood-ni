/**
 * Import-boundary test for permissions.enum.ts.
 *
 * permissions.enum.ts must be a framework-free leaf: importing it must never
 * transitively load the TypeORM user entity (or typeorm itself).
 *
 * Both forbidden modules are mocked with throwing factories so that any
 * transitive require fails deterministically with an explicit violation
 * message instead of silently passing.
 */

const USER_ENTITY_VIOLATION =
  'BOUNDARY VIOLATION: permissions.enum.ts must not load user.entity.ts';
const TYPEORM_VIOLATION =
  'BOUNDARY VIOLATION: permissions.enum.ts must not load typeorm';

jest.mock('../entities/user.entity', () => {
  throw new Error(USER_ENTITY_VIOLATION);
});

jest.mock('typeorm', () => {
  throw new Error(TYPEORM_VIOLATION);
});

import { UserRole } from './user-role.enum';
import { AppPermission } from './permissions.enum';

describe('permissions.enum import boundary', () => {
  it('imports UserRole from the framework-free leaf with exact values', () => {
    expect(Object.values(UserRole)).toEqual([
      'OWNER',
      'MANAGER',
      'CASHIER',
      'WAITER',
    ]);
  });

  it('imports AppPermission without loading user.entity or typeorm', () => {
    expect(AppPermission.SALES_VOID_INVOICE).toBe('sales:void_invoice');
    expect(AppPermission.INVENTORY_REMEDIATION_EXECUTE).toBe(
      'inventory.remediation.execute',
    );
  });
});
