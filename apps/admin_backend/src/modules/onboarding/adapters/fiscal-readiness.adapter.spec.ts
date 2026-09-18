import { Test, TestingModule } from '@nestjs/testing';
import { FiscalReadinessAdapter } from './fiscal-readiness.adapter';
import { FiscalSetupService } from '../services/fiscal-setup.service';
import type { FiscalSetupResponse } from '../dto/fiscal-setup.dto';

describe('FiscalReadinessAdapter (Unit)', () => {
  let adapter: FiscalReadinessAdapter;
  let fiscalSetupService: { getFiscalSetup: jest.Mock };

  beforeEach(async () => {
    fiscalSetupService = { getFiscalSetup: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalReadinessAdapter,
        { provide: FiscalSetupService, useValue: fiscalSetupService },
      ],
    }).compile();

    adapter = module.get<FiscalReadinessAdapter>(FiscalReadinessAdapter);
  });

  /** Otherwise-complete configuration; tests override exactly one field. */
  const configWith = (
    overrides: Partial<FiscalSetupResponse>,
  ): FiscalSetupResponse =>
    ({
      tenantId: 'tenant-1',
      businessName: 'Café La Estancia',
      ruc: 'J0310000123456',
      regime: 'REGIMEN_GENERAL',
      taxRateIva: 15,
      pricesIncludeTax: true,
      commercialFxSpread: 0,
      ...overrides,
    }) as FiscalSetupResponse;

  it('rejects minimum configuration when RUC is null', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: null }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });

  it('rejects minimum configuration when RUC is whitespace-only', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: '   ' }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });

  it('rejects minimum configuration when RUC is undefined', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: undefined }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });

  it('accepts minimum configuration with a valid legal J-RUC', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(configWith({}));

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(true);
  });

  it('accepts minimum configuration with a valid natural-person cédula RUC', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: '0011508850012X' }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(true);
  });

  it('accepts a whitespace-padded valid RUC (no false negative on normalization)', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: '  J0310000123456  ' }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(true);
  });

  it('accepts lowercase and hyphenated valid RUC forms', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: 'j0310000123456' }),
    );
    expect(
      (await adapter.evaluateFiscalReadiness('tenant-1'))
        .minimumConfigurationValid,
    ).toBe(true);

    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: '001-150885-0012X' }),
    );
    expect(
      (await adapter.evaluateFiscalReadiness('tenant-1'))
        .minimumConfigurationValid,
    ).toBe(true);
  });

  it('rejects a malformed RUC even when the rest of the configuration is complete (shared isValidRuc semantics)', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ ruc: '1234567890' }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });

  it('rejects minimum configuration when businessName is blank', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ businessName: '   ' }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });

  it('rejects minimum configuration when regime is missing', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(
      configWith({ regime: undefined }),
    );

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });

  it('rejects minimum configuration when no fiscal setup exists at all', async () => {
    fiscalSetupService.getFiscalSetup.mockResolvedValue(null);

    const result = await adapter.evaluateFiscalReadiness('tenant-1');

    expect(result.minimumConfigurationValid).toBe(false);
  });
});
