import { Test, TestingModule } from '@nestjs/testing';
import { CashShiftController } from './cash-shift.controller';
import { CashShiftService } from '../services/cash-shift.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';

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
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'test',
            JWT_SECRET: jwtSecret,
            JWT_ISSUER: 'omnifood-admin',
            JWT_AUDIENCE: 'omnifood-pos',
            JWT_ACCESS_TTL_SECONDS: '3600',
            JWT_REFRESH_TTL_SECONDS: '604800',
            JWT_CLOCK_TOLERANCE_SECONDS: '5',
            JWT_ALGORITHM: 'HS256',
          }),
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<CashShiftController>(CashShiftController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /sales/shifts/open', () => {
    it('opens a new cash shift successfully', async () => {
      const mockShift: Partial<CashShiftSession> = {
        id: 'shift-1',
        tenant_id: 'tenant-test-1',
        terminal_id: 'term-main',
        status: CashShiftStatus.OPEN,
        initial_float_nio: 1000.0,
        initial_float_usd: 50.0,
      };
      service.openShift.mockResolvedValue(mockShift as CashShiftSession);

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
      expect(result).toEqual(mockShift);
    });
  });

  describe('GET /sales/shifts/active', () => {
    it('returns the active shift for the specified terminal', async () => {
      const mockShift: Partial<CashShiftSession> = {
        id: 'shift-1',
        tenant_id: 'tenant-test-1',
        terminal_id: 'term-main',
        status: CashShiftStatus.OPEN,
      };
      service.getActiveShiftByTerminal.mockResolvedValue(
        mockShift as CashShiftSession,
      );

      const result = await controller.getActiveShift(
        { user: mockUser },
        'term-main',
      );

      expect(service.getActiveShiftByTerminal).toHaveBeenCalledWith(
        'tenant-test-1',
        'term-main',
      );
      expect(result).toEqual(mockShift);
    });
  });

  describe('POST /sales/shifts/:shiftId/movements', () => {
    it('records a cash in / out movement', async () => {
      const mockMovement: Partial<CashMovement> = {
        id: 'mov-1',
        shift_id: 'shift-1',
        tenant_id: 'tenant-test-1',
        type: CashMovementType.PETTY_CASH,
        amount_nio: 150.0,
        amount_usd: 0.0,
        reason: 'Compra de bolsas',
      };
      service.recordCashMovement.mockResolvedValue(
        mockMovement as CashMovement,
      );

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
      expect(result).toEqual(mockMovement);
    });
  });
});
