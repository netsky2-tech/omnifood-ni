import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { currentLocalDateKey } from '../../../core/reporting/reporting-period';
import { AuditLog } from '../../identity/entities/audit-log.entity';
import { SecurityProfile } from '../../identity/entities/security-profile.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { Batch } from '../../inventory/entities/batch.entity';
import { BatchOutflowTrace } from '../../inventory/entities/batch-outflow-trace.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { InventoryDivergence } from '../../inventory/entities/inventory-divergence.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { InvoicesService } from './invoices.service';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('InvoicesService DT 09-2007 S2 (real PostgreSQL DB)', () => {
  const TEST_TIMEOUT_MS = 45000;

  async function createDbTestHarness() {
    const fixture = await createMigrationBuiltSchemaFixture();
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      entities: [
        Tenant,
        User,
        SecurityProfile,
        AuditLog,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        Insumo,
        Product,
        ProductInventoryMappingVersion,
        InventoryMovement,
        UomConversion,
        Batch,
        BatchOutflowTrace,
        InventorySyncOutbox,
        InventorySyncReceipt,
        InventoryDivergence,
        SystemParametersConfig,
        SystemParametersConfigActiveView,
      ],
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${fixture.schema},public -c statement_timeout=15000`,
      },
    });
    await dataSource.initialize();

    const service = new InvoicesService(
      dataSource,
      dataSource.getRepository(Invoice),
      dataSource.getRepository(InvoiceItem),
      dataSource.getRepository(Payment),
      dataSource.getRepository(User),
      dataSource.getRepository(InventoryMovement),
      dataSource.getRepository(InventorySyncReceipt),
      dataSource.getRepository(InventorySyncOutbox),
      { findActiveVersion: jest.fn(), getSnapshot: jest.fn() } as never,
      { explode: jest.fn(), explodeRecipe: jest.fn() } as never,
    );

    return { fixture, dataSource, service };
  }

  it(
    'enforces DT 09-2007 3.4.b same-day vs cross-day void in voidAdminInvoice and syncBatch SALE_CANCEL',
    async () => {
      const { fixture, dataSource, service } = await createDbTestHarness();
      try {
        const tenantId = randomUUID();
        const ownerId = randomUUID();
        const insumoId = randomUUID();
        const sameDayInvId = randomUUID();
        const crossDayInvId = randomUUID();
        const todayManagua = currentLocalDateKey();

        await dataSource.query(
          `INSERT INTO tenants (id, name, slug, created_at, updated_at)
           VALUES ($1, 'DT09 Tenant', $2, now(), now())`,
          [tenantId, normalizeTenantSlug(`dt09-${tenantId.slice(0, 8)}`)],
        );
        await dataSource.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at)
           VALUES ($1, $2, 'owner@dt09.test', 'hash', 'Owner DT09', $3, true, now(), now())`,
          [ownerId, tenantId, UserRole.OWNER],
        );
        await dataSource.getRepository(Insumo).insert({
          id: insumoId,
          tenant_id: tenantId,
          name: 'Café Grano',
          purchaseUom: 'kg',
          consumptionUom: 'g',
          stock: 10,
          existenciaActual: 10,
          averageCost: 20,
        });

        // Same-day regular invoice + SALE movement
        await dataSource.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, local_issue_date, user_id, subtotal, total_tax, total, is_canceled, payment_status, global_tax_override, type, updated_at)
           VALUES ($1, $2, '001-001-01-00000001', now(), $3, $4, 100, 15, 115, false, 'PAID', false, 'regular', now())`,
          [sameDayInvId, tenantId, todayManagua, ownerId],
        );
        await dataSource.getRepository(InventoryMovement).insert({
          tenant_id: tenantId,
          insumoId,
          type: MovementType.PURCHASE,
          quantity: 13,
          previousStock: 0,
          newStock: 13,
          averageCostAfterNio: 20,
          unitCostNio: 20,
          totalCostNio: 260,
          idempotencyKey: `open-${insumoId}`,
          sourceDeviceId: 'POS-1',
          sourceDocumentId: `purchase:${insumoId}`,
          sourceDocumentType: 'PURCHASE',
          timestamp: new Date(),
          user_id: ownerId,
        });
        await dataSource.getRepository(InventoryMovement).insert({
          tenant_id: tenantId,
          insumoId,
          type: MovementType.SALE,
          quantity: -3,
          previousStock: 13,
          newStock: 10,
          averageCostAfterNio: 20,
          unitCostNio: 20,
          totalCostNio: 60,
          idempotencyKey: `sale-${sameDayInvId}`,
          sourceDeviceId: 'POS-1',
          sourceDocumentId: `invoice:${sameDayInvId}`,
          sourceDocumentType: 'SALE',
          timestamp: new Date(),
          user_id: ownerId,
        });

        // Cross-day regular invoice (previous Managua day)
        await dataSource.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, local_issue_date, user_id, subtotal, total_tax, total, is_canceled, payment_status, global_tax_override, type, updated_at)
           VALUES ($1, $2, '001-001-01-00000002', '2026-04-01T18:00:00Z', '2026-04-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', now())`,
          [crossDayInvId, tenantId, ownerId],
        );

        // 1) Cross-day voidAdminInvoice MUST reject with DT 09-2007 3.4.b + Nota de Crédito and zero DB mutation
        await expect(
          service.voidAdminInvoice(
            tenantId,
            crossDayInvId,
            { reason: 'ERROR_DE_CAPTURA' },
            { userId: ownerId, role: UserRole.OWNER },
          ),
        ).rejects.toThrow(BadRequestException);

        const [crossDayRow] = (await dataSource.query(
          `SELECT is_canceled FROM invoices WHERE id = $1`,
          [crossDayInvId],
        )) as Array<{ is_canceled: boolean }>;
        expect(crossDayRow.is_canceled).toBe(false);

        // 2) Cross-day syncBatch SALE_CANCEL MUST reject non-retryably
        const syncResult = await service.syncBatch(tenantId, [
          {
            idempotencyKey: `cancel-cross-day-${crossDayInvId}`,
            sourceDeviceId: 'POS-1',
            sourceSequence: 1,
            flowType: 'sales',
            documentType: 'SALE_CANCEL',
            invoice: {
              id: crossDayInvId,
              number: '001-001-01-00000002',
              createdAt: '2026-04-01T18:00:00.000Z',
              userId: ownerId,
              subtotal: 100,
              totalTax: 15,
              total: 115,
              isCanceled: true,
              voidReason: 'ERROR',
              paymentStatus: 'VOID',
              globalTaxOverride: false,
              items: [],
              payments: [],
            },
          },
        ]);
        expect(syncResult.results?.[0]).toEqual(
          expect.objectContaining({
            status: 'REJECTED',
            code: 'CROSS_DAY_VOID_PROHIBITED',
            retryable: false,
          }),
        );

        // 3) Same-day voidAdminInvoice MUST succeed and restore insumo stock
        const voided = await service.voidAdminInvoice(
          tenantId,
          sameDayInvId,
          { reason: 'ERROR_DE_CAPTURA', reasonDetail: 'Mismo día' },
          { userId: ownerId, role: UserRole.OWNER },
        );
        expect(voided.isCanceled).toBe(true);

        const [insumoAfterVoid] = (await dataSource.query(
          `SELECT stock FROM insumos WHERE id = $1`,
          [insumoId],
        )) as Array<{ stock: string }>;
        expect(Number(insumoAfterVoid.stock)).toBe(13);
      } finally {
        await dataSource.destroy().catch(() => undefined);
        await fixture.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'DT 09-2007 3.4.a: createAdminCreditNote reverses inventory movements in Postgres with consecutive sourceSequence & timestamp, and skips when origin has no movements',
    async () => {
      const { fixture, dataSource, service } = await createDbTestHarness();
      try {
        const tenantId = randomUUID();
        const ownerId = randomUUID();
        const insumoId = randomUUID();
        const productId = randomUUID();
        const originInvId = randomUUID();
        const originItemId = randomUUID();
        const serviceInvId = randomUUID();
        const serviceItemId = randomUUID();

        await dataSource.query(
          `INSERT INTO tenants (id, name, slug, created_at, updated_at)
           VALUES ($1, 'CN Restock Tenant', $2, now(), now())`,
          [tenantId, normalizeTenantSlug(`cn-${tenantId.slice(0, 8)}`)],
        );
        await dataSource.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at)
           VALUES ($1, $2, 'owner@cn.test', 'hash', 'Owner CN', $3, true, now(), now())`,
          [ownerId, tenantId, UserRole.OWNER],
        );
        await dataSource.getRepository(Insumo).insert({
          id: insumoId,
          tenant_id: tenantId,
          name: 'Leche Entera',
          purchaseUom: 'l',
          consumptionUom: 'ml',
          stock: 6,
          existenciaActual: 6,
          averageCost: 25.5,
        });
        await dataSource.getRepository(Product).insert({
          id: productId,
          tenant_id: tenantId,
          name: 'Latte',
          uom: 'unit',
          sellPrice: 50,
        });
        await dataSource.getRepository(SystemParametersConfig).insert({
          tenant_id: tenantId,
          paramKey: 'CREDIT_NOTE_SERIES',
          paramValue: { prefix: 'NC-', nextNumber: 1, endNumber: 100 },
          version: 1,
          createdBy: ownerId,
        });

        // Origin invoice WITH inventory discharge (-4 of insumo)
        await dataSource.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, local_issue_date, user_id, subtotal, total_tax, total, is_canceled, payment_status, global_tax_override, type, bcn_official_rate, commercial_rate, updated_at)
           VALUES ($1, $2, '001-001-01-00000010', '2026-04-01T18:00:00Z', '2026-04-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', 36.6243, 36.6243, now())`,
          [originInvId, tenantId, ownerId],
        );
        await dataSource.query(
          `INSERT INTO invoice_items (id, tenant_id, invoice_id, product_id, product_name, quantity, unit_price, original_tax_rate, applied_tax_rate, tax_amount, total, discount)
           VALUES ($1, $2, $3, $4, 'Latte', 2, 50, 0.15, 0.15, 15, 115, 0)`,
          [originItemId, tenantId, originInvId, productId],
        );
        await dataSource.getRepository(InventoryMovement).insert({
          tenant_id: tenantId,
          insumoId,
          type: MovementType.PURCHASE,
          quantity: 10,
          previousStock: 0,
          newStock: 10,
          averageCostAfterNio: 25.5,
          unitCostNio: 25.5,
          totalCostNio: 255,
          idempotencyKey: `open-${insumoId}`,
          sourceDeviceId: 'POS-1',
          sourceDocumentId: `purchase:${insumoId}`,
          sourceDocumentType: 'PURCHASE',
          timestamp: new Date(),
          user_id: ownerId,
        });
        await dataSource.getRepository(InventoryMovement).insert({
          tenant_id: tenantId,
          insumoId,
          type: MovementType.SALE,
          quantity: -4,
          previousStock: 10,
          newStock: 6,
          averageCostAfterNio: 25.5,
          unitCostNio: 25.5,
          totalCostNio: 102,
          idempotencyKey: `sale-${originInvId}`,
          sourceDeviceId: 'POS-1',
          sourceDocumentId: `invoice:${originInvId}`,
          sourceDocumentType: 'SALE',
          originInvoiceItemId: originItemId,
          timestamp: new Date(),
          user_id: ownerId,
        });

        // Partial credit note (1 of 2) -> restores +2, sourceSequence = '1'
        const cn1 = await service.createAdminCreditNote(
          tenantId,
          {
            originInvoiceId: originInvId,
            refundReasonCode: 'DEVOLUCION_PARCIAL',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [{ originInvoiceItemId: originItemId, quantity: 1 }],
          },
          { userId: ownerId, role: UserRole.OWNER },
        );
        expect(cn1.number).toBe('NC-1');

        // Second partial credit note (remaining 1 of 2) -> restores +2, consecutive sourceSequence = '2'
        const cn2 = await service.createAdminCreditNote(
          tenantId,
          {
            originInvoiceId: originInvId,
            refundReasonCode: 'DEVOLUCION_RESTO',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [{ originInvoiceItemId: originItemId, quantity: 1 }],
          },
          { userId: ownerId, role: UserRole.OWNER },
        );
        expect(cn2.number).toBe('NC-2');

        const [insumoAfter] = (await dataSource.query(
          `SELECT stock FROM insumos WHERE id = $1`,
          [insumoId],
        )) as Array<{ stock: string }>;
        expect(Number(insumoAfter.stock)).toBe(10);

        const cnMovements = await dataSource
          .getRepository(InventoryMovement)
          .find({
            where: {
              tenant_id: tenantId,
              type: MovementType.CREDIT_NOTE_RESTOCK,
            },
            order: { sourceSequence: 'ASC' },
          });
        expect(cnMovements).toHaveLength(2);
        expect(cnMovements[0]).toMatchObject({
          type: MovementType.CREDIT_NOTE_RESTOCK,
          sourceDeviceId: 'WEB_ADMIN',
          sourceSequence: '1',
          sourceDocumentId: cn1.id,
          sourceDocumentType: 'CREDIT_NOTE',
        });
        expect(Number(cnMovements[0].quantity)).toBe(2);
        expect(Number(cnMovements[0].unitCostNio)).toBe(25.5);
        expect(cnMovements[0].timestamp).toBeInstanceOf(Date);
        expect(cnMovements[1]).toMatchObject({
          type: MovementType.CREDIT_NOTE_RESTOCK,
          sourceDeviceId: 'WEB_ADMIN',
          sourceSequence: '2',
          sourceDocumentId: cn2.id,
          sourceDocumentType: 'CREDIT_NOTE',
        });

        // Origin invoice WITHOUT inventory movements (non-inventoried service) -> succeeds cleanly
        await dataSource.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, local_issue_date, user_id, subtotal, total_tax, total, is_canceled, payment_status, global_tax_override, type, bcn_official_rate, commercial_rate, updated_at)
           VALUES ($1, $2, '001-001-01-00000011', '2026-04-01T19:00:00Z', '2026-04-01', $3, 50, 7.5, 57.5, false, 'PAID', false, 'regular', 36.6243, 36.6243, now())`,
          [serviceInvId, tenantId, ownerId],
        );
        await dataSource.query(
          `INSERT INTO invoice_items (id, tenant_id, invoice_id, product_id, product_name, quantity, unit_price, original_tax_rate, applied_tax_rate, tax_amount, total, discount)
           VALUES ($1, $2, $3, $4, 'Servicio Delivery', 1, 50, 0.15, 0.15, 7.5, 57.5, 0)`,
          [serviceItemId, tenantId, serviceInvId, productId],
        );

        const cnService = await service.createAdminCreditNote(
          tenantId,
          {
            originInvoiceId: serviceInvId,
            refundReasonCode: 'SERVICIO_NO_PRESTADO',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [{ originInvoiceItemId: serviceItemId, quantity: 1 }],
          },
          { userId: ownerId, role: UserRole.OWNER },
        );
        expect(cnService.number).toBe('NC-3');

        const [serviceMovCount] = (await dataSource.query(
          `SELECT count(*)::int AS cnt FROM inventory_kardex WHERE tenant_id = $1 AND source_document_id = $2`,
          [tenantId, cnService.id],
        )) as Array<{ cnt: number }>;
        expect(serviceMovCount.cnt).toBe(0);
      } finally {
        await dataSource.destroy().catch(() => undefined);
        await fixture.close();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
