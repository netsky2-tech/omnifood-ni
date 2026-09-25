import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantTransaction } from '../../src/core/database/tenant-transaction';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * The closed set of entities the gate's seeding and pooled-repository
 * wiring touch, plus the relation targets TypeORM must resolve to build
 * their metadata (Tenant, SecurityProfile, InvoiceItemModifier). The app's
 * full entity list lives inline in createTypeOrmOptions (app.module.ts) and
 * is deliberately not exported; a spec-local DataSource only needs this
 * subset, and registering the whole list would widen the gate's blast
 * radius without adding teeth.
 */
export const pooledReadsGateEntities = [
  Tenant,
  User,
  SecurityProfile,
  Invoice,
  InvoiceItem,
  InvoiceItemModifier,
  Payment,
];

/**
 * Seed plumbing for the issue #581 WU4 pooled-reads RLS gate
 * (test/sales/pooled-reads-rls.db.e2e-spec.ts).
 *
 * Role creation and the migration-built scratch schema are already owned by
 * test/support/migration-built-schema.helper.ts (superuser admin connection
 * plus a NOSUPERUSER NOBYPASSRLS runtime role); this helper only builds the
 * business fixtures that gate exercises: one tenant with invoices (items and
 * payments included — getDashboard/getTopProducts load those relations),
 * two users with different roles, one canceled invoice for
 * getVoidedInvoices, and a second tenant with its own invoice so the gate
 * can prove bound reads stay inside the bound tenant.
 *
 * Seeding runs through `runInTenantTransaction` on the SUPERUSER connection,
 * exactly as the production write paths do: the bound manager is the shape
 * the fixed services use, so the fixtures and the reads below share one
 * vocabulary. RLS never applies to the superuser, so the binding here is
 * documentary — the teeth live on the runtime role in the spec.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - `invoices.tenant_id`, `invoice_items.tenant_id` and `users.tenant_id`
 *   FK `tenants(id)`, so both tenants exist as real rows.
 * - `invoices.user_id` and `invoice_items.product_id` carry no FK in the
 *   bootstrap migration (1759000000002), so no user/product rows are needed
 *   for invoice/item inserts beyond the users the reports themselves read.
 */

export interface PooledReadsFixtureIds {
  tenantAId: string;
  tenantBId: string;
  cashierAId: string;
  managerAId: string;
  cashierBId: string;
  /** Tenant A, regular, paid in cash — the only invoice carrying a payment. */
  invoiceA1Id: string;
  /** Tenant A, regular, no payment row. */
  invoiceA2Id: string;
  /** Tenant A, canceled — feeds getVoidedInvoices and the ANULADA row. */
  invoiceAVoidedId: string;
  /** Tenant B — must never appear in tenant A's bound reads. */
  invoiceB1Id: string;
  /** Wall-clock the invoices were stamped with (current Managua month/day). */
  seededAt: Date;
}

const MANAGUA_INVOICE_SERIES = '001-001-01-';

export const pooledReadsPostgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

export const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

interface SeedInvoiceInput {
  id: string;
  tenantId: string;
  number: string;
  userId: string;
  createdAt: Date;
  subtotal: number;
  totalTax: number;
  total: number;
  isCanceled?: boolean;
  voidReason?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    total: number;
  }>;
  payments?: Array<{
    method: string;
    amount: number;
    currency: string;
    amountNio: number;
  }>;
}

const seedInvoice = async (
  manager: EntityManager,
  input: SeedInvoiceInput,
): Promise<void> => {
  // Cascade insert: the invoice row first, then its items and payments
  // (fk_ii_invoice / fk_ip_invoice), all inside the bound manager.
  await manager.getRepository(Invoice).save({
    id: input.id,
    tenant_id: input.tenantId,
    number: input.number,
    created_at: input.createdAt,
    userId: input.userId,
    subtotal: input.subtotal,
    totalTax: input.totalTax,
    total: input.total,
    isCanceled: input.isCanceled ?? false,
    voidReason: input.voidReason,
    paymentStatus: input.payments?.length ? 'paid' : 'pending',
    customerId: 'J0310000123456',
    type: 'regular',
    items: input.items.map(
      (item): Partial<InvoiceItem> => ({
        tenant_id: input.tenantId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: item.taxAmount,
        total: item.total,
        discount: 0,
      }),
    ),
    payments: (input.payments ?? []).map(
      (payment): Partial<Payment> => ({
        method: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        exchangeRate: 1.0,
        amountNio: payment.amountNio,
        changeGiven: 0,
        changeCurrency: 'NIO',
      }),
    ),
  });
};

