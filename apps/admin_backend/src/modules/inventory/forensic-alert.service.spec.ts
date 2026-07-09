import {
  ForensicAlertService,
  shouldCreateHighValueInventoryAlert,
} from './forensic-alert.service';

describe('ForensicAlertService', () => {
  describe('shouldCreateHighValueInventoryAlert', () => {
    it('alerts at C$1,500 for BOH shrinkage, count adjustments, and warehouse manual adjustments', () => {
      ['SHRINKAGE', 'SALIDA_MERMA', 'AJUSTE_CONTEO', 'AJUSTE_MANUAL'].forEach(
        (sourceDocumentType) => {
          expect(
            shouldCreateHighValueInventoryAlert({
              valuationNio: 1500,
              movementType:
                sourceDocumentType === 'SHRINKAGE' ? 'SHRINKAGE' : 'ADJUSTMENT',
              sourceDocumentType,
            }),
          ).toBe(true);
        },
      );
    });

    it('excludes FOH sales and production transformations even above C$1,500', () => {
      ['SALE', 'ENTRADA_PRODUCCION', 'SALIDA_BOM_PRODUCCION'].forEach(
        (sourceDocumentType) => {
          expect(
            shouldCreateHighValueInventoryAlert({
              valuationNio: 2500,
              movementType:
                sourceDocumentType === 'SALE' ? 'SALE' : 'PRODUCTION',
              sourceDocumentType,
            }),
          ).toBe(false);
        },
      );
    });
  });

  it('persists alert and dispatches async admin notifications', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const dispatchToAdmins = jest.fn().mockResolvedValue(undefined);
    const dataSource = { manager: { query } } as never;

    const service = new ForensicAlertService(dataSource, { dispatchToAdmins });

    await service.create({
      tenantId: 'tenant-1',
      alertType: 'SHRINKAGE_HIGH_VALUE',
      severity: 'HIGH',
      actorRole: 'OPERATOR',
      message: 'High value shrinkage',
      metadata: { amountNio: 1800 },
    });

    expect(query).toHaveBeenCalled();

    // Wait for microtasks to flush
    await new Promise((resolve) => setImmediate(resolve));

    expect(dispatchToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', severity: 'HIGH' }),
    );
  });

  it('does not fail transaction if dispatcher fails', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const dispatchToAdmins = jest
      .fn()
      .mockRejectedValue(new Error('Dispatch timeout'));
    const dataSource = { manager: { query } } as never;

    const service = new ForensicAlertService(dataSource, { dispatchToAdmins });

    await expect(
      service.create({
        tenantId: 'tenant-1',
        alertType: 'SHRINKAGE_HIGH_VALUE',
        severity: 'HIGH',
        actorRole: 'OPERATOR',
        message: 'High value shrinkage',
        metadata: { amountNio: 1800 },
      }),
    ).resolves.not.toThrow();

    expect(query).toHaveBeenCalled();

    // Wait for microtasks to flush
    await new Promise((resolve) => setImmediate(resolve));
    expect(dispatchToAdmins).toHaveBeenCalled();
  });
});
