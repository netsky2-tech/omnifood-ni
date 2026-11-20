import * as path from 'path';
import type { DataSource, EntityManager } from 'typeorm';
import {
  ALLOW_PRODUCTION_DEMO_SEED_ENV,
  ALLOW_PRODUCTION_DEMO_SEED_TOKEN,
  DEFAULT_DEMO_PASSWORD,
  DEFAULT_DEMO_RUC,
  DEFAULT_FX_RATE,
  DEFAULT_INVOICE_COUNT,
  DEFAULT_PLAN_CODE,
  DEMO_USER_PINS,
  POS_ANDROID_PACKAGE_ID,
  PROSPECT_DEMO_ERROR_CODES,
  ProspectDemoArgsError,
  ProspectDemoGuardError,
  assertNotProductionEnvironment,
  buildDefaultRestaurantTopology,
  buildHistoricalInvoicePlan,
  formatSummary,
  isProspectDemoConfig,
  normalizeDemoSlug,
  parseArgs,
  seedProspectDemo,
  shouldSeedRestaurantTables,
  type DemoVertical,
  type ProspectDemoConfig,
  type ProspectDemoDeps,
} from './seed-prospect-demo';
import {
  CheckoutFxMode,
  FiscalRegime,
  TenantOperationMode,
} from '../modules/onboarding/dto/fiscal-setup.dto';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { Insumo } from '../modules/inventory/entities/insumo.entity';
import {
  Product,
  ProductType,
} from '../modules/inventory/entities/product.entity';
import { CashShiftSession } from '../modules/sales/entities/cash-shift.entity';
import { Invoice } from '../modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../modules/sales/entities/invoice-item.entity';
import { Payment } from '../modules/sales/entities/payment.entity';

interface MockOrchestrationContext {
  readonly deps: ProspectDemoDeps;
  readonly savedInvoices: Invoice[];
  readonly savedPayments: Payment[];
  readonly savedShifts: CashShiftSession[];
  readonly savedUsers: User[];
  readonly savedProfiles: SecurityProfile[];
  readonly kardexInserts: Array<{ sql: string; params: unknown[] }>;
  readonly mocks: {
    findOneTenant: jest.Mock;
    seedDefaults: jest.Mock;
    changePlan: jest.Mock;
    configureFiscalSetup: jest.Mock;
    uploadLogo: jest.Mock;
    applyTemplate: jest.Mock;
    createTopology: jest.Mock;
    generateLinkingCode: jest.Mock;
  };
}

