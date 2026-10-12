import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CashShiftController } from './cash-shift.controller';
import { CashShiftService } from '../services/cash-shift.service';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';

// Driver-like shape helper: Postgres `numeric` reaches Node as strings, so
// the response mapper must coerce these into JSON numbers. Only the fields
// each test cares about are spelled out; the mapper fills the rest.
const driverShift = (over: Record<string, unknown> = {}) => ({
  id: 'shift-1',
  tenant_id: 'tenant-test-1',
  terminal_id: 'term-main',
  status: CashShiftStatus.OPEN,
  initial_float_nio: '1000.0000',
  initial_float_usd: '50.0000',
  final_counted_nio: null,
  final_counted_usd: null,
  expected_cash_nio: '1150.5000',
  expected_cash_usd: '57.5000',
  difference_nio: null,
  difference_usd: null,
  ...over,
});

describe('CashShiftController', () => {
  let controller: CashShiftController;
  let service: jest.Mocked<CashShiftService>;
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';

  const mockUser = {
    tenant_id: 'tenant-test-1',
    id: 'user-cajero',
    role: 'CASHIER',
  };

  beforeEach(async () => {
    service = {
      openShift: jest.fn(),
      getActiveShiftByTerminal: jest.fn(),
      getCashShiftById: jest.fn(),
      listShifts: jest.fn(),
      recordCashMovement: jest.fn(),
      closeShiftWithZReport: jest.fn(),
    } as unknown as jest.Mocked<CashShiftService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [CashShiftController],
      providers: [
        {
          provide: CashShiftService,
          useValue: service,
        },
        Reflector,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CashShiftController>(CashShiftController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /sales/shifts (owner-dashboard list)', () => {
    it('lists shift sessions for the requesting tenant with default params', async () => {
      const mockShifts = [driverShift({ status: CashShiftStatus.CLOSED })
      ] as unknown as CashShiftSession[];
      service.listShifts.mockResolvedValue(mockShifts);

      const result = await controller.listShifts({ user: mockUser }, {});

      expect(service.listShifts).toHaveBeenCalledWith('tenant-test-1', {
        status: undefined,
        limit: undefined,
      });
      // The response boundary coerces the driver strings into JSON numbers.
      expect(result[0]).toEqual({
        ...mockShifts[0],
        initial_float_nio: 1000,
        initial_float_usd: 50,
        expected_cash_nio: 1150.5,
        expected_cash_usd: 57.5,
        final_counted_nio: null,
        final_counted_usd: null,
        difference_nio: null,
        difference_usd: null,
      });
      expect(typeof result[0].initial_float_nio).toBe('number');
      expect(typeof result[0].expected_cash_nio).toBe('number');
      expect(typeof result[0].expected_cash_usd).toBe('number');
      expect(typeof result[0].difference_nio).toBe('object'); // null
    });

    it('forwards the status filter and limit to the service', async () => {
      service.listShifts.mockResolvedValue([]);

      await controller.listShifts(
        { user: mockUser },
        { status: CashShiftStatus.OPEN, limit: 10 },
      );

      expect(service.listShifts).toHaveBeenCalledWith('tenant-test-1', {
        status: CashShiftStatus.OPEN,
        limit: 10,
      });
    });

    it('gates the list route to OWNER and MANAGER via the RolesGuard', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CashShiftController.prototype.listShifts,
      );
      expect(roles).toEqual([UserRole.OWNER, UserRole.MANAGER]);
    });

    const buildContext = (role: string): ExecutionContext =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ user: { ...mockUser, role } }),
        }),
        getHandler: () => CashShiftController.prototype.listShifts,
        getClass: () => CashShiftController,
      }) as unknown as ExecutionContext;

    it('allows an OWNER through the guard chain for the list route', () => {
      const guard = new RolesGuard(new Reflector());
      expect(guard.canActivate(buildContext(UserRole.OWNER))).toBe(true);
    });

    it('rejects a CASHIER on the list route (403 behavior at the guard)', () => {
      const guard = new RolesGuard(new Reflector());
      expect(guard.canActivate(buildContext(UserRole.CASHIER))).toBe(false);
    });
  });

  describe('POST /sales/shifts/open', () => {
    it('opens a new cash shift successfully', async () => {
      const mockShift = driverShift() as unknown as CashShiftSession;
      service.openShift.mockResolvedValue(mockShift);

      const result = await controller.openShift(
        { user: mockUser },
        {
          terminalId: 'term-main',
          cashierId: 'user-cajero',
          cashierName: 'Juan Pérez',
          initialFloatNio: 1000.0,
          initialFloatUsd: 50.0,
        },
      );

      expect(service.openShift).toHaveBeenCalledWith('tenant-test-1', {
        terminalId: 'term-main',
        cashierId: 'user-cajero',
        cashierName: 'Juan Pérez',
        initialFloatNio: 1000.0,
        initialFloatUsd: 50.0,
      });
      expect(result).toEqual({
        ...mockShift,
        initial_float_nio: 1000,
        initial_float_usd: 50,
        expected_cash_nio: 1150.5,
        expected_cash_usd: 57.5,
        final_counted_nio: null,
        final_counted_usd: null,
        difference_nio: null,
        difference_usd: null,
      });
    });
  });

  describe('GET /sales/shifts/active', () => {
    it('returns the active shift for the specified terminal', async () => {
      const mockShift = driverShift() as unknown as CashShiftSession;
      service.getActiveShiftByTerminal.mockResolvedValue(mockShift);

      const result = await controller.getActiveShift(
        { user: mockUser },
        'term-main',
      );

      expect(service.getActiveShiftByTerminal).toHaveBeenCalledWith(
        'tenant-test-1',
        'term-main',
      );
      expect(result).toMatchObject({
        id: 'shift-1',
        initial_float_nio: 1000,
        expected_cash_nio: 1150.5,
        difference_nio: null,
      });
    });

    it('keeps the established null response when no shift is active', async () => {
      service.getActiveShiftByTerminal.mockResolvedValue(null);

      const result = await controller.getActiveShift(
        { user: mockUser },
        'term-main',
      );

      expect(result).toBeNull();
    });
  });

  describe('POST /sales/shifts/:shiftId/movements', () => {
    it('records a cash in / out movement', async () => {
      const mockMovement = {
        id: 'mov-1',
        shift_id: 'shift-1',
        tenant_id: 'tenant-test-1',
        type: CashMovementType.PETTY_CASH,
        amount_nio: '150.0000',
        amount_usd: '0.0000',
        reason: 'Compra de bolsas',
      } as unknown as CashMovement;
      service.recordCashMovement.mockResolvedValue(mockMovement);

      const result = await controller.recordMovement(
        { user: mockUser },
        'shift-1',
        {
          terminalId: 'term-main',
          type: CashMovementType.PETTY_CASH,
          amountNio: 150.0,
          amountUsd: 0.0,
          reason: 'Compra de bolsas',
          authorizedByUserId: 'supervisor-1',
        },
      );

      expect(service.recordCashMovement).toHaveBeenCalledWith(
        'tenant-test-1',
        'shift-1',
        {
          terminalId: 'term-main',
          type: CashMovementType.PETTY_CASH,
          amountNio: 150.0,
          amountUsd: 0.0,
          reason: 'Compra de bolsas',
          authorizedByUserId: 'supervisor-1',
        },
      );
      // The response boundary coerces the driver strings into JSON numbers.
      expect(result).toEqual({
        ...mockMovement,
        amount_nio: 150,
        amount_usd: 0,
      });
      expect(typeof result.amount_nio).toBe('number');
      expect(typeof result.amount_usd).toBe('number');
    });
  });
});
