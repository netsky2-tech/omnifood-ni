import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CountSessionService } from './count-session.service';
import { CountSessionDocumentDto } from './dto/count-session-document.dto';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

const countDocument = (
  overrides: Partial<CountSessionDocumentDto> = {},
): CountSessionDocumentDto => ({
  id: 'count-1',
  warehouseId: 'wh-1',
  warehouseName: 'Bodega Central',
  cutoffAt: '2026-06-02T10:00:00.000Z',
  status: 'posted',
  createdAt: '2026-06-02T09:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  postedAt: '2026-06-02T10:00:00.000Z',
  movementReferences: ['count-1:line-1'],
  lines: [
    {
      id: 'line-1',
      insumoId: 'ins-1',
      insumoName: 'Leche',
      uom: 'L',
      theoreticalQuantity: 15,
      approvedEntryIndex: 0,
      entries: [{ countedQuantity: 10 }],
    },
  ],
  ...overrides,
});

describe('CountSessionService', () => {
  let service: CountSessionService;
  const save = jest.fn();
  const findOne = jest.fn();
  const findOneBy = jest.fn();
  const create = jest.fn((entity: unknown) => entity);
  const transaction = jest.fn((callback: (manager: unknown) => unknown) =>
    Promise.resolve(
      callback({
        getRepository: (entity: unknown) => {
          if (entity === Insumo) return { findOne, save };
          if (entity === InventoryMovement) return { create, findOneBy, save };
          throw new Error('Unexpected repository');
        },
      }),
    ),
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    findOneBy.mockResolvedValue(null);
    findOne.mockResolvedValue({
      stock: 15,
      existenciaActual: 15,
      averageCost: 8,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountSessionService,
        { provide: DataSource, useValue: { transaction } },
      ],
    }).compile();
    service = module.get<CountSessionService>(CountSessionService);
  });

  it('replays approved count-session variances with the session id linked on Kardex rows', async () => {
    await service.replayCountSession({
      tenantId: 'tenant-A',
      document: countDocument(),
    });

    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'ins-1', tenant_id: 'tenant-A' },
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 10, existenciaActual: 10 }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-A',
        insumoId: 'ins-1',
        type: MovementType.ADJUSTMENT,
        quantity: -5,
        previousStock: 15,
        newStock: 10,
        unitCostNio: 8,
        totalCostNio: 40,
        sourceDocumentType: 'AJUSTE_CONTEO',
        sourceDocumentId: 'count-1',
      }),
    );
  });

  it('rejects count adjustments that do not come from a count-session document', async () => {
    await expect(
      service.replayCountSession({
        tenantId: 'tenant-A',
        document: countDocument({ id: '' }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('is idempotent on replay without rewriting existing Kardex rows', async () => {
    findOneBy.mockResolvedValueOnce({ id: 'existing-kardex-1' });

    await service.replayCountSession({
      tenantId: 'tenant-A',
      document: countDocument(),
    });

    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
