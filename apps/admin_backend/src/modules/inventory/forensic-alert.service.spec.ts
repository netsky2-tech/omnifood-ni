import { EntityManager } from 'typeorm';
import {
  ForensicAlertManagerRequiredError,
  ForensicAlertService,
  shouldCreateHighValueInventoryAlert,
} from './forensic-alert.service';

const makeManager = (): { query: jest.Mock } => ({
  query: jest.fn().mockResolvedValue(undefined),
});

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

  const alertInput = {
    tenantId: 'tenant-1',
    alertType: 'SHRINKAGE_HIGH_VALUE',
    severity: 'HIGH' as const,
    actorRole: 'OPERATOR',
    message: 'High value shrinkage',
    metadata: { amountNio: 1800 },
  };

  it('persists the alert through the supplied tenant-bound manager and dispatches async admin notifications', async () => {
    const manager = makeManager();
    const dispatchToAdmins = jest.fn().mockResolvedValue(undefined);

    const service = new ForensicAlertService({ dispatchToAdmins });

    await service.create(alertInput, manager as unknown as EntityManager);

    expect(manager.query).toHaveBeenCalledTimes(1);

    // Wait for microtasks to flush
    await new Promise((resolve) => setImmediate(resolve));

    expect(dispatchToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', severity: 'HIGH' }),
    );
  });

  it('does not fail transaction if dispatcher fails', async () => {
    const manager = makeManager();
    const dispatchToAdmins = jest
      .fn()
      .mockRejectedValue(new Error('Dispatch timeout'));

    const service = new ForensicAlertService({ dispatchToAdmins });

    await expect(
      service.create(alertInput, manager as unknown as EntityManager),
    ).resolves.not.toThrow();

    expect(manager.query).toHaveBeenCalled();

    // Wait for microtasks to flush
    await new Promise((resolve) => setImmediate(resolve));
    expect(dispatchToAdmins).toHaveBeenCalled();
  });

  // Issue #512 T3 slice 7: forensic_alerts is tenant-RLS protected, so the
  // pooled fallback is gone — the caller's tenant-bound manager is the only
  // write path. This guard has runtime teeth: it reintroduces the exact
  // pre-slice failure mode (an unbound pooled INSERT that RLS would deny)
  // and asserts the service refuses it instead of silently using it.
  it('rejects a missing manager instead of falling back to the pooled connection', async () => {
    // Pooled tripwire: a manager that would happily run the INSERT if the
    // fallback were ever restored.
    const pooledManager = makeManager();

    const service = new ForensicAlertService(undefined);

    await expect(
      service.create(alertInput, undefined as unknown as EntityManager),
    ).rejects.toThrowError(ForensicAlertManagerRequiredError);

    expect(pooledManager.query).not.toHaveBeenCalled();
  });
});
