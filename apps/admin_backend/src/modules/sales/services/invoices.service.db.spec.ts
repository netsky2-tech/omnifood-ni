import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner, type Repository } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from '../../../migrations/1766000000000-BohInventoryLedgerFoundation';
import { AddDeterministicSyncSequencing1780000000000 } from '../../../migrations/1780000000000-AddDeterministicSyncSequencing';
import { AddCreditNoteProvenance1782000000000 } from '../../../migrations/1782000000000-AddCreditNoteProvenance';
import { Insumo } from '../../inventory/entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { UserRole } from '../../identity/entities/user.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import type { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import { InvoicesService } from './invoices.service';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed service tests',
    );
  }

  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

interface IsolatedSchemaContext {
  dataSource: DataSource;
  queryRunner: QueryRunner;
  schema: string;
}

interface PgIndexRow {
  indexdef: string;
}

interface AmbientTenantRow {
  tenant: string;
}

interface AuthorizingUserLookup {
  where: {
    id: string;
    tenant_id: string;
  };
}

function createMockAuthorizingUserRepository() {
  return {
    findOne: jest.fn().mockImplementation(({ where }: AuthorizingUserLookup) =>
      Promise.resolve({
        id: where.id,
        tenant_id: where.tenant_id,
        role: UserRole.MANAGER,
        is_active: true,
      }),
    ),
  } as never;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedSchemaContext) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let queryRunner: QueryRunner | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [InventorySyncReceipt, InventorySyncOutbox],
    });
    await dataSource.initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ dataSource, queryRunner, schema });
  } finally {
    try {
      if (queryRunner) {
        await queryRunner.query('SET search_path TO public');
        await queryRunner.release();
      }
    } catch {
      // no-op: cleanup is best effort when bootstrap fails
    }

    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    try {
      if (bootstrap.isInitialized) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.destroy();
      }
    } catch {
      // no-op: cleanup is best effort when bootstrap fails
    }
  }
}

function createService(
  dataSource: DataSource,
  receiptRepository: Repository<InventorySyncReceipt>,
  outboxRepository: Repository<InventorySyncOutbox>,
): InvoicesService {
  const unusedRepository = {} as never;
  const userRepository = createMockAuthorizingUserRepository();
  const recipeService = { findActiveVersion: jest.fn() } as never;
  const bomExplosionService = { explodeRecipe: jest.fn() } as never;

  return new InvoicesService(
    dataSource,
    unusedRepository,
    unusedRepository,
    unusedRepository,
    userRepository,
    unusedRepository,
    receiptRepository,
    outboxRepository,
    recipeService,
    bomExplosionService,
  );
}