function createMockOrchestrationContext(options?: {
  existingTenant?: { id: string; name: string; slug: string } | null;
  catalogSeedCount?: number;
}): MockOrchestrationContext {
  const savedInvoices: Invoice[] = [];
  const savedPayments: Payment[] = [];
  const savedShifts: CashShiftSession[] = [];
  const savedUsers: User[] = [];
  const savedProfiles: SecurityProfile[] = [];
  const kardexInserts: Array<{ sql: string; params: unknown[] }> = [];

  let userSeq = 0;
  let invSeq = 0;
  let shiftSeq = 0;

  const seededInsumos: Partial<Insumo>[] = [
    {
      id: 'insumo-1',
      name: 'Café en Grano',
      parLevel: 5000,
      minStock: 1000,
      stock: 0,
      existenciaActual: 0,
      averageCost: 0,
    },
    {
      id: 'insumo-2',
      name: 'Leche Entera',
      parLevel: 0,
      minStock: 2000,
      stock: 0,
      existenciaActual: 0,
      averageCost: 0,
    },
  ];

  const seededProducts: Partial<Product>[] = [
    {
      id: 'prod-1',
      name: 'Café Americano',
      product_type: ProductType.COMPOUND,
      sellPrice: 75,
      tax_rate: 0,
      stock: 0,
      averageCost: 0,
      is_active: true,
    },
    {
      id: 'prod-2',
      name: 'Agua Embotellada',
      product_type: ProductType.SIMPLE,
      sellPrice: 30,
      tax_rate: 0,
      stock: 0,
      averageCost: 0,
      is_active: true,
    },
  ];

  const fakeManager = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO inventory_kardex')) {
        kardexInserts.push({ sql, params: params ?? [] });
      }
      return [];
    }),
    create: jest.fn((_entity: unknown, plain: Record<string, unknown>) => ({
      ...plain,
    })),
    save: jest.fn(async (entity: unknown, record: Record<string, unknown>) => {
      if (entity === User) {
        userSeq += 1;
        const saved = { id: `user-uuid-${userSeq}`, ...record } as unknown as User;
        savedUsers.push(saved);
        return saved;
      }
      if (entity === SecurityProfile) {
        const saved = { ...record } as unknown as SecurityProfile;
        savedProfiles.push(saved);
        return saved;
      }
      if (entity === CashShiftSession) {
        shiftSeq += 1;
        const saved = {
          id: `shift-uuid-${shiftSeq}`,
          ...record,
        } as unknown as CashShiftSession;
        savedShifts.push(saved);
        return saved;
      }
      if (entity === Invoice) {
        invSeq += 1;
        const saved = {
          id: `invoice-uuid-${invSeq}`,
          ...record,
        } as unknown as Invoice;
        savedInvoices.push(saved);
        return saved;
      }
      if (entity === Payment) {
        const saved = { ...record } as unknown as Payment;
        savedPayments.push(saved);
        return saved;
      }
      if (entity === InvoiceItem || entity === Tenant || entity === Insumo || entity === Product) {
        return record;
      }
      return record;
    }),
    find: jest.fn(async (entity: unknown) => {
      if (entity === Insumo) {
        return seededInsumos;
      }
      if (entity === Product) {
        return seededProducts;
      }
      return [];
    }),
  } as unknown as EntityManager;

  const findOneTenant = jest.fn(async () => options?.existingTenant ?? null);
  const dataSource = {
    getRepository: jest.fn(() => ({ findOne: findOneTenant })),
    transaction: jest.fn(
      async (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(fakeManager),
    ),
  } as unknown as DataSource;

  const seedDefaults = jest.fn(async () => options?.catalogSeedCount ?? 18);
  const changePlan = jest.fn(async () => ({
    subscriptionId: 'sub-uuid-1',
    planCode: 'PRO',
  }));
  const configureFiscalSetup = jest.fn(async () => ({
    tenantId: 'mock',
  }));
  const uploadLogo = jest.fn(async () => ({
    sha256: 'abc123sha256',
    contentType: 'image/png',
    byteLength: 16,
    base64: 'iVBORw0KGgo=',
  }));
  const applyTemplate = jest.fn(async () => ({
    productsCreated: seededProducts.length,
    insumosCreated: seededInsumos.length,
  }));
  const createTopology = jest.fn(async () => ({
    provisioned: true,
    revision: 1,
  }));
  const generateLinkingCode = jest.fn(async () => ({
    code: 'K7M9P2',
    expiresAt: new Date('2026-11-19T23:00:00.000Z'),
  }));

  const deps: ProspectDemoDeps = {
    dataSource,
    catalogService: { seedDefaults } as unknown as ProspectDemoDeps['catalogService'],
    tenantSubscriptionService: {
      changePlan,
    } as unknown as ProspectDemoDeps['tenantSubscriptionService'],
    fiscalSetupService: {
      configureFiscalSetup,
    } as unknown as ProspectDemoDeps['fiscalSetupService'],
    companyLogoService: {
      uploadLogo,
    } as unknown as ProspectDemoDeps['companyLogoService'],
    industryTemplateService: {
      applyTemplate,
    } as unknown as ProspectDemoDeps['industryTemplateService'],
    tenantTopologyRevisionService: {
      create: createTopology,
    } as unknown as ProspectDemoDeps['tenantTopologyRevisionService'],
    deviceLinkingService: {
      generateLinkingCode,
    } as unknown as ProspectDemoDeps['deviceLinkingService'],
    readLogoFile: () => Buffer.from('fake-png-bytes'),
    hashSecret: async (plain: string) => `hashed:${plain}`,
  };

  return {
    deps,
    savedInvoices,
    savedPayments,
    savedShifts,
    savedUsers,
    savedProfiles,
    kardexInserts,
    mocks: {
      findOneTenant,
      seedDefaults,
      changePlan,
      configureFiscalSetup,
      uploadLogo,
      applyTemplate,
      createTopology,
      generateLinkingCode,
    },
  };
}