/**
 * Seeds both tenants and their fixtures through the superuser connection,
 * one bound manager per tenant. Returns every id the gate asserts on.
 */
export async function seedPooledReadsFixtures(
  admin: DataSource,
): Promise<PooledReadsFixtureIds> {
  const ids: PooledReadsFixtureIds = {
    tenantAId: randomUUID(),
    tenantBId: randomUUID(),
    cashierAId: randomUUID(),
    managerAId: randomUUID(),
    cashierBId: randomUUID(),
    invoiceA1Id: randomUUID(),
    invoiceA2Id: randomUUID(),
    invoiceAVoidedId: randomUUID(),
    invoiceB1Id: randomUUID(),
    seededAt: new Date(),
  };

  const latteProductId = randomUUID();
  const espressoProductId = randomUUID();

  await runInTenantTransaction(admin, ids.tenantAId, async (manager) => {
    const tenantName = 'pooled-reads-gate-a';
    await manager.getRepository(Tenant).save({
      id: ids.tenantAId,
      name: tenantName,
      slug: normalizeTenantSlug(tenantName),
    } as Partial<Tenant>);

    const userRepo = manager.getRepository(User);
    await userRepo.save({
      id: ids.cashierAId,
      tenant_id: ids.tenantAId,
      name: 'Elena Perez',
      email: 'elena.perez@pooled-reads-gate-a.test',
      role: UserRole.CASHIER,
      is_active: true,
    } as Partial<User>);
    await userRepo.save({
      id: ids.managerAId,
      tenant_id: ids.tenantAId,
      name: 'Mario Reyes',
      email: 'mario.reyes@pooled-reads-gate-a.test',
      role: UserRole.MANAGER,
      is_active: true,
    } as Partial<User>);

    // Series 1..3, no gaps: getSequenceAudit asserts the contiguous run.
    await seedInvoice(manager, {
      id: ids.invoiceA1Id,
      tenantId: ids.tenantAId,
      number: `${MANAGUA_INVOICE_SERIES}00000001`,
      userId: ids.cashierAId,
      createdAt: ids.seededAt,
      subtotal: 1000,
      totalTax: 150,
      total: 1150,
      items: [
        {
          productId: latteProductId,
          productName: 'Cafe Latte Especial',
          quantity: 2,
          unitPrice: 500,
          taxAmount: 150,
          total: 1150,
        },
      ],
      payments: [
        { method: 'CASH', amount: 1150, currency: 'NIO', amountNio: 1150 },
      ],
    });
    await seedInvoice(manager, {
      id: ids.invoiceA2Id,
      tenantId: ids.tenantAId,
      number: `${MANAGUA_INVOICE_SERIES}00000002`,
      userId: ids.cashierAId,
      createdAt: ids.seededAt,
      subtotal: 500,
      totalTax: 75,
      total: 575,
      items: [
        {
          productId: espressoProductId,
          productName: 'Espresso Doble',
          quantity: 1,
          unitPrice: 500,
          taxAmount: 75,
          total: 575,
        },
      ],
    });
    // DGI DT 09-2007: invoices are never deleted, only canceled — this is
    // the row getVoidedInvoices must surface and exportSalesBook must mark
    // ANULADA while keeping it in the sequence audit.
    await seedInvoice(manager, {
      id: ids.invoiceAVoidedId,
      tenantId: ids.tenantAId,
      number: `${MANAGUA_INVOICE_SERIES}00000003`,
      userId: ids.cashierAId,
      createdAt: ids.seededAt,
      subtotal: 200,
      totalTax: 0,
      total: 200,
      isCanceled: true,
      voidReason: 'GATE-TEST-VOID',
      items: [],
    });
  });

  await runInTenantTransaction(admin, ids.tenantBId, async (manager) => {
    const tenantName = 'pooled-reads-gate-b';
    await manager.getRepository(Tenant).save({
      id: ids.tenantBId,
      name: tenantName,
      slug: normalizeTenantSlug(tenantName),
    } as Partial<Tenant>);
    await manager.getRepository(User).save({
      id: ids.cashierBId,
      tenant_id: ids.tenantBId,
      name: 'Bruna Campos',
      email: 'bruna.campos@pooled-reads-gate-b.test',
      role: UserRole.CASHIER,
      is_active: true,
    } as Partial<User>);
    await seedInvoice(manager, {
      id: ids.invoiceB1Id,
      tenantId: ids.tenantBId,
      number: `${MANAGUA_INVOICE_SERIES}00000021`,
      userId: ids.cashierBId,
      createdAt: ids.seededAt,
      subtotal: 900,
      totalTax: 0,
      total: 900,
      items: [],
    });
  });

  return ids;
}