describe('InvoicesService deterministic sync sequencing (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'binds tenant context for invoice read paths under FORCE RLS and keeps cross-tenant rows blocked',
    async () => {
      const bootstrap = new DataSource({
        type: 'postgres',
        ...postgresConnection,
      });
      const suffix = randomUUID().replace(/-/g, '');
      const schema = `invoice_reads_rls_${suffix}`;
      const tenantRole = `invoice_reads_rls_role_${suffix}`;
      const tenantAId = randomUUID();
      const tenantBId = randomUUID();
      const invoiceAId = randomUUID();
      const invoiceBId = randomUUID();
      let dataSource: DataSource | null = null;

      try {
        await bootstrap.initialize();
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
        await bootstrap.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
        dataSource = new DataSource({
          type: 'postgres',
          ...postgresConnection,
          schema,
          entities: [
            Tenant,
            Invoice,
            InvoiceItem,
            InvoiceItemModifier,
            Payment,
            InventorySyncReceipt,
            InventorySyncOutbox,
          ],
          synchronize: true,
        });
        await dataSource.initialize();
        await dataSource.query(`SET search_path TO "${schema}"`);
        await dataSource.query(`
          ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
          CREATE POLICY invoice_reads_tenant_select ON invoices
            FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
          GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}";
          GRANT SELECT ON invoices TO "${tenantRole}";
          GRANT SELECT ON invoice_items TO "${tenantRole}";
          GRANT SELECT ON invoice_item_modifiers TO "${tenantRole}";
          GRANT SELECT ON invoice_payments TO "${tenantRole}";
        `);
        await dataSource.query(
          `
          INSERT INTO tenants (id, name, created_at, updated_at) VALUES
            ($1, 'Tenant A', now(), now()),
            ($2, 'Tenant B', now(), now());
        `,
          [tenantAId, tenantBId],
        );
        await dataSource.query(
          `
          INSERT INTO invoices (
            id, tenant_id, invoice_number, created_at, user_id, subtotal,
            total_tax, total, is_canceled, payment_status, global_tax_override,
            type, updated_at
          ) VALUES
            ($1, $2, 'A-001', now(), 'user-a', 10.00, 1.50,
             11.50, false, 'PAID', false, 'regular', now()),
            ($3, $4, 'B-001', now(), 'user-b', 20.00, 3.00,
             23.00, false, 'PAID', false, 'regular', now());
        `,
          [invoiceAId, tenantAId, invoiceBId, tenantBId],
        );

        const unusedRepository = {} as never;
        const userRepository = createMockAuthorizingUserRepository();
        const service = new InvoicesService(
          dataSource,
          dataSource.getRepository(Invoice),
          dataSource.getRepository(InvoiceItem),
          dataSource.getRepository(Payment),
          userRepository,
          unusedRepository,
          dataSource.getRepository(InventorySyncReceipt),
          dataSource.getRepository(InventorySyncOutbox),
          { findActiveVersion: jest.fn(), getSnapshot: jest.fn() } as never,
          { explode: jest.fn() },
        );

        await dataSource.query(`SET ROLE "${tenantRole}"`);
        const tenantAInvoices = await service.findAll(tenantAId);
        const tenantAInvoice = await service.findOne(tenantAId, invoiceAId);
        const crossTenantInvoice = await service.findOne(tenantAId, invoiceBId);
        await dataSource.query('RESET ROLE');

        expect(tenantAInvoices.map((invoice) => invoice.id)).toEqual([
          invoiceAId,
        ]);
        expect(tenantAInvoice?.id).toBe(invoiceAId);
        expect(crossTenantInvoice).toBeNull();
      } finally {
        try {
          if (dataSource?.isInitialized) {
            await dataSource.query('RESET ROLE');
            await dataSource.destroy();
          }
          if (bootstrap.isInitialized) {
            await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await bootstrap.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
            await bootstrap.destroy();
          }
        } catch {
          // Best-effort cleanup.
        }
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'returns a deterministic non-retryable rejection for cross-tenant invoice item id collisions under FORCE RLS',
    async () => {
      const bootstrap = new DataSource({
        type: 'postgres',
        ...postgresConnection,
      });
      const suffix = randomUUID().replace(/-/g, '');
      const schema = `invoice_item_collision_rls_${suffix}`;
      const tenantRole = `invoice_item_collision_role_${suffix}`;
      const tenantAId = randomUUID();
      const tenantBId = randomUUID();
      const originInvoiceId = randomUUID();
      const originItemId = randomUUID();
      const tenantBInvoiceId = randomUUID();
      const collidingItemId = randomUUID();
      let dataSource: DataSource | null = null;

      try {
        await bootstrap.initialize();
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
        await bootstrap.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
        dataSource = new DataSource({
          type: 'postgres',
          ...postgresConnection,
          schema,
          entities: [
            Tenant,
            Invoice,
            InvoiceItem,
            InvoiceItemModifier,
            Payment,
            InventorySyncReceipt,
            InventorySyncOutbox,
          ],
          synchronize: true,
        });
        await dataSource.initialize();
        await dataSource.query(`SET search_path TO "${schema}"`);
        await dataSource.query(`
          ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
          ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
          CREATE POLICY invoice_tenant_select ON invoices
            FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY invoice_tenant_insert ON invoices
            FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY invoice_tenant_update ON invoices
            FOR UPDATE USING (tenant_id::text = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY item_tenant_select ON invoice_items
            FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY item_tenant_insert ON invoice_items
            FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY item_tenant_update ON invoice_items
            FOR UPDATE USING (tenant_id::text = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
          GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoices TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoice_items TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoice_payments TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoice_item_modifiers TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON inventory_sync_receipts TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON inventory_sync_outbox TO "${tenantRole}";
        `);
        await dataSource.query(
          `INSERT INTO tenants (id, name, created_at, updated_at) VALUES
             ($1, 'Tenant A', now(), now()),
             ($2, 'Tenant B', now(), now())`,
          [tenantAId, tenantBId],
        );
        await dataSource.query(
          `INSERT INTO invoices (
             id, tenant_id, invoice_number, created_at, user_id, subtotal,
             total_tax, total, is_canceled, payment_status, global_tax_override,
             type, updated_at
           ) VALUES
             ($1, $2, 'A-ORIGIN', now(), 'user-a', 10.00, 1.50, 11.50,
              false, 'PAID', false, 'regular', now()),
             ($3, $4, 'B-SALE', now(), 'user-b', 20.00, 3.00, 23.00,
              false, 'PAID', false, 'regular', now())`,
          [originInvoiceId, tenantAId, tenantBInvoiceId, tenantBId],
        );
        await dataSource.query(
          `INSERT INTO invoice_items (
             id, tenant_id, invoice_id, product_id, product_name, quantity,
             unit_price, original_tax_rate, applied_tax_rate, tax_amount,
             total, discount
           ) VALUES
             ($1, $2, $3, 'prod-a', 'Burger', 1.0000, 10.00, 0.1500,
              0.1500, 1.50, 11.50, 0.00),
             ($4, $5, $6, 'prod-b', 'Burger', 1.0000, 20.00, 0.1500,
              0.1500, 3.00, 23.00, 0.00)`,
          [
            originItemId,
            tenantAId,
            originInvoiceId,
            collidingItemId,
            tenantBId,
            tenantBInvoiceId,
          ],
        );

        const service = new InvoicesService(
          dataSource,
          dataSource.getRepository(Invoice),
          dataSource.getRepository(InvoiceItem),
          dataSource.getRepository(Payment),
          createMockAuthorizingUserRepository(),
          {} as never,
          dataSource.getRepository(InventorySyncReceipt),
          dataSource.getRepository(InventorySyncOutbox),
          { findActiveVersion: jest.fn(), getSnapshot: jest.fn() } as never,
          { explode: jest.fn() },
        );

        await dataSource.query(`SET ROLE "${tenantRole}"`);
        const result = await service.syncBatch(tenantAId, [
          {
            idempotencyKey: 'credit-note-hidden-item-collision',
            sourceDeviceId: 'terminal-rls',
            sourceSequence: 1,
            flowType: 'sales',
            documentType: 'CREDIT_NOTE',
            invoice: {
              id: randomUUID(),
              number: 'CN-RLS-001',
              createdAt: new Date().toISOString(),
              userId: 'user-a',
              subtotal: -10,
              totalTax: -1.5,
              total: -11.5,
              paymentStatus: 'REFUNDED',
              type: 'creditNote',
              originInvoiceId,
              refundReasonPolicy: 'FINANCIAL_ONLY',
              refundReasonCode: 'customer_return',
              authorizedByUserId: 'manager-a',
              authorizedByRole: 'manager',
              items: [
                {
                  id: collidingItemId,
                  productId: 'prod-a',
                  productName: 'Burger',
                  quantity: -1,
                  unitPrice: 10,
                  originalTaxRate: 0.15,
                  appliedTaxRate: 0.15,
                  taxAmount: -1.5,
                  total: -11.5,
                  discount: 0,
                  originInvoiceItemId: originItemId,
                },
              ],
              payments: [],
            },
          },
        ]);
        await dataSource.query('RESET ROLE');

        expect(result.results).toEqual([
          expect.objectContaining({
            idempotencyKey: 'credit-note-hidden-item-collision',
            status: 'REJECTED',
            retryable: false,
            code: 'CROSS_TENANT_ITEM_ID_COLLISION',
          }),
        ]);
      } finally {
        try {
          if (dataSource?.isInitialized) {
            await dataSource.query('RESET ROLE');
            await dataSource.destroy();
          }
          if (bootstrap.isInitialized) {
            await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await bootstrap.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
            await bootstrap.destroy();
          }
        } catch {
          // Best-effort cleanup.
        }
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects hidden cross-tenant credit-note origin invoice items under FORCE RLS without saving a receipt',
    async () => {
      const bootstrap = new DataSource({
        type: 'postgres',
        ...postgresConnection,
      });
      const suffix = randomUUID().replace(/-/g, '');
      const schema = `credit_origin_item_rls_${suffix}`;
      const tenantRole = `credit_origin_item_role_${suffix}`;
      const tenantAId = randomUUID();
      const tenantBId = randomUUID();
      const originInvoiceId = randomUUID();
      const tenantBInvoiceId = randomUUID();
      const hiddenOriginItemId = randomUUID();
      let dataSource: DataSource | null = null;

      try {
        await bootstrap.initialize();
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
        await bootstrap.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
        dataSource = new DataSource({
          type: 'postgres',
          ...postgresConnection,
          schema,
          entities: [
            Tenant,
            Invoice,
            InvoiceItem,
            InvoiceItemModifier,
            Payment,
            InventorySyncReceipt,
            InventorySyncOutbox,
          ],
          synchronize: true,
        });
        await dataSource.initialize();
        await dataSource.query(`SET search_path TO "${schema}"`);
        await dataSource.query(`
          ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
          ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
          ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
          ALTER TABLE inventory_sync_receipts ENABLE ROW LEVEL SECURITY;
          ALTER TABLE inventory_sync_receipts FORCE ROW LEVEL SECURITY;
          CREATE POLICY invoice_tenant_select ON invoices
            FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY invoice_tenant_insert ON invoices
            FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY item_tenant_select ON invoice_items
            FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY item_tenant_insert ON invoice_items
            FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
          CREATE POLICY receipt_tenant_select ON inventory_sync_receipts
            FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
          CREATE POLICY receipt_tenant_insert ON inventory_sync_receipts
            FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
          GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoices TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoice_items TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoice_payments TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON invoice_item_modifiers TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON inventory_sync_receipts TO "${tenantRole}";
          GRANT SELECT, INSERT, UPDATE ON inventory_sync_outbox TO "${tenantRole}";
        `);
        await dataSource.query(
          `INSERT INTO tenants (id, name, created_at, updated_at) VALUES
             ($1, 'Tenant A', now(), now()),
             ($2, 'Tenant B', now(), now())`,
          [tenantAId, tenantBId],
        );
        await dataSource.query(
          `INSERT INTO invoices (
             id, tenant_id, invoice_number, created_at, user_id, subtotal,
             total_tax, total, is_canceled, payment_status, global_tax_override,
             type, updated_at
           ) VALUES
             ($1, $2, 'A-ORIGIN', now(), 'user-a', 10.00, 1.50, 11.50,
              false, 'PAID', false, 'regular', now()),
             ($3, $4, 'B-SALE', now(), 'user-b', 20.00, 3.00, 23.00,
              false, 'PAID', false, 'regular', now())`,
          [originInvoiceId, tenantAId, tenantBInvoiceId, tenantBId],
        );
        await dataSource.query(
          `INSERT INTO invoice_items (
             id, tenant_id, invoice_id, product_id, product_name, quantity,
             unit_price, original_tax_rate, applied_tax_rate, tax_amount,
             total, discount
           ) VALUES
             ($1, $2, $3, 'prod-b', 'Burger', 1.0000, 20.00, 0.1500,
              0.1500, 3.00, 23.00, 0.00)`,
          [hiddenOriginItemId, tenantBId, tenantBInvoiceId],
        );

        const service = new InvoicesService(
          dataSource,
          dataSource.getRepository(Invoice),
          dataSource.getRepository(InvoiceItem),
          dataSource.getRepository(Payment),
          createMockAuthorizingUserRepository(),
          {} as never,
          dataSource.getRepository(InventorySyncReceipt),
          dataSource.getRepository(InventorySyncOutbox),
          { findActiveVersion: jest.fn(), getSnapshot: jest.fn() } as never,
          { explode: jest.fn() },
        );

        await dataSource.query(`SET ROLE "${tenantRole}"`);
        const result = await service.syncBatch(tenantAId, [
          {
            idempotencyKey: 'credit-note-hidden-origin-item',
            sourceDeviceId: 'terminal-rls',
            sourceSequence: 1,
            flowType: 'sales',
            documentType: 'CREDIT_NOTE',
            invoice: {
              id: randomUUID(),
              number: 'CN-RLS-ORIGIN-001',
              createdAt: new Date().toISOString(),
              userId: 'user-a',
              subtotal: -10,
              totalTax: -1.5,
              total: -11.5,
              paymentStatus: 'REFUNDED',
              type: 'creditNote',
              originInvoiceId,
              refundReasonPolicy: 'FINANCIAL_ONLY',
              refundReasonCode: 'customer_return',
              authorizedByUserId: 'manager-a',
              authorizedByRole: 'manager',
              items: [
                {
                  id: randomUUID(),
                  productId: 'prod-a',
                  productName: 'Burger',
                  quantity: -1,
                  unitPrice: 10,
                  originalTaxRate: 0.15,
                  appliedTaxRate: 0.15,
                  taxAmount: -1.5,
                  total: -11.5,
                  discount: 0,
                  originInvoiceItemId: hiddenOriginItemId,
                },
              ],
              payments: [],
            },
          },
        ]);
        await dataSource.query('RESET ROLE');

        expect(result.results).toEqual([
          expect.objectContaining({
            idempotencyKey: 'credit-note-hidden-origin-item',
            status: 'REJECTED',
            retryable: false,
            code: 'CREDIT_NOTE_ORIGIN_ITEM_INVALID',
          }),
        ]);
        await expect(
          dataSource.getRepository(InventorySyncReceipt).countBy({
            tenant_id: tenantAId,
          }),
        ).resolves.toBe(0);
      } finally {
        try {
          if (dataSource?.isInitialized) {
            await dataSource.query('RESET ROLE');
            await dataSource.destroy();
          }
          if (bootstrap.isInitialized) {
            await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await bootstrap.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
            await bootstrap.destroy();
          }
        } catch {
          // Best-effort cleanup.
        }
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'replays a CREDIT_NOTE_RESTOCK through the real TypeORM/PostgreSQL path using invoice-prefixed SALE provenance',
    async () => {
      const bootstrap = new DataSource({
        type: 'postgres',
        ...postgresConnection,
      });
      const suffix = randomUUID().replace(/-/g, '');
      const schema = `credit_restock_replay_${suffix}`;
      const tenantId = randomUUID();
      const insumoId = randomUUID();
      const saleInvoiceId = randomUUID();
      const saleItemId = randomUUID();
      const creditNoteId = randomUUID();
      let dataSource: DataSource | null = null;

      try {
        await bootstrap.initialize();
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
        dataSource = new DataSource({
          type: 'postgres',
          ...postgresConnection,
          schema,
          entities: [
            Tenant,
            Invoice,
            InvoiceItem,
            InvoiceItemModifier,
            Payment,
            InventorySyncReceipt,
            InventorySyncOutbox,
            InventoryMovement,
            Insumo,
            UomConversion,
          ],
          synchronize: true,
        });
        await dataSource.initialize();
        await dataSource.query(`SET search_path TO "${schema}"`);
        await dataSource.query(
          "SELECT set_config('app.tenant_id', $1, false)",
          [tenantId],
        );
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.query(`SET search_path TO "${schema}"`);
        await new AddCreditNoteProvenance1782000000000().up(queryRunner);
        await queryRunner.release();

        await dataSource.getRepository(Tenant).save(
          dataSource.getRepository(Tenant).create({
            id: tenantId,
            name: 'Tenant Restock Replay',
          }),
        );
        await dataSource.getRepository(Insumo).save(
          dataSource.getRepository(Insumo).create({
            id: insumoId,
            tenant_id: tenantId,
            name: 'Burger Bun',
            purchaseUom: 'unit',
            consumptionUom: 'unit',
            conversionFactor: 1,
            stock: 10,
            existenciaActual: 10,
            averageCost: 3.5,
          }),
        );

        const service = new InvoicesService(
          dataSource,
          dataSource.getRepository(Invoice),
          dataSource.getRepository(InvoiceItem),
          dataSource.getRepository(Payment),
          createMockAuthorizingUserRepository(),
          dataSource.getRepository(InventoryMovement),
          dataSource.getRepository(InventorySyncReceipt),
          dataSource.getRepository(InventorySyncOutbox),
          { findActiveVersion: jest.fn().mockResolvedValue(null) } as never,
          { explode: jest.fn() },
        );

        const saleResult = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 'sale-replay-key',
            sourceDeviceId: 'terminal-db',
            sourceSequence: 1,
            flowType: 'sales',
            documentType: 'SALE',
            invoice: {
              id: saleInvoiceId,
              number: 'A-RESTOCK-001',
              createdAt: new Date().toISOString(),
              userId: 'user-db',
              subtotal: 7,
              totalTax: 1.05,
              total: 8.05,
              paymentStatus: 'PAID',
              type: 'regular',
              items: [
                {
                  id: saleItemId,
                  productId: insumoId,
                  productName: 'Burger Bun',
                  quantity: 2,
                  unitPrice: 3.5,
                  originalTaxRate: 0.15,
                  appliedTaxRate: 0.15,
                  taxAmount: 1.05,
                  total: 8.05,
                  discount: 0,
                },
              ],
              payments: [],
            },
          },
        ]);
        expect(saleResult.results).toEqual([
          expect.objectContaining({ status: 'ACCEPTED', code: 'APPLIED' }),
        ]);

        const creditResult = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 'credit-replay-key',
            sourceDeviceId: 'terminal-db',
            sourceSequence: 2,
            flowType: 'sales',
            documentType: 'CREDIT_NOTE',
            invoice: {
              id: creditNoteId,
              number: 'CN-RESTOCK-001',
              createdAt: new Date().toISOString(),
              userId: 'user-db',
              subtotal: -3.5,
              totalTax: -0.53,
              total: -4.03,
              paymentStatus: 'REFUNDED',
              type: 'creditNote',
              originInvoiceId: saleInvoiceId,
              refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
              refundReasonCode: 'returned_to_stock',
              authorizedByUserId: 'manager-db',
              authorizedByRole: 'manager',
              items: [
                {
                  id: randomUUID(),
                  productId: insumoId,
                  productName: 'Burger Bun',
                  quantity: -1,
                  unitPrice: 3.5,
                  originalTaxRate: 0.15,
                  appliedTaxRate: 0.15,
                  taxAmount: -0.53,
                  total: -4.03,
                  discount: 0,
                  originInvoiceItemId: saleItemId,
                },
              ],
              payments: [],
            },
          },
        ]);

        expect(creditResult.results).toEqual([
          expect.objectContaining({ status: 'ACCEPTED', code: 'APPLIED' }),
        ]);
        const movements = await dataSource
          .getRepository(InventoryMovement)
          .find({
            where: { tenant_id: tenantId },
            order: { id: 'ASC' },
          });
        expect(movements).toEqual([
          expect.objectContaining({
            type: MovementType.SALE,
            sourceDocumentId: `invoice:${saleInvoiceId}`,
            originInvoiceItemId: saleItemId,
          }),
          expect.objectContaining({
            type: MovementType.CREDIT_NOTE_RESTOCK,
            sourceDocumentId: creditNoteId,
            sourceDocumentType: 'CREDIT_NOTE',
            originInvoiceItemId: saleItemId,
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
          }),
        ]);
      } finally {
        try {
          if (dataSource?.isInitialized) {
            await dataSource.destroy();
          }
          if (bootstrap.isInitialized) {
            await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await bootstrap.destroy();
          }
        } catch {
          // Best-effort cleanup.
        }
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'returns a per-record staged sequence mismatch when the real stream-sequence unique constraint has a different idempotency key',
    async () => {
      await withIsolatedSchema(
        'sync_staged_sequence_conflict',
        async ({ dataSource, queryRunner, schema }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepository =
            dataSource.getRepository(InventorySyncReceipt);
          const outboxRepository =
            dataSource.getRepository(InventorySyncOutbox);
          const service = createService(
            dataSource,
            receiptRepository,
            outboxRepository,
          );

          await outboxRepository.save(
            outboxRepository.create({
              tenant_id: 'tenant-db',
              idempotency_key: 'staged-original-key',
              source_device_id: 'terminal-1',
              flow_type: 'inventory',
              source_sequence: '3',
              document_type: 'PURCHASE',
              payload_hash: 'original-staged-payload-hash',
              payload: { idempotencyKey: 'staged-original-key' },
              status: 'STAGED_FUTURE',
              result_code: 'WAITING_FOR_SEQUENCE_1',
            }),
          );

          const indexes = (await queryRunner.query(
            `
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = $1
              AND tablename = 'inventory_sync_outbox'
              AND indexname = 'uq_inventory_sync_outbox_stream_sequence'
          `,
            [schema],
          )) as PgIndexRow[];
          expect(indexes).toHaveLength(1);
          expect(indexes[0]?.indexdef).toContain('UNIQUE INDEX');

          const result = await service.syncBatch('tenant-db', [
            {
              idempotencyKey: 'staged-conflicting-key',
              sourceDeviceId: 'terminal-1',
              sourceSequence: 3,
              flowType: 'inventory',
              documentType: 'PURCHASE',
              movements: [
                { insumoId: randomUUID(), quantity: 1, unitCostNio: 7 },
              ],
            },
          ]);

          expect(result).toMatchObject({
            received: 1,
            processed: 0,
            duplicates: 0,
            results: [
              {
                idempotencyKey: 'staged-conflicting-key',
                terminalId: 'terminal-1',
                flowType: 'inventory',
                sourceSequence: 3,
                status: 'IDEMPOTENCY_MISMATCH',
                retryable: false,
                code: 'CRITICAL_STAGED_SEQUENCE_PAYLOAD_MISMATCH',
              },
            ],
          });
          await expect(outboxRepository.count()).resolves.toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'handles duplicate receipt checks and future staging with transaction-local tenant binding under FORCE RLS',
    async () => {
      await withIsolatedSchema(
        'sync_service_rls_paths',
        async ({ dataSource, queryRunner }) => {
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await new AddDeterministicSyncSequencing1780000000000().up(
            queryRunner,
          );

          const receiptRepository =
            dataSource.getRepository(InventorySyncReceipt);
          const outboxRepository =
            dataSource.getRepository(InventorySyncOutbox);
          const service = createService(
            dataSource,
            receiptRepository,
            outboxRepository,
          );

          const duplicateRecord: SyncBatchRecordDto = {
            idempotencyKey: 'duplicate-under-rls',
            sourceDeviceId: 'terminal-rls',
            sourceSequence: 1,
            flowType: 'inventory',
            documentType: 'PURCHASE',
            movements: [
              { insumoId: randomUUID(), quantity: 1, unitCostNio: 7 },
            ],
          };

          await receiptRepository.save(
            receiptRepository.create({
              tenant_id: 'tenant-rls',
              idempotency_key: duplicateRecord.idempotencyKey,
              source_device_id: duplicateRecord.sourceDeviceId,
              flow_type: duplicateRecord.flowType,
              source_sequence: String(duplicateRecord.sourceSequence),
              payload_hash: 'different-existing-hash',
              result_status: 'ACCEPTED',
              result_code: 'APPLIED',
            }),
          );

          await dataSource.query(
            "SELECT set_config('app.tenant_id', '', false)",
          );
          const ambientBefore = await dataSource.query<AmbientTenantRow[]>(
            "SELECT current_setting('app.tenant_id', true) AS tenant",
          );
          expect(ambientBefore).toEqual([{ tenant: '' }]);

          const duplicateResult = await service.syncBatch('tenant-rls', [
            duplicateRecord,
          ]);
          expect(duplicateResult.results).toEqual([
            expect.objectContaining({
              idempotencyKey: 'duplicate-under-rls',
              status: 'IDEMPOTENCY_MISMATCH',
              retryable: false,
              code: 'CRITICAL_PAYLOAD_MISMATCH',
            }),
          ]);

          const stagedRecord: SyncBatchRecordDto = {
            idempotencyKey: 'staged-under-rls',
            sourceDeviceId: 'terminal-rls',
            sourceSequence: 3,
            flowType: 'inventory',
            documentType: 'PURCHASE',
            movements: [
              { insumoId: randomUUID(), quantity: 1, unitCostNio: 5 },
            ],
          };

          const stagedResult = await service.syncBatch('tenant-rls', [
            stagedRecord,
          ]);
          expect(stagedResult.results).toEqual([
            expect.objectContaining({
              idempotencyKey: 'staged-under-rls',
              status: 'STAGED_FUTURE',
              retryable: true,
            }),
          ]);
          await expect(
            outboxRepository.countBy({ tenant_id: 'tenant-rls' }),
          ).resolves.toBe(1);

          const ambientAfter = await dataSource.query<AmbientTenantRow[]>(
            "SELECT current_setting('app.tenant_id', true) AS tenant",
          );
          expect(ambientAfter).toEqual([{ tenant: '' }]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