describe('seed-prospect-demo unit & triangulation suite', () => {
  describe('normalizeDemoSlug', () => {
    it.each([
      ['Café Central', 'demo-cafe-central'],
      ['Doña María & Hijos!', 'demo-dona-maria-hijos'],
      ['El Fogón   Nica #1', 'demo-el-fogon-nica-1'],
      ['Demo Express', 'demo-express'],
      ['Restaurante Árbol de Vida', 'demo-restaurante-arbol-de-vida'],
    ])('normalizes "%s" -> "%s"', (input, expected) => {
      expect(normalizeDemoSlug(input)).toBe(expected);
    });

    it('caps long names at 50 characters without trailing dashes', () => {
      const slug = normalizeDemoSlug(
        'Super Cafetería y Restaurante Artesanal de Especialidad Managua Norte',
      );
      expect(slug.startsWith('demo-')).toBe(true);
      expect(slug.length).toBeLessThanOrEqual(50);
      expect(slug.endsWith('-')).toBe(false);
    });

    it('rejects empty or symbol-only names', () => {
      expect(() => normalizeDemoSlug('   !!!   ')).toThrow(ProspectDemoArgsError);
    });
  });

  describe('parseArgs triangulation', () => {
    it('returns help=true for --help and -h', () => {
      expect(parseArgs(['--help'])).toEqual({ help: true });
      expect(parseArgs(['-h'])).toEqual({ help: true });
    });

    it('applies exact defaults when only --name is passed', () => {
      const parsed = parseArgs(['--name', 'Café Central']);
      expect(isProspectDemoConfig(parsed)).toBe(true);
      if (!isProspectDemoConfig(parsed)) return;

      expect(parsed).toEqual({
        help: false,
        name: 'Café Central',
        slug: 'demo-cafe-central',
        vertical: 'cafeteria',
        templateCode: 'CAFETERIA',
        mode: TenantOperationMode.FOODPARK_QSR,
        fx: DEFAULT_FX_RATE,
        logoPath: null,
        planCode: DEFAULT_PLAN_CODE,
        supportTier: 'priority',
        invoices: DEFAULT_INVOICE_COUNT,
        email: 'admin@demo-cafe-central.nhilos.demo',
        password: DEFAULT_DEMO_PASSWORD,
      });
    });

    it.each<[DemoVertical, string, TenantOperationMode]>([
      ['cafeteria', 'CAFETERIA', TenantOperationMode.FOODPARK_QSR],
      ['restaurante', 'BAR_RESTAURANTE', TenantOperationMode.RESTAURANT],
      ['foodpark', 'BAR_RESTAURANTE', TenantOperationMode.FOODPARK_QSR],
      ['retail', 'RETAIL_MINIMARKET', TenantOperationMode.FOODPARK_QSR],
    ])(
      'maps vertical "%s" -> template "%s" and default mode "%s"',
      (vertical, expectedTemplate, expectedMode) => {
        const parsed = parseArgs(['--name', 'Negocio Prueba', '--vertical', vertical]);
        expect(isProspectDemoConfig(parsed)).toBe(true);
        if (!isProspectDemoConfig(parsed)) return;

        expect(parsed.vertical).toBe(vertical);
        expect(parsed.templateCode).toBe(expectedTemplate);
        expect(parsed.mode).toBe(expectedMode);
      },
    );

    it.each<TenantOperationMode>([
      TenantOperationMode.FOODPARK_QSR,
      TenantOperationMode.RESTAURANT,
      TenantOperationMode.HYBRID,
    ])('supports explicit --mode=%s override', (mode) => {
      const parsed = parseArgs([
        '--name=Mi Local',
        '--vertical=cafeteria',
        `--mode=${mode}`,
      ]);
      expect(isProspectDemoConfig(parsed)).toBe(true);
      if (!isProspectDemoConfig(parsed)) return;

      expect(parsed.mode).toBe(mode);
    });

    it.each([10, 36.62, 36.85, 100])('accepts valid --fx %s', (fx) => {
      const parsed = parseArgs(['--name', 'FX Test', '--fx', String(fx)]);
      expect(isProspectDemoConfig(parsed)).toBe(true);
      if (!isProspectDemoConfig(parsed)) return;
      expect(parsed.fx).toBe(fx);
    });

    it.each(['0', '-10', '9.99', '100.01', 'abc'])(
      'rejects invalid --fx %s',
      (badFx) => {
        try {
          parseArgs(['--name', 'FX Test', '--fx', badFx]);
          fail('Expected ProspectDemoArgsError');
        } catch (error) {
          expect(error).toBeInstanceOf(ProspectDemoArgsError);
          expect((error as ProspectDemoArgsError).code).toBe(
            PROSPECT_DEMO_ERROR_CODES.INVALID_FX,
          );
        }
      },
    );

    it.each([0, 1, 24, 100])('accepts valid --invoices %s', (count) => {
      const parsed = parseArgs(['--name', 'Inv Test', '--invoices', String(count)]);
      expect(isProspectDemoConfig(parsed)).toBe(true);
      if (!isProspectDemoConfig(parsed)) return;
      expect(parsed.invoices).toBe(count);
    });

    it.each(['-1', '101', '12.5', 'abc', ''])(
      'rejects invalid --invoices "%s"',
      (badCount) => {
        try {
          parseArgs(['--name', 'Inv Test', `--invoices=${badCount}`]);
          fail('Expected ProspectDemoArgsError');
        } catch (error) {
          expect(error).toBeInstanceOf(ProspectDemoArgsError);
          expect((error as ProspectDemoArgsError).code).toBe(
            PROSPECT_DEMO_ERROR_CODES.INVALID_INVOICES,
          );
        }
      },
    );

    it('validates --logo exists, is readable, and ends with .png', () => {
      const okParsed = parseArgs(
        ['--name', 'Logo Test', '--logo', './assets/logo.png'],
        { checkFileReadable: () => true },
      );
      expect(isProspectDemoConfig(okParsed)).toBe(true);
      if (isProspectDemoConfig(okParsed)) {
        expect(okParsed.logoPath).toBe(path.resolve('./assets/logo.png'));
      }

      expect(() =>
        parseArgs(['--name', 'Logo Test', '--logo', './assets/logo.jpg'], {
          checkFileReadable: () => true,
        }),
      ).toThrow(ProspectDemoArgsError);

      expect(() =>
        parseArgs(['--name', 'Logo Test', '--logo', './missing.png'], {
          checkFileReadable: () => false,
        }),
      ).toThrow(ProspectDemoArgsError);
    });

    it('rejects missing --name, unknown flags, invalid plan, and short passwords', () => {
      expect(() => parseArgs([])).toThrow(ProspectDemoArgsError);
      expect(() => parseArgs(['--name', 'A', '--unknown', '1'])).toThrow(
        ProspectDemoArgsError,
      );
      expect(() => parseArgs(['--name', 'A', '--plan', 'INVALID'])).toThrow(
        ProspectDemoArgsError,
      );
      expect(() => parseArgs(['--name', 'A', '--password', 'short'])).toThrow(
        ProspectDemoArgsError,
      );
    });
  });

  describe('production safety guard', () => {
    it.each([
      { NODE_ENV: 'development' },
      { NODE_ENV: 'test' },
      { NODE_ENV: 'staging' },
      {},
    ])('allows non-production env %j', (env) => {
      expect(() => assertNotProductionEnvironment(env)).not.toThrow();
    });

    it.each([
      { NODE_ENV: 'production' },
      { APP_ENV: 'production' },
      { RAILWAY_ENVIRONMENT: 'production' },
      { RENDER_ENV: 'prod' },
    ])('blocks production env %j by default', (env) => {
      try {
        assertNotProductionEnvironment(env);
        fail('Expected ProspectDemoGuardError');
      } catch (error) {
        expect(error).toBeInstanceOf(ProspectDemoGuardError);
        expect((error as ProspectDemoGuardError).code).toBe(
          PROSPECT_DEMO_ERROR_CODES.PRODUCTION_FORBIDDEN,
        );
      }
    });

    it('allows production only with explicit acknowledgement token', () => {
      expect(() =>
        assertNotProductionEnvironment({
          NODE_ENV: 'production',
          [ALLOW_PRODUCTION_DEMO_SEED_ENV]: ALLOW_PRODUCTION_DEMO_SEED_TOKEN,
        }),
      ).not.toThrow();
    });
  });

  describe('restaurant topology & historical invoice plan helpers', () => {
    it('enables restaurant tables ONLY for RESTAURANT and HYBRID modes', () => {
      expect(shouldSeedRestaurantTables(TenantOperationMode.RESTAURANT)).toBe(
        true,
      );
      expect(shouldSeedRestaurantTables(TenantOperationMode.HYBRID)).toBe(true);
      expect(shouldSeedRestaurantTables(TenantOperationMode.FOODPARK_QSR)).toBe(
        false,
      );

      const topology = buildDefaultRestaurantTopology(
        TenantOperationMode.RESTAURANT,
      );
      expect(topology.contractVersion).toBe(1);
      expect(topology.topology.tableCount).toBe(10);
      expect(topology.hash).toHaveLength(64);
    });

    it('generates deterministic 7-day invoice plans with mixed payments and 1 pending voucher', () => {
      const now = new Date('2026-11-19T18:00:00.000Z');
      const plan = buildHistoricalInvoicePlan(
        12,
        [
          { id: 'p1', name: 'Americano', sellPrice: 80, taxRate: 0 },
          { id: 'p2', name: 'Croissant', sellPrice: 95, taxRate: 0 },
        ],
        36.62,
        now,
      );

      expect(plan).toHaveLength(12);
      expect(plan[0].number).toBe('A-000001');
      expect(plan[11].number).toBe('A-000012');

      const methods = new Set(plan.map((inv) => inv.payment.method));
      expect(methods).toEqual(new Set(['CASH', 'USD', 'CARD']));

      const pendingVouchers = plan.filter(
        (inv) => inv.payment.reconciliationStatus === 'PENDING_RECONCILIATION',
      );
      expect(pendingVouchers).toHaveLength(1);
      expect(pendingVouchers[0].payment.method).toBe('CARD');

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      for (const inv of plan) {
        expect(inv.issuedAt.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(now.getTime() - inv.issuedAt.getTime()).toBeLessThanOrEqual(
          sevenDaysMs,
        );
      }

      expect(buildHistoricalInvoicePlan(0, [], 36.62, now)).toEqual([]);
    });
  });

  describe('seedProspectDemo orchestration', () => {
    const baseConfig = (
      overrides: Partial<ProspectDemoConfig> = {},
    ): ProspectDemoConfig => ({
      help: false,
      name: 'Café Central',
      slug: 'demo-cafe-central',
      vertical: 'cafeteria',
      templateCode: 'CAFETERIA',
      mode: TenantOperationMode.FOODPARK_QSR,
      fx: 36.62,
      logoPath: null,
      planCode: 'PRO',
      supportTier: 'priority',
      invoices: 6,
      email: 'admin@demo-cafe-central.nhilos.demo',
      password: DEFAULT_DEMO_PASSWORD,
      ...overrides,
    });

    it('rejects production environment before touching the database', async () => {
      const ctx = createMockOrchestrationContext();
      await expect(
        seedProspectDemo(baseConfig(), ctx.deps, { NODE_ENV: 'production' }),
      ).rejects.toMatchObject({
        code: PROSPECT_DEMO_ERROR_CODES.PRODUCTION_FORBIDDEN,
      });
      expect(ctx.mocks.findOneTenant).not.toHaveBeenCalled();
    });

    it('fails gracefully on duplicate slug without destroying existing tenant', async () => {
      const ctx = createMockOrchestrationContext({
        existingTenant: {
          id: 'existing-id',
          name: 'Café Central',
          slug: 'demo-cafe-central',
        },
      });
      await expect(
        seedProspectDemo(baseConfig(), ctx.deps, { NODE_ENV: 'test' }),
      ).rejects.toMatchObject({
        code: PROSPECT_DEMO_ERROR_CODES.DUPLICATE_SLUG,
      });
      expect(ctx.mocks.seedDefaults).not.toHaveBeenCalled();
    });

    it('provisions cafeteria + FOODPARK_QSR without tables or logo, with opening stock, invoices, and linking code', async () => {
      const ctx = createMockOrchestrationContext();
      const result = await seedProspectDemo(baseConfig(), ctx.deps, {
        NODE_ENV: 'test',
      });

      expect(result.tenantName).toBe('Café Central');
      expect(result.slug).toBe('demo-cafe-central');
      expect(result.templateCode).toBe('CAFETERIA');
      expect(result.mode).toBe(TenantOperationMode.FOODPARK_QSR);
      expect(result.logoUploaded).toBe(false);
      expect(result.restaurantTablesSeeded).toBe(0);
      expect(result.openingInsumosSeeded).toBe(2);
      expect(result.openingProductsSeeded).toBe(1);
      expect(result.invoicesCreated).toBe(6);
      expect(result.linkingCode).toBe('K7M9P2');

      // 3 users with hashed PINs & passwords
      expect(ctx.savedUsers).toHaveLength(3);
      expect(ctx.savedUsers.map((u) => u.role)).toEqual([
        UserRole.OWNER,
        UserRole.CASHIER,
        UserRole.MANAGER,
      ]);
      expect(ctx.savedProfiles.map((p) => p.pin_hash)).toEqual([
        `hashed:${DEMO_USER_PINS.OWNER}`,
        `hashed:${DEMO_USER_PINS.CASHIER}`,
        `hashed:${DEMO_USER_PINS.SUPERVISOR}`,
      ]);

      // Real NestJS services invoked in pipeline
      expect(ctx.mocks.seedDefaults).toHaveBeenCalledWith(result.tenantId);
      expect(ctx.mocks.changePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: result.tenantId,
          planCode: 'PRO',
          actor: 'admin@demo-cafe-central.nhilos.demo',
        }),
      );
      expect(ctx.mocks.configureFiscalSetup).toHaveBeenCalledWith(
        result.tenantId,
        expect.objectContaining({
          regime: FiscalRegime.CUOTA_FIJA,
          ruc: DEFAULT_DEMO_RUC,
          commercialFxSpread: 36.62,
          operationMode: TenantOperationMode.FOODPARK_QSR,
          checkoutFxMode: CheckoutFxMode.COMMERCIAL,
        }),
        result.users.owner.id,
      );
      expect(ctx.mocks.uploadLogo).not.toHaveBeenCalled();
      expect(ctx.mocks.applyTemplate).toHaveBeenCalledWith(
        result.tenantId,
        'CAFETERIA',
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
        result.users.owner.id,
      );
      expect(ctx.mocks.createTopology).not.toHaveBeenCalled();

      // Opening kardex + shift + invoices + linking code bound to OWNER id
      expect(ctx.kardexInserts).toHaveLength(2);
      expect(ctx.savedShifts).toHaveLength(1);
      expect(ctx.savedInvoices).toHaveLength(6);
      expect(ctx.savedPayments).toHaveLength(6);
      expect(ctx.mocks.generateLinkingCode).toHaveBeenCalledWith(
        result.tenantId,
        result.users.owner.id,
        { expiryMinutes: 120 },
      );

      // Summary formatting
      const summary = formatSummary(result);
      expect(summary).toContain('Café Central');
      expect(summary).toContain(result.linkingCode);
      expect(summary).toContain(`adb shell pm clear ${POS_ANDROID_PACKAGE_ID}`);
    });

    it('uploads logo, seeds restaurant tables for RESTAURANT/HYBRID, and skips invoices when --invoices 0', async () => {
      const ctx = createMockOrchestrationContext();
      const result = await seedProspectDemo(
        baseConfig({
          name: 'Asados Don Pepe',
          slug: 'demo-asados-don-pepe',
          vertical: 'restaurante',
          templateCode: 'BAR_RESTAURANTE',
          mode: TenantOperationMode.RESTAURANT,
          logoPath: '/tmp/logo.png',
          invoices: 0,
        }),
        ctx.deps,
        { NODE_ENV: 'test' },
      );

      expect(result.logoUploaded).toBe(true);
      expect(result.logoSha256).toBe('abc123sha256');
      expect(result.restaurantTablesSeeded).toBe(10);
      expect(result.invoicesCreated).toBe(0);

      expect(ctx.mocks.uploadLogo).toHaveBeenCalledWith(result.tenantId, {
        content_type: 'image/png',
        data: Buffer.from('fake-png-bytes').toString('base64'),
      });
      expect(ctx.mocks.createTopology).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: result.tenantId,
          baseRevision: 0,
          contractVersion: 1,
        }),
      );
      expect(ctx.savedInvoices).toHaveLength(0);
      expect(ctx.savedShifts).toHaveLength(1);
    });

    it('fails via provision-seed-guard when CatalogService.seedDefaults writes 0 rows', async () => {
      const ctx = createMockOrchestrationContext({ catalogSeedCount: 0 });
      await expect(
        seedProspectDemo(baseConfig(), ctx.deps, { NODE_ENV: 'test' }),
      ).rejects.toThrow('Catalog seeding wrote 0 values');
    });

    it('seeds complete DGI authorization metadata and contact fields in configureFiscalSetup', async () => {
      const ctx = createMockOrchestrationContext();
      await seedProspectDemo(baseConfig(), ctx.deps, { NODE_ENV: 'test' });

      expect(ctx.mocks.configureFiscalSetup).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dgiAuthorizationCode: 'DGI-DEMO-2026-001',
          dgiAuthorizationIssuedAt: '2026-01-01',
          dgiAuthorizationExpiresAt: '2027-12-31',
          phone: '+505 8194 8526',
          address: 'Managua, Nicaragua',
        }),
        expect.any(String),
      );
    });
  });
});
