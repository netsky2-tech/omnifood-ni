import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AppPermission } from '../security/permissions.enum';
import { UserRole } from '../entities/user.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

describe('PermissionsGuard (Slice 10.1)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  const createMockExecutionContext = (
    userPayload?: Record<string, unknown>,
    handlerOrClassMeta?: AppPermission[],
  ): ExecutionContext => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(handlerOrClassMeta);

    const mockRequest = {
      user: userPayload,
    };

    const mockHandler = () => {};
    const mockClass = class MockController {};

    return {
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access when no permissions are required by decorator', () => {
    const context = createMockExecutionContext(
      { role: UserRole.CASHIER },
      undefined,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when required permissions array is empty', () => {
    const context = createMockExecutionContext({ role: UserRole.WAITER }, []);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user context is completely missing from request', () => {
    const context = createMockExecutionContext(undefined, [
      AppPermission.SALES_VOID_INVOICE,
    ]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows OWNER full access to any protected permission', () => {
    const context = createMockExecutionContext({ role: UserRole.OWNER }, [
      AppPermission.INVENTORY_RECIPE_EDIT,
      AppPermission.SALES_VOID_INVOICE,
    ]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows MANAGER access to sales/cash/reports operations', () => {
    const context = createMockExecutionContext({ role: UserRole.MANAGER }, [
      AppPermission.SALES_DISCOUNT_OVERRIDE,
      AppPermission.CASH_MANUAL_DRAWER_OPEN,
    ]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies MANAGER access to inventory:recipe_edit (Admin/Owner only)', () => {
    const context = createMockExecutionContext({ role: UserRole.MANAGER }, [
      AppPermission.INVENTORY_RECIPE_EDIT,
    ]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies CASHIER access to protected actions by default', () => {
    const context = createMockExecutionContext({ role: UserRole.CASHIER }, [
      AppPermission.SALES_VOID_INVOICE,
    ]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows CASHIER access when custom_permissions includes the required permission', () => {
    const context = createMockExecutionContext(
      {
        role: UserRole.CASHIER,
        custom_permissions: [AppPermission.SALES_VOID_INVOICE],
      },
      [AppPermission.SALES_VOID_INVOICE],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies CASHIER if custom_permissions has some permissions but is missing one of the required', () => {
    const context = createMockExecutionContext(
      {
        role: UserRole.CASHIER,
        custom_permissions: [AppPermission.SALES_DISCOUNT_OVERRIDE],
      },
      [
        AppPermission.SALES_DISCOUNT_OVERRIDE,
        AppPermission.CASH_MANUAL_DRAWER_OPEN,
      ],
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('supports permissions passed in user.permissions array if present', () => {
    const context = createMockExecutionContext(
      {
        role: UserRole.WAITER,
        permissions: [AppPermission.SALES_ITEM_CANCEL],
      },
      [AppPermission.SALES_ITEM_CANCEL],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('correctly reads metadata with PERMISSIONS_KEY from reflector', () => {
    const getAllAndOverrideSpy = jest.spyOn(reflector, 'getAllAndOverride');
    const context = createMockExecutionContext({ role: UserRole.OWNER }, [
      AppPermission.REPORTS_VIEW_FISCAL,
    ]);

    guard.canActivate(context);

    expect(getAllAndOverrideSpy).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });
});
