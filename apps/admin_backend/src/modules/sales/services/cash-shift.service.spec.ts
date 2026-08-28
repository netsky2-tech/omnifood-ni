import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashShiftService } from './cash-shift.service';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';

describe('CashShiftService', () => {
  let service: CashShiftService;
  let shiftRepo: jest.Mocked<Repository<CashShiftSession>>;
  let movementRepo: jest.Mocked<Repository<CashMovement>>;

  beforeEach(async () => {
    shiftRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<CashShiftSession>>;

    movementRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<CashMovement>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashShiftService,
        {
          provide: getRepositoryToken(CashShiftSession),
          useValue: shiftRepo,
        },
        {
          provide: getRepositoryToken(CashMovement),
          useValue: movementRepo,
        },
      ],
    }).compile();

    service = module.get<CashShiftService>(CashShiftService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('openShift', () => {
    it('creates and opens a new shift when no active shift exists on the terminal', async () => {
      shiftRepo.findOne.mockResolvedValue(null);

      const mockSavedShift: Partial<CashShiftSession> = {
        id: 'shift-1',
        tenant_id: 'tenant-1',
        terminal_id: 'term-main',
        cashier_id: 'user-cajero',
        cashier_name: 'Juan Pérez',
        status: CashShiftStatus.OPEN,
        initial_float_nio: 1000.0,
        initial_float_usd: 50.0,
        expected_cash_nio: 1000.0,
        expected_cash_usd: 50.0,
        opened_at: new Date(),
      };

      shiftRepo.create.mockReturnValue(mockSavedShift as CashShiftSession);
      shiftRepo.save.mockResolvedValue(mockSavedShift as CashShiftSession);

      const shift = await service.openShift('tenant-1', {
        terminalId: 'term-main',
        cashierId: 'user-cajero',
        cashierName: 'Juan Pérez',
        initialFloatNio: 1000.0,
        initialFloatUsd: 50.0,
      });

      expect(shiftRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          terminal_id: 'term-main',
          status: CashShiftStatus.OPEN,
        },
      });
      expect(shift.status).toBe(CashShiftStatus.OPEN);
      expect(shift.initial_float_nio).toBe(1000.0);
      expect(shift.initial_float_usd).toBe(50.0);
    });

    it('throws an error if an open shift already exists on the same terminal', async () => {
      shiftRepo.findOne.mockResolvedValue({
        id: 'shift-existing',
        status: CashShiftStatus.OPEN,
      } as CashShiftSession);

      await expect(
        service.openShift('tenant-1', {
          terminalId: 'term-main',
          cashierId: 'user-cajero',
          cashierName: 'Juan Pérez',
          initialFloatNio: 1000.0,
          initialFloatUsd: 50.0,
        }),
      ).rejects.toThrow('Ya existe un turno de caja abierto en este terminal');
    });
  });

  describe('recordCashMovement', () => {
    it('records a cash movement and updates expected cash in active shift', async () => {
      const activeShift: Partial<CashShiftSession> = {
        id: 'shift-1',
        tenant_id: 'tenant-1',
        status: CashShiftStatus.OPEN,
        expected_cash_nio: 1000.0,
        expected_cash_usd: 50.0,
      };
      shiftRepo.findOne.mockResolvedValue(activeShift as CashShiftSession);

      const mockMovement: Partial<CashMovement> = {
        id: 'mov-1',
        shift_id: 'shift-1',
        tenant_id: 'tenant-1',
        type: CashMovementType.CASH_IN,
        amount_nio: 500.0,
        amount_usd: 0.0,
        reason: 'Ingreso cambio menudo',
        timestamp: new Date(),
      };
      movementRepo.create.mockReturnValue(mockMovement as CashMovement);
      movementRepo.save.mockResolvedValue(mockMovement as CashMovement);

      const result = await service.recordCashMovement('tenant-1', 'shift-1', {
        terminalId: 'term-main',
        type: CashMovementType.CASH_IN,
        amountNio: 500.0,
        amountUsd: 0.0,
        reason: 'Ingreso cambio menudo',
      });

      expect(movementRepo.save).toHaveBeenCalled();
      expect(shiftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          expected_cash_nio: 1500.0,
        }),
      );
      expect(result.amount_nio).toBe(500.0);
    });

    it('records a USD safe drop (SAFE_DROP) and decrements expected USD cash in active shift', async () => {
      const activeShift: Partial<CashShiftSession> = {
        id: 'shift-1',
        tenant_id: 'tenant-1',
        status: CashShiftStatus.OPEN,
        expected_cash_nio: 1000.0,
        expected_cash_usd: 150.0,
      };
      shiftRepo.findOne.mockResolvedValue(activeShift as CashShiftSession);

      const mockMovement: Partial<CashMovement> = {
        id: 'mov-drop-1',
        shift_id: 'shift-1',
        tenant_id: 'tenant-1',
        type: CashMovementType.SAFE_DROP,
        amount_nio: 0.0,
        amount_usd: 100.0,
        reason: 'Retiro parcial a caja fuerte',
        authorized_by_user_id: 'user-manager',
        timestamp: new Date(),
      };
      movementRepo.create.mockReturnValue(mockMovement as CashMovement);
      movementRepo.save.mockResolvedValue(mockMovement as CashMovement);

      const result = await service.recordCashMovement('tenant-1', 'shift-1', {
        terminalId: 'term-main',
        type: CashMovementType.SAFE_DROP,
        amountNio: 0.0,
        amountUsd: 100.0,
        reason: 'Retiro parcial a caja fuerte',
        authorizedByUserId: 'user-manager',
      });

      expect(shiftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          expected_cash_usd: 50.0,
        }),
      );
      expect(result.amount_usd).toBe(100.0);
    });
  });

  describe('closeShiftWithZReport', () => {
    it('closes shift, computes variances, and assigns next sequential Z-report number', async () => {
      const activeShift: Partial<CashShiftSession> = {
        id: 'shift-1',
        tenant_id: 'tenant-1',
        status: CashShiftStatus.OPEN,
        expected_cash_nio: 2500.0,
        expected_cash_usd: 100.0,
      };
      shiftRepo.findOne.mockResolvedValue(activeShift as CashShiftSession);
      shiftRepo.count.mockResolvedValue(14); // 14 previous closed shifts -> next Z = 15

      shiftRepo.save.mockImplementation(
        async (entity) => entity as CashShiftSession,
      );

      const closed = await service.closeShiftWithZReport(
        'tenant-1',
        'shift-1',
        {
          finalCountedNio: 2480.0, // Faltante de 20 NIO
          finalCountedUsd: 100.0, // Exacto
          notes: 'Cierre turno tarde',
        },
      );

      expect(closed.status).toBe(CashShiftStatus.CLOSED);
      expect(closed.difference_nio).toBe(-20.0);
      expect(closed.difference_usd).toBe(0.0);
      expect(closed.z_report_sequence).toBe(15);
      expect(closed.closed_at).toBeDefined();
    });

    it('computes positive variance (sobrante) when counted exceeds expected cash', async () => {
      const activeShift: Partial<CashShiftSession> = {
        id: 'shift-2',
        tenant_id: 'tenant-1',
        status: CashShiftStatus.OPEN,
        expected_cash_nio: 1000.0,
        expected_cash_usd: 50.0,
      };
      shiftRepo.findOne.mockResolvedValue(activeShift as CashShiftSession);
      shiftRepo.count.mockResolvedValue(0);

      shiftRepo.save.mockImplementation(
        async (entity) => entity as CashShiftSession,
      );

      const closed = await service.closeShiftWithZReport(
        'tenant-1',
        'shift-2',
        {
          finalCountedNio: 1050.0, // Sobrante de 50 NIO
          finalCountedUsd: 70.0, // Sobrante de 20 USD
        },
      );

      expect(closed.difference_nio).toBe(50.0);
      expect(closed.difference_usd).toBe(20.0);
      expect(closed.z_report_sequence).toBe(1);
    });
  });
});
