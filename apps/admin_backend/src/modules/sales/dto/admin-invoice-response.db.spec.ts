import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { Payment } from '../entities/payment.entity';
import { serializeAdminInvoices } from './admin-invoice-response';

/**
 * Real-PostgreSQL regression net for the `/sales/admin/invoices` wire
 * payload. Unit specs can only simulate the driver; only the real database
 * proves that node-postgres hands `numeric` columns to the mapper as
 * STRINGS while `Invoice` (+ items, payments) declares `number`. This pins
 * the panel-relevant money/quantity fields as JSON numbers after the mapper
 * (the panel calls `formatCurrency(invoice.total)` and
 * `Math.abs(Number(item.quantity))`), and pins the raw string shape so a
 * future change that silently re-breaks the wire cannot slip through.
 */
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
    throw new Error('DB_PORT must be a valid integer');
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

const ENTITIES = [Tenant, Invoice, InvoiceItem, InvoiceItemModifier, Payment];

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: { dataSource: DataSource }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: ENTITIES,
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    await assertion({ dataSource });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('serializeAdminInvoices — real PostgreSQL wire shape', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'coerces the driver-returned numeric strings of the invoice, its items and its payments into numbers',
    async () => {
      await withIsolatedSchema('admin_invoice_wire', async ({ dataSource }) => {
        const tenantId = randomUUID();
        await dataSource.query(
          `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
          [tenantId, 'Invoice Wire Tenant', 'invoice-wire-tenant'],
        );

        const repo = dataSource.getRepository(Invoice);
        await repo.save(
          repo.create({
            tenant_id: tenantId,
            number: '001-001-01-00000001',
            created_at: new Date('2026-01-01T12:00:00.000Z'),
            userId: randomUUID(),
            subtotal: 100,
            totalTax: 15,
            total: 115,
            paymentStatus: 'paid',
            type: 'regular',
            bcnOfficialRate: 36.6241,
            commercialRate: 36.5,
            totalUsd: 3.15,
            tipAmountNio: null,
            tipAmountUsd: null,
            tipPercentage: null,
            tipEligibleBaseNio: null,
            items: [
              {
                tenant_id: tenantId,
                productId: randomUUID(),
                productName: 'Tacos',
                quantity: 2,
                unitPrice: 57.5,
                originalTaxRate: 0.15,
                appliedTaxRate: 0.15,
                taxAmount: 7.5,
                total: 115,
                discount: 5,
                modifiers: [
                  {
                    name: 'Extra queso',
                    extraPrice: 25.5,
                    quantity: 1,
                  },
                ],
              },
            ],
            payments: [
              {
                method: 'CASH',
                amount: 115,
                currency: 'NIO',
                exchangeRate: 1,
                amountNio: 115,
                changeGiven: 0,
              },
            ],
          } as Partial<Invoice>),
        );

        // Same shape the controller's route reads through findAll.
        const raw = await repo.find({
          where: { tenant_id: tenantId },
          relations: ['items', 'items.modifiers', 'payments'],
        });

        // The lie the TypeScript type tells: the wire carried strings.
        expect(typeof raw[0].subtotal).toBe('string');
        expect(typeof raw[0].total).toBe('string');
        expect(typeof raw[0].items[0].quantity).toBe('string');
        expect(typeof raw[0].items[0].unitPrice).toBe('string');
        expect(typeof raw[0].payments[0].amount).toBe('string');
        expect(typeof raw[0].payments[0].amountNio).toBe('string');

        const [mapped] = serializeAdminInvoices(raw);

        // Invoice money fields, explicitly typed as JSON numbers.
        expect(typeof mapped.subtotal).toBe('number');
        expect(typeof mapped.totalTax).toBe('number');
        expect(typeof mapped.total).toBe('number');
        expect(mapped.subtotal).toBe(100);
        expect(mapped.totalTax).toBe(15);
        expect(mapped.total).toBe(115);
        expect(mapped.bcnOfficialRate).toBe(36.6241);
        expect(mapped.commercialRate).toBe(36.5);
        expect(mapped.totalUsd).toBe(3.15);
        // Nullable tip family: null on the wire stays null after mapping.
        expect(mapped.tipAmountNio).toBeNull();
        expect(mapped.tipAmountUsd).toBeNull();

        // Item fields the panel consumes.
        const item = mapped.items[0];
        expect(typeof item.quantity).toBe('number');
        expect(typeof item.unitPrice).toBe('number');
        expect(typeof item.taxAmount).toBe('number');
        expect(typeof item.total).toBe('number');
        expect(typeof item.discount).toBe('number');
        expect(item.quantity).toBe(2);
        expect(item.unitPrice).toBe(57.5);
        expect(item.taxAmount).toBe(7.5);
        expect(item.total).toBe(115);
        expect(item.discount).toBe(5);
        expect(item.originalTaxRate).toBe(0.15);
        expect(item.appliedTaxRate).toBe(0.15);
        expect(item.modifiers[0].extraPrice).toBe(25.5);

        // Payment fields the panel consumes.
        const payment = mapped.payments[0];
        expect(typeof payment.amount).toBe('number');
        expect(typeof payment.amountNio).toBe('number');
        expect(payment.amount).toBe(115);
        expect(payment.amountNio).toBe(115);
        expect(payment.exchangeRate).toBe(1);
        expect(payment.changeGiven).toBe(0);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
