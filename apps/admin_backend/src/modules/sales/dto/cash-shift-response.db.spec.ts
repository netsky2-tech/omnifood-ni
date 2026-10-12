import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';
import {
  serializeCashMovement,
  serializeCashShiftSession,
} from './cash-shift-response';

/**
 * Real-PostgreSQL regression net for the `/sales/shifts` wire payload. Unit
 * specs can only simulate the driver; only the real database proves that
 * node-postgres hands `numeric` columns to the mapper as STRINGS while
 * `CashShiftSession` and `CashMovement` declare `number`. This pins the
 * panel-relevant money fields — including `difference_nio` and the
 * expected-cash pair — as JSON numbers after the mapper, and pins the raw
 * string shape so a future change that silently re-breaks the wire cannot
 * slip through. The panel happens to wrap `difference_nio` in `Number(...)`
 * today, which masks the latent defect this net protects against.
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
      entities: [CashShiftSession, CashMovement],
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

describe('serializeCashShiftSession — real PostgreSQL wire shape', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'coerces the driver-returned numeric strings of the shift money fields into numbers and keeps an open shift\'s nulls null',
    async () => {
      await withIsolatedSchema('cash_shift_wire', async ({ dataSource }) => {
        const tenantId = randomUUID();
        const repo = dataSource.getRepository(CashShiftSession);

        await repo.save(
          repo.create({
            tenant_id: tenantId,
            terminal_id: 'term-main',
            cashier_id: 'user-cajero',
            cashier_name: 'Juan Pérez',
            status: CashShiftStatus.OPEN,
            initial_float_nio: 1000,
            initial_float_usd: 50,
            expected_cash_nio: 1150.5,
            expected_cash_usd: 57.5,
          }),
        );

        const raw = await repo.find({ where: { tenant_id: tenantId } });

        // The lie the TypeScript type tells: the wire carried strings.
        expect(typeof raw[0].initial_float_nio).toBe('string');
        expect(typeof raw[0].expected_cash_nio).toBe('string');
        expect(typeof raw[0].expected_cash_usd).toBe('string');

        const [mapped] = [serializeCashShiftSession(raw[0])];

        // Money fields, explicitly typed as JSON numbers.
        expect(typeof mapped.initial_float_nio).toBe('number');
        expect(typeof mapped.initial_float_usd).toBe('number');
        expect(typeof mapped.expected_cash_nio).toBe('number');
        expect(typeof mapped.expected_cash_usd).toBe('number');
        expect(mapped.initial_float_nio).toBe(1000);
        expect(mapped.initial_float_usd).toBe(50);
        expect(mapped.expected_cash_nio).toBe(1150.5);
        expect(mapped.expected_cash_usd).toBe(57.5);
        // Open shift: never counted, no difference exists — null stays null.
        expect(mapped.final_counted_nio).toBeNull();
        expect(mapped.final_counted_usd).toBeNull();
        expect(mapped.difference_nio).toBeNull();
        expect(mapped.difference_usd).toBeNull();
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'coerces a closed shift\'s final counts and differences, and a movement\'s amounts, into numbers',
    async () => {
      await withIsolatedSchema('cash_shift_closed', async ({ dataSource }) => {
        const tenantId = randomUUID();
        const repo = dataSource.getRepository(CashShiftSession);

        const shift = await repo.save(
          repo.create({
            tenant_id: tenantId,
            terminal_id: 'term-main',
            cashier_id: 'user-cajero',
            cashier_name: 'Juan Pérez',
            status: CashShiftStatus.OPEN,
            initial_float_nio: 1000,
            initial_float_usd: 50,
            expected_cash_nio: 1150.5,
            expected_cash_usd: 57.5,
          }),
        );

        // Close it the way the service does: counted vs expected, Z assigned.
        const loaded = await repo.findOneByOrFail({ id: shift.id });
        loaded.status = CashShiftStatus.CLOSED;
        loaded.closed_at = new Date('2026-01-01T17:00:00.000Z');
        loaded.final_counted_nio = 1150;
        loaded.final_counted_usd = 57.25;
        loaded.difference_nio = -0.5;
        loaded.difference_usd = -0.25;
        loaded.z_report_sequence = 1;
        await repo.save(loaded);

        await dataSource.getRepository(CashMovement).save(
          dataSource.getRepository(CashMovement).create({
            tenant_id: tenantId,
            shift_id: shift.id,
            terminal_id: 'term-main',
            type: CashMovementType.PETTY_CASH,
            amount_nio: 150.25,
            amount_usd: 0,
            reason: 'Compra de bolsas',
          }),
        );

        const raw = await repo.findOneByOrFail({ id: shift.id });
        // The wire carried strings for the counted/difference pair too.
        expect(typeof raw.final_counted_nio).toBe('string');
        expect(typeof raw.difference_nio).toBe('string');

        const mapped = serializeCashShiftSession(raw);
        expect(typeof mapped.final_counted_nio).toBe('number');
        expect(typeof mapped.final_counted_usd).toBe('number');
        expect(typeof mapped.difference_nio).toBe('number');
        expect(typeof mapped.difference_usd).toBe('number');
        expect(mapped.final_counted_nio).toBe(1150);
        expect(mapped.final_counted_usd).toBe(57.25);
        expect(mapped.difference_nio).toBe(-0.5);
        expect(mapped.difference_usd).toBe(-0.25);
        // int columns are real numbers from the driver; they pass through.
        expect(mapped.z_report_sequence).toBe(1);

        const rawMovement = await dataSource
          .getRepository(CashMovement)
          .findOneByOrFail({ shift_id: shift.id });
        expect(typeof rawMovement.amount_nio).toBe('string');

        const mappedMovement = serializeCashMovement(rawMovement);
        expect(typeof mappedMovement.amount_nio).toBe('number');
        expect(typeof mappedMovement.amount_usd).toBe('number');
        expect(mappedMovement.amount_nio).toBe(150.25);
        expect(mappedMovement.amount_usd).toBe(0);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
