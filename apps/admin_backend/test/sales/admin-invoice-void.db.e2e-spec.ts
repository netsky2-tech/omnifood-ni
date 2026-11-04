import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../src/modules/inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../src/modules/inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../src/modules/inventory/entities/inventory-sync-outbox.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { ProductInventoryMappingVersion } from '../../src/modules/inventory/entities/product-inventory-mapping-version.entity';
import { Batch } from '../../src/modules/inventory/entities/batch.entity';
import { BatchOutflowTrace } from '../../src/modules/inventory/entities/batch-outflow-trace.entity';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { InvoicesService } from '../../src/modules/sales/services/invoices.service';
import { InboundSyncService } from '../../src/modules/sales/services/inbound-sync.service';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { BomExplosionService } from '../../src/modules/inventory/bom-explosion.service';
import { NotFoundException } from '@nestjs/common';
import { runInTenantTransaction } from '../../src/core/database/tenant-transaction';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('Admin invoice void & DGI sequence closure (Real PostgreSQL DB, migration-built schema with RLS)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let invoicesService: InvoicesService;
  let inboundSyncService: InboundSyncService;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const insumoAId = randomUUID();
  const productAId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      entities: [
        Tenant,
        User,
        SecurityProfile,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        Insumo,
        UomConversion,
        Product,
        ProductInventoryMappingVersion,
        Batch,
        BatchOutflowTrace,
        InventoryMovement,
        InventorySyncReceipt,
        InventorySyncOutbox,
        AuditLog,
      ],
      synchronize: false,
      logging: false,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        Tenant,
        User,
        SecurityProfile,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        Insumo,
        UomConversion,
        Product,
        ProductInventoryMappingVersion,
        Batch,
        BatchOutflowTrace,
        InventoryMovement,
        InventorySyncReceipt,
        InventorySyncOutbox,
        AuditLog,
      ],
      synchronize: false,
      logging: false,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await runtime.initialize();

    const recipeServiceMock = {
      findActiveVersion: jest.fn().mockResolvedValue(null),
      getSnapshot: jest.fn(),
    } as unknown as RecipeService;

    const bomExplosionServiceMock = {
      explode: jest.fn(),
    } as unknown as BomExplosionService;

    invoicesService = new InvoicesService(
      runtime,
      runtime.getRepository(Invoice),
      runtime.getRepository(InvoiceItem),
      runtime.getRepository(Payment),
      runtime.getRepository(User),
      runtime.getRepository(InventoryMovement),
      runtime.getRepository(InventorySyncReceipt),
      runtime.getRepository(InventorySyncOutbox),
      recipeServiceMock,
      bomExplosionServiceMock,
    );

    inboundSyncService = new InboundSyncService(
      runtime.getRepository(Invoice),
      runtime.getRepository(Invoice),
      runtime.getRepository(Insumo),
      runtime.getRepository(Invoice),
      runtime.getRepository(Invoice),
      runtime.getRepository(Invoice),
      runtime.getRepository(User),
    );

    // Seed Tenants
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        tenantAId,
        'Tenant Alpha (SOHO)',
        normalizeTenantSlug(`alpha-${fixture.schema}`),
        tenantBId,
        'Tenant Beta (Bar)',
        normalizeTenantSlug(`beta-${fixture.schema}`),
      ],
    );

    // Seed Users
    await admin.query(
      `INSERT INTO users (id, tenant_id, name, email, role, password_hash)
       VALUES ($1, $2, 'Owner Alpha', 'owner-a@test.local', 'OWNER', 'hash-a'),
              ($3, $4, 'Owner Beta', 'owner-b@test.local', 'OWNER', 'hash-b')`,
      [userAId, tenantAId, userBId, tenantBId],
    );

    // Seed Insumo for Tenant A
    await admin.query(
      `INSERT INTO insumos (id, tenant_id, name, stock, existencia_actual, costo_promedio_nio, negative_stock_policy, "purchaseUom", "consumptionUom", "conversionFactor")
       VALUES ($1, $2, 'Carne Molida Premium', 50.0, 50.0, 45.0, 'ALLOW_TEMPORARY', 'kg', 'g', 1000.0)`,
      [insumoAId, tenantAId],
    );

    // Seed Product for Tenant A
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom, product_type)
       VALUES ($1, $2, 'Hamburguesa Doble', 'und', 'SIMPLE')`,
      [productAId, tenantAId],
    );

    // Initial stock movement so Kardex trigger invariant matches stock_after = 52.0
    await admin.query(
      `INSERT INTO inventory_kardex (tenant_id, insumo_id, movement_type, quantity, stock_before, stock_after, unit_cost_nio, average_cost_after_nio, total_cost_nio, occurred_at, source_device_id, source_document_type, source_document_id)
       VALUES ($1, $2, 'INITIAL_STOCK', 52.0, 0.0, 52.0, 45.0, 45.0, 2340.0, NOW(), 'SEED', 'INITIAL_STOCK', 'SEED')`,
      [tenantAId, insumoAId],
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('S1: voids a regular invoice from the Backoffice, reverts stock in Kardex and logs SHA-256 audit entry under RLS', async () => {
    const invoiceId = randomUUID();
    let movementId = '';

    // Seed Invoice and Sale Movement in Tenant A
    await runInTenantTransaction(runtime, tenantAId, async (manager) => {
      const invRepo = manager.getRepository(Invoice);
      await invRepo.save(
        invRepo.create({
          id: invoiceId,
          tenant_id: tenantAId,
          number: '001-001-01-00000010',
          created_at: new Date('2026-11-01T12:00:00Z'),
          userId: userAId,
          subtotal: 90.0,
          totalTax: 13.5,
          total: 103.5,
          isCanceled: false,
          voidReason: null,
          paymentStatus: 'paid',
          globalTaxOverride: false,
          type: 'regular',
        }),
      );

      const movRepo = manager.getRepository(InventoryMovement);
      const savedMov = await movRepo.save(
        movRepo.create({
          tenant_id: tenantAId,
          insumoId: insumoAId,
          type: MovementType.SALE,
          quantity: -2.0,
          previousStock: 52.0,
          newStock: 50.0,
          unitCostNio: 45.0,
          averageCostAfterNio: 45.0,
          totalCostNio: 90.0,
          idempotencyKey: `sale:${invoiceId}:1`,
          sourceDeviceId: 'POS-01',
          sourceDocumentId: `invoice:${invoiceId}`,
          sourceDocumentType: MovementType.SALE,
          timestamp: new Date('2026-11-01T12:00:00Z'),
          user_id: userAId,
        }),
      );
      movementId = savedMov.id;
    });

    // Execute Administrative Void from Backoffice
    const result = await invoicesService.voidAdminInvoice(
      tenantAId,
      invoiceId,
      {
        reason: 'ERROR_DE_CAPTURA',
        reasonDetail: 'Ticket cobrado dos veces por error de operario',
      },
      { userId: userAId, role: UserRole.OWNER },
    );

    expect(result.id).toBe(invoiceId);
    expect(result.isCanceled).toBe(true);
    expect(result.voidReason).toContain('ERROR_DE_CAPTURA');

    // Verify Invoices table in PostgreSQL
    await runInTenantTransaction(runtime, tenantAId, async (manager) => {
      const savedInvoice = await manager
        .getRepository(Invoice)
        .findOneBy({ id: invoiceId });
      expect(savedInvoice).toBeDefined();
      expect(savedInvoice.isCanceled).toBe(true);
      expect(savedInvoice.voidReason).toBe(
        'ERROR_DE_CAPTURA \u2014 Ticket cobrado dos veces por error de operario',
      );

      // Verify Insumo stock was restored in PostgreSQL
      const insumo = await manager
        .getRepository(Insumo)
        .findOneBy({ id: insumoAId });
      expect(Number(insumo.stock)).toBe(52.0); // 50 + 2 restored

      // Verify Compensating SALE_CANCEL movement exists in Kardex
      const cancelMov = await manager.getRepository(InventoryMovement).findOne({
        where: {
          tenant_id: tenantAId,
          sourceDocumentId: `invoice:${invoiceId}`,
          type: MovementType.SALE_CANCEL,
        },
      });
      expect(cancelMov).toBeDefined();
      expect(Number(cancelMov.quantity)).toBe(2.0);
      expect(cancelMov.compensationForKardexId).toBe(movementId);
      expect(cancelMov.sourceDeviceId).toBe('WEB_ADMIN');

      // Verify Hash-chained Audit Log was written in PostgreSQL
      const auditLog = await manager.getRepository(AuditLog).findOne({
        where: {
          tenant_id: tenantAId,
          action: 'ADMIN_INVOICE_VOIDED',
          target_id: invoiceId,
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.device_id).toBe('WEB_ADMIN');
      expect(auditLog.sequence_no).toBe(1);
      expect(auditLog.prev_hash).toBe('GENESIS');
      expect(auditLog.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('Multi-tenant isolation: Tenant B cannot void an invoice belonging to Tenant A', async () => {
    const invoiceId = randomUUID();

    // Seed Invoice in Tenant A
    await runInTenantTransaction(runtime, tenantAId, async (manager) => {
      const invRepo = manager.getRepository(Invoice);
      await invRepo.save(
        invRepo.create({
          id: invoiceId,
          tenant_id: tenantAId,
          number: '001-001-01-00000011',
          created_at: new Date('2026-11-02T12:00:00Z'),
          userId: userAId,
          subtotal: 50.0,
          totalTax: 7.5,
          total: 57.5,
          isCanceled: false,
          voidReason: null,
          paymentStatus: 'paid',
          globalTaxOverride: false,
          type: 'regular',
        }),
      );
    });

    // Attempt to void Tenant A's invoice from Tenant B context
    await expect(
      invoicesService.voidAdminInvoice(
        tenantBId,
        invoiceId,
        { reason: 'INTENTO_ILEGITIMO' },
        { userId: userBId, role: UserRole.OWNER },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('S2/S8: ingests SALE_CANCEL for an unsynced sale, closing the DGI sequence gap WITHOUT adding phantom stock', async () => {
    const unsyncedInvoiceId = randomUUID();
    const unsyncedNumber = '001-001-01-00000012';

    // Verify stock before ingestion
    let stockBefore = 0;
    await runInTenantTransaction(runtime, tenantAId, async (manager) => {
      const insumo = await manager
        .getRepository(Insumo)
        .findOneBy({ id: insumoAId });
      stockBefore = Number(insumo.stock);
    });

    // Terminal pushes SALE_CANCEL for an invoice that was never previously accepted by the cloud
    await invoicesService.syncBatch(tenantAId, [
      {
        idempotencyKey: `cancel:${unsyncedInvoiceId}`,
        sourceDeviceId: 'POS-UNSYNCED-01',
        sourceSequence: 1,
        flowType: 'inventory',
        documentType: 'SALE_CANCEL',
        invoice: {
          id: unsyncedInvoiceId,
          number: unsyncedNumber,
          createdAt: '2026-11-03T10:00:00Z',
          userId: userAId,
          subtotal: 40.0,
          totalTax: 6.0,
          total: 46.0,
          isCanceled: true,
          voidReason: 'CLIENTE_DESISTE',
          paymentStatus: 'paid',
          type: 'regular',
          payments: [
            {
              id: randomUUID(),
              method: 'cash',
              amount: 46.0,
              currency: 'NIO',
              exchangeRate: 1.0,
            },
          ],
          items: [
            {
              id: randomUUID(),
              productId: productAId,
              productName: 'Hamburguesa Doble',
              quantity: 1,
              unitPrice: 40.0,
              originalTaxRate: 15.0,
              appliedTaxRate: 15.0,
              taxAmount: 6.0,
              discount: 0.0,
              total: 46.0,
            },
          ],
        },
      },
    ]);

    // Verify:
    // 1. The DGI sequence number exists in PostgreSQL as canceled (NO GAP in series).
    // 2. insumo stock was NOT increased (NO phantom stock created).
    await runInTenantTransaction(runtime, tenantAId, async (manager) => {
      const invoice = await manager
        .getRepository(Invoice)
        .findOneBy({ id: unsyncedInvoiceId });
      expect(invoice).toBeDefined();
      expect(invoice.number).toBe(unsyncedNumber);
      expect(invoice.isCanceled).toBe(true);
      expect(invoice.voidReason).toBe('CLIENTE_DESISTE');

      const insumo = await manager
        .getRepository(Insumo)
        .findOneBy({ id: insumoAId });
      expect(Number(insumo.stock)).toBe(stockBefore); // Exactly unchanged!
    });
  });

  it('T3: delivers voided regular invoices through inbound deltas to sync down to the terminal', async () => {
    const pullResult = await runInTenantTransaction(
      runtime,
      tenantAId,
      async (manager) => {
        return inboundSyncService.getInboundDeltas(
          tenantAId,
          { types: 'voidedinvoices', since: '2026-11-01T00:00:00Z' },
          undefined,
          manager,
        );
      },
    );

    expect(pullResult.status).toBe('success');
    expect(pullResult.deltas.voidedInvoices).toBeDefined();
    expect(pullResult.deltas.voidedInvoices.length).toBeGreaterThanOrEqual(1);

    const voided = pullResult.deltas.voidedInvoices.find((v) => v.isCanceled);
    expect(voided).toBeDefined();
    expect(voided.number).toMatch(/001-001-01-/);
  });
});
