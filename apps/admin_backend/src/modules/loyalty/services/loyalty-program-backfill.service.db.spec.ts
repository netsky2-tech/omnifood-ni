import { randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoyaltyProgramBackfillService } from './loyalty-program-backfill.service';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { LoyaltySyncIngestionService } from './loyalty-sync-ingestion.service';
import { LoyaltyProgram } from '../entities/loyalty-program.entity';
import { RewardDefinition } from '../entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { User } from '../../identity/entities/user.entity';
import { SecurityProfile } from '../../identity/entities/security-profile.entity';
import { AuditLog } from '../../identity/entities/audit-log.entity';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

interface TenantFixtureOptions {
  tenantId: string;
  activeProgramCount: number;
  customers: Array<{
    customerId: string;
    txs: Array<{ units: number; points: number }>;
    /** Optional pre-existing projection row used to disambiguate programs. */
    projectionProgramId?: string;
  }>;
}

interface TenantFixture {
  tenantId: string;
  customers: Array<{ customerId: string; programIds: string[] }>;
}

async function createTestHarness() {
  const schema = `loyalty_backfill_test_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);

  await bootstrap.query(`CREATE TABLE "${schema}".tenants (
    id text PRIMARY KEY, name text NOT NULL, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".customers (
    id uuid PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL,
    tax_id text, phone text, email text, address text,
    points_balance numeric(12,2) DEFAULT 0.0, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".loyalty_programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
    program_type text NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
    starts_at timestamptz, ends_at timestamptz,
    earning_rule jsonb NOT NULL DEFAULT '{}', eligibility_rule jsonb NOT NULL DEFAULT '{}',
    config_version int NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".customer_point_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, customer_id uuid NOT NULL,
    loyalty_program_id uuid, ticket_id text, invoice_id text, reward_id uuid,
    transaction_type text, units int, reversal_of_transaction_id uuid,
    idempotency_key text, source_event_id text, actor_user_id uuid,
    branch_id text, terminal_id text, program_version int, reward_version int,
    commercial_snapshot jsonb, origin text, occurred_at timestamptz, recorded_at timestamptz,
    legacy_imported boolean DEFAULT false,
    type text DEFAULT 'earn', points numeric(12,2) DEFAULT 0.0,
    balance_after numeric(12,2) DEFAULT 0.0, conversion_rate numeric(8,4) DEFAULT 0.1,
    reason text, created_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".customer_loyalty_account_projection (
    tenant_id text NOT NULL, customer_id uuid NOT NULL, loyalty_program_id uuid NOT NULL,
    balance_units int NOT NULL DEFAULT 0, last_transaction_id uuid,
    projection_version int NOT NULL DEFAULT 0, recomputed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, customer_id, loyalty_program_id)
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".reward_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loyalty_program_id uuid NOT NULL,
    tenant_id text NOT NULL, name text NOT NULL, reward_type text NOT NULL,
    points_required int NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
    config_version int NOT NULL DEFAULT 1, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  // Pre-migration-shape audit_logs (uuid id, hash-chain columns defaulted) —
  // mirrors the production columns the AuditLog entity maps to.
  await bootstrap.query(`CREATE TABLE "${schema}".audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    user_id uuid NOT NULL,
    action varchar NOT NULL,
    target_type varchar,
    target_id varchar,
    device_id varchar NOT NULL DEFAULT 'BACKOFFICE',
    sequence_no integer NOT NULL DEFAULT 0,
    prev_hash varchar NOT NULL DEFAULT 'GENESIS',
    entry_hash varchar NOT NULL DEFAULT 'GENESIS',
    metodo_autorizacion varchar,
    usuario_autorizador_id uuid,
    timestamp timestamptz NOT NULL DEFAULT now(),
    metadata jsonb,
    forensic_status varchar(32) NOT NULL DEFAULT 'ACTIVE',
    hash_version varchar
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    schema,
    entities: [
      LoyaltyProgram,
      RewardDefinition,
      CustomerLoyaltyAccountProjection,
      CustomerPointTransaction,
      Customer,
      Tenant,
      User,
      SecurityProfile,
      AuditLog,
    ],
    synchronize: false,
  });
  await dataSource.initialize();

  const ledgerService = new LoyaltyLedgerService(
    dataSource.getRepository(CustomerPointTransaction),
    dataSource.getRepository(CustomerLoyaltyAccountProjection),
    dataSource,
  );
  const ingestionService = new LoyaltySyncIngestionService(
    ledgerService,
    dataSource,
  );
  const service = new LoyaltyProgramBackfillService(
    dataSource,
    ingestionService,
    ledgerService,
  );

  const setupTenant = async (
    options: TenantFixtureOptions,
  ): Promise<TenantFixture> => {
    const { tenantId } = options;
    await bootstrap.query(
      `INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`,
      [tenantId, `Tenant ${tenantId}`],
    );

    const programIds: string[] = [];
    for (let i = 0; i < options.activeProgramCount; i += 1) {
      const inserted = await bootstrap.query(
        `INSERT INTO "${schema}".loyalty_programs
         (tenant_id, name, program_type, status) VALUES ($1, $2, 'SPEND_POINTS', 'ACTIVE')
         RETURNING id`,
        [tenantId, `Program ${i + 1} (${tenantId})`],
      );
      programIds.push(inserted[0].id as string);
    }

    const customers: TenantFixture['customers'] = [];
    for (const customerFixture of options.customers) {
      const { customerId, txs } = customerFixture;
      await bootstrap.query(
        `INSERT INTO "${schema}".customers (id, tenant_id, name, points_balance)
         VALUES ($1, $2, $3, 0.0)`,
        [customerId, tenantId, `Customer ${customerId}`],
      );
      for (const tx of txs) {
        await bootstrap.query(
          `INSERT INTO "${schema}".customer_point_transactions
           (id, tenant_id, customer_id, type, units, points, balance_after, conversion_rate, created_at)
           VALUES (gen_random_uuid(), $1, $2, 'earn', $3, $4, 0.0, 0.1, now())`,
          [tenantId, customerId, tx.units, tx.points],
        );
      }
      if (customerFixture.projectionProgramId) {
        await bootstrap.query(
          `INSERT INTO "${schema}".customer_loyalty_account_projection
           (tenant_id, customer_id, loyalty_program_id, balance_units)
           VALUES ($1, $2, $3, 0)`,
          [tenantId, customerId, customerFixture.projectionProgramId],
        );
      }
      customers.push({ customerId, programIds });
    }

    return { tenantId, customers };
  };

  return {
    service,
    txRepo: dataSource.getRepository(CustomerPointTransaction),
    programRepo: dataSource.getRepository(LoyaltyProgram),
    projectionRepo: dataSource.getRepository(CustomerLoyaltyAccountProjection),
    customerRepo: dataSource.getRepository(Customer),
    auditRepo: dataSource.getRepository(AuditLog),
    setupTenant,
    destroy: async () => {
      await dataSource.destroy();
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    },
  };
}

describe('LoyaltyProgramBackfillService (db)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  const actorUserId = randomUUID();

  // TypeORM's `count({ where: { col: null } })` silently drops the IS NULL
  // condition, so NULL-row counts go through an explicit query builder.
  const countNullProgramRows = async (tenantId: string): Promise<number> =>
    harness.txRepo
      .createQueryBuilder('tx')
      .where('tx.tenant_id = :tenantId', { tenantId })
      .andWhere('tx.loyalty_program_id IS NULL')
      .getCount();

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness?.destroy();
  });

  describe('commitBackfill', () => {
    it('attributes NULL rows to the single ACTIVE program and rebuilds the projection and balance', async () => {
      const tenantId = `tenant-commit-1-${randomUUID()}`;
      const customerId = randomUUID();
      const fixture = await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [
          {
            customerId,
            txs: [
              { units: 50, points: 50 },
              { units: 50, points: 50 },
              { units: 50, points: 40 },
            ],
          },
        ],
      });
      const programId = fixture.customers[0].programIds[0];

      const report = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );

      expect(report.dryRun).toBe(false);
      expect(report.customersScanned).toBe(1);
      expect(report.customersAttributed).toBe(1);
      expect(report.transactionsAttributed).toBe(3);
      expect(report.unresolved).toEqual([]);

      const nullRows = await countNullProgramRows(tenantId);
      expect(nullRows).toBe(0);

      const attributed = await harness.txRepo.count({
        where: { tenant_id: tenantId, loyalty_program_id: programId },
      });
      expect(attributed).toBe(3);

      // Projection rebuilt from the ledger: SUM(units) for the customer+program.
      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projection).not.toBeNull();
      expect(projection?.balance_units).toBe(150);

      // Global balance column: ledger-authoritative SUM(points) = 140.
      const customer = await harness.customerRepo.findOne({
        where: { id: customerId, tenant_id: tenantId },
      });
      expect(Number(customer?.points_balance)).toBe(140);
    });

    it('with 2 ACTIVE programs and no disambiguating projection: rows untouched, customer reported PROGRAM_UNRESOLVED', async () => {
      const tenantId = `tenant-ambiguous-${randomUUID()}`;
      const customerId = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 2,
        customers: [
          {
            customerId,
            txs: [
              { units: 30, points: 30 },
              { units: 20, points: 20 },
            ],
          },
        ],
      });

      const report = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );

      expect(report.dryRun).toBe(false);
      expect(report.customersScanned).toBe(1);
      expect(report.customersAttributed).toBe(0);
      expect(report.transactionsAttributed).toBe(0);
      expect(report.unresolved).toEqual([
        { customerId, outcome: 'PROGRAM_UNRESOLVED' },
      ]);

      const nullRows = await countNullProgramRows(tenantId);
      expect(nullRows).toBe(2);

      const projections = await harness.projectionRepo.count({
        where: { tenant_id: tenantId },
      });
      expect(projections).toBe(0);
    });

    it('with 2 ACTIVE programs but an existing customer projection: resolves to the projected program', async () => {
      const tenantId = `tenant-disambig-${randomUUID()}`;
      const customerId = randomUUID();
      const fixture = await harness.setupTenant({
        tenantId,
        activeProgramCount: 2,
        customers: [
          {
            customerId,
            txs: [{ units: 70, points: 70 }],
          },
        ],
      });
      const projectedProgramId = fixture.customers[0].programIds[0];
      // Give the customer a projection pointing at the first ACTIVE program.
      await harness.projectionRepo.save(
        harness.projectionRepo.create({
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: projectedProgramId,
          balance_units: 0,
          projection_version: 1,
          recomputed_at: new Date(),
        }),
      );

      const report = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );

      expect(report.customersAttributed).toBe(1);
      expect(report.transactionsAttributed).toBe(1);
      expect(report.unresolved).toEqual([]);

      const attributed = await harness.txRepo.find({
        where: { tenant_id: tenantId, loyalty_program_id: projectedProgramId },
      });
      expect(attributed).toHaveLength(1);

      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: projectedProgramId,
        },
      });
      expect(projection?.balance_units).toBe(70);
    });

    it('with 0 ACTIVE programs: rows untouched, outcome none (not a failure)', async () => {
      const tenantId = `tenant-none-${randomUUID()}`;
      const customerId = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 0,
        customers: [{ customerId, txs: [{ units: 10, points: 10 }] }],
      });

      const report = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );

      expect(report.customersScanned).toBe(1);
      expect(report.customersAttributed).toBe(0);
      expect(report.transactionsAttributed).toBe(0);
      expect(report.unresolved).toEqual([{ customerId, outcome: 'none' }]);

      const nullRows = await countNullProgramRows(tenantId);
      expect(nullRows).toBe(1);

      const projections = await harness.projectionRepo.count({
        where: { tenant_id: tenantId },
      });
      expect(projections).toBe(0);
    });

    it('is idempotent: a second commit attributes 0 and leaves balances unchanged', async () => {
      const tenantId = `tenant-idempotent-${randomUUID()}`;
      const customerId = randomUUID();
      const fixture = await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [{ customerId, txs: [{ units: 45, points: 45 }] }],
      });
      const programId = fixture.customers[0].programIds[0];

      const first = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );
      expect(first.transactionsAttributed).toBe(1);

      const second = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );

      expect(second.dryRun).toBe(false);
      expect(second.customersScanned).toBe(0);
      expect(second.transactionsAttributed).toBe(0);
      expect(second.customersAttributed).toBe(0);
      expect(second.unresolved).toEqual([]);

      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projection?.balance_units).toBe(45);

      const customer = await harness.customerRepo.findOne({
        where: { id: customerId, tenant_id: tenantId },
      });
      expect(Number(customer?.points_balance)).toBe(45);
    });

    it('respects batchSize, scanning customers in deterministic customer_id order', async () => {
      const tenantId = `tenant-batch-${randomUUID()}`;
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [
          { customerId: randomUUID(), txs: [{ units: 1, points: 1 }] },
          { customerId: randomUUID(), txs: [{ units: 2, points: 2 }] },
          { customerId: randomUUID(), txs: [{ units: 3, points: 3 }] },
        ],
      });

      const report = await harness.service.commitBackfill(
        tenantId,
        2,
        actorUserId,
      );

      expect(report.customersScanned).toBe(2);
      expect(report.transactionsAttributed).toBe(2);
      expect(report.customersAttributed).toBe(2);
    });

    it('writes exactly one AuditLog row for the whole commit with the counts', async () => {
      const tenantId = `tenant-audit-${randomUUID()}`;
      const customerId = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [
          {
            customerId,
            txs: [
              { units: 10, points: 10 },
              { units: 5, points: 5 },
            ],
          },
        ],
      });

      await harness.service.commitBackfill(tenantId, 200, actorUserId);

      const auditRows = await harness.auditRepo.find({
        where: { tenant_id: tenantId },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].action).toBe('LOYALTY_PROGRAM_BACKFILL_COMMITTED');
      expect(auditRows[0].user_id).toBe(actorUserId);
      expect(auditRows[0].device_id).toBe('BACKOFFICE');
      expect(auditRows[0].metadata).toMatchObject({
        attributedCustomers: 1,
        attributedTransactions: 2,
        unresolvedCustomers: 0,
      });
    });

    it('fails closed without writing anything when the actor user id is missing', async () => {
      const tenantId = `tenant-no-actor-${randomUUID()}`;
      const customerId = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [{ customerId, txs: [{ units: 10, points: 10 }] }],
      });

      await expect(
        harness.service.commitBackfill(tenantId, 200),
      ).rejects.toThrow(UnauthorizedException);

      const nullRows = await countNullProgramRows(tenantId);
      expect(nullRows).toBe(1);
      const auditRows = await harness.auditRepo.count({
        where: { tenant_id: tenantId },
      });
      expect(auditRows).toBe(0);
    });
  });

  describe('previewBackfill', () => {
    it('reports the plan without writing anything', async () => {
      const tenantId = `tenant-preview-${randomUUID()}`;
      const customerId = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [{ customerId, txs: [{ units: 25, points: 25 }] }],
      });

      const report = await harness.service.previewBackfill(tenantId, 200);

      expect(report.dryRun).toBe(true);
      expect(report.customersScanned).toBe(1);
      expect(report.transactionsAttributed).toBe(0);
      expect(report.customersAttributed).toBe(0);
      expect(report.unresolved).toEqual([]);

      // No writes happened.
      const nullRows = await countNullProgramRows(tenantId);
      expect(nullRows).toBe(1);
      const projections = await harness.projectionRepo.count({
        where: { tenant_id: tenantId },
      });
      expect(projections).toBe(0);
      const customer = await harness.customerRepo.findOne({
        where: { id: customerId, tenant_id: tenantId },
      });
      expect(Number(customer?.points_balance)).toBe(0);
      const auditRows = await harness.auditRepo.count({
        where: { tenant_id: tenantId },
      });
      expect(auditRows).toBe(0);
    });

    it('reports ambiguous and none outcomes without writing', async () => {
      const ambiguousTenant = `tenant-preview-amb-${randomUUID()}`;
      const ambiguousCustomer = randomUUID();
      await harness.setupTenant({
        tenantId: ambiguousTenant,
        activeProgramCount: 2,
        customers: [
          { customerId: ambiguousCustomer, txs: [{ units: 5, points: 5 }] },
        ],
      });
      const noneTenant = `tenant-preview-none-${randomUUID()}`;
      const noneCustomer = randomUUID();
      await harness.setupTenant({
        tenantId: noneTenant,
        activeProgramCount: 0,
        customers: [
          { customerId: noneCustomer, txs: [{ units: 5, points: 5 }] },
        ],
      });

      const ambiguousReport = await harness.service.previewBackfill(
        ambiguousTenant,
        200,
      );
      expect(ambiguousReport.dryRun).toBe(true);
      expect(ambiguousReport.unresolved).toEqual([
        { customerId: ambiguousCustomer, outcome: 'PROGRAM_UNRESOLVED' },
      ]);

      const noneReport = await harness.service.previewBackfill(noneTenant, 200);
      expect(noneReport.unresolved).toEqual([
        { customerId: noneCustomer, outcome: 'none' },
      ]);

      const ambiguousNullRows = await countNullProgramRows(ambiguousTenant);
      expect(ambiguousNullRows).toBe(1);
      const noneNullRows = await countNullProgramRows(noneTenant);
      expect(noneNullRows).toBe(1);
    });

    it('exposes per-customer unassigned row counts in the report', async () => {
      // Two customers: one with 3 NULL rows, one with 1. The operator needs
      // the per-customer impact before committing, not just the aggregate.
      const tenantId = `tenant-preview-counts-${randomUUID()}`;
      const heavyCustomer = randomUUID();
      const lightCustomer = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [
          {
            customerId: heavyCustomer,
            txs: [
              { units: 10, points: 10 },
              { units: 20, points: 20 },
              { units: 30, points: 30 },
            ],
          },
          { customerId: lightCustomer, txs: [{ units: 5, points: 5 }] },
        ],
      });

      const report = await harness.service.previewBackfill(tenantId, 200);

      expect(report.customers).toEqual([
        { customerId: heavyCustomer, unassignedRowCount: 3 },
        { customerId: lightCustomer, unassignedRowCount: 1 },
      ]);
      // Entries stay aligned with the scan bound and the aggregate.
      expect(report.customersScanned).toBe(report.customers.length);
      const totalRows = report.customers.reduce(
        (sum, entry) => sum + entry.unassignedRowCount,
        0,
      );
      expect(totalRows).toBe(4);
      expect(await countNullProgramRows(tenantId)).toBe(4);
    });

    it('commitBackfill also reports the scanned customers with their counts', async () => {
      const tenantId = `tenant-commit-counts-${randomUUID()}`;
      const customerId = randomUUID();
      await harness.setupTenant({
        tenantId,
        activeProgramCount: 1,
        customers: [
          {
            customerId,
            txs: [
              { units: 10, points: 10 },
              { units: 15, points: 15 },
            ],
          },
        ],
      });

      const report = await harness.service.commitBackfill(
        tenantId,
        200,
        actorUserId,
      );

      expect(report.customers).toEqual([
        { customerId, unassignedRowCount: 2 },
      ]);
      expect(report.transactionsAttributed).toBe(2);
    });
  });
});
