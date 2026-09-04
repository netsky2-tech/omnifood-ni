import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import {
  LoyaltyLedgerService,
  AppendLoyaltyTxDto,
} from './loyalty-ledger.service';
import {
  CustomerPointTransaction,
  PointTransactionType,
  LoyaltyTransactionOrigin,
} from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
  RewardDefinition,
  RewardType,
  RewardStatus,
} from '../entities/reward-definition.entity';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

describe('LV1.7C — Loyalty Sync Fault Suite (Real PostgreSQL)', () => {
  let dataSource: DataSource;
  let schema: string;
  let ledgerService: LoyaltyLedgerService;
  let txRepo: Repository<CustomerPointTransaction>;
  let projRepo: Repository<CustomerLoyaltyAccountProjection>;
  let progRepo: Repository<LoyaltyProgram>;
  let custRepo: Repository<Customer>;

  const tenantId = 'tenant-sync-fault';
  let customerId: string;
  let programId: string;

  beforeAll(async () => {
    schema = `loyalty_sync_fault_${randomUUID().replace(/-/g, '')}`;
    const bootstrap = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    await bootstrap.query(`CREATE TABLE "${schema}".tenants (
      id text PRIMARY KEY, name text NOT NULL, ruc text, is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    )`);

    await bootstrap.query(`CREATE TABLE "${schema}".customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
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

    await bootstrap.query(`CREATE TABLE "${schema}".reward_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loyalty_program_id uuid NOT NULL,
      tenant_id text NOT NULL, name text NOT NULL, reward_type text NOT NULL,
      cost_units int NOT NULL, benefit_config jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'DRAFT', presentation_order int NOT NULL DEFAULT 0,
      config_version int NOT NULL DEFAULT 1,
      starts_at timestamptz, ends_at timestamptz,
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

    await bootstrap.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        Customer,
        LoyaltyProgram,
        RewardDefinition,
        CustomerPointTransaction,
        CustomerLoyaltyAccountProjection,
      ],
      synchronize: false,
    });
    await dataSource.initialize();

    txRepo = dataSource.getRepository(CustomerPointTransaction);
    projRepo = dataSource.getRepository(CustomerLoyaltyAccountProjection);
    progRepo = dataSource.getRepository(LoyaltyProgram);
    custRepo = dataSource.getRepository(Customer);
    ledgerService = new LoyaltyLedgerService(txRepo, projRepo);

    await dataSource.getRepository(Tenant).save({
      id: tenantId,
      name: 'Sync Fault Test Tenant',
      is_active: true,
    });

    const customer = await custRepo.save({
      tenant_id: tenantId,
      name: 'Carlos Fault',
      points_balance: 0,
      is_active: true,
    });
    customerId = customer.id;

    const program = await progRepo.save({
      tenant_id: tenantId,
      name: 'Smash Rewards Fault',
      program_type: LoyaltyProgramType.SPEND_POINTS,
      status: LoyaltyProgramStatus.ACTIVE,
      config_version: 1,
      earning_rule: {
        pointsPerUnit: 1,
        spendPerUnitNio: 10,
        rounding: 'FLOOR',
      },
      eligibility_rule: {},
    });
    programId = program.id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  describe('AV-12: Duplicate resend idempotency', () => {
    it('duplicate sync resend returns original transaction without duplicate row or version bump', async () => {
      const idempotencyKey = `loyalty:earn:${tenantId}:ticket-100:${programId}`;
      const payload: AppendLoyaltyTxDto = {
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-100',
        transactionType: 'EARN',
        units: 15,
        idempotencyKey,
        origin: 'POS',
        occurredAt: new Date(),
      };

      const firstTx = await ledgerService.appendTransaction(payload);
      expect(firstTx).toBeDefined();

      const projFirst = await projRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projFirst.balance_units).toBe(15);
      const initialVersion = projFirst.projection_version;

      // Duplicate resend (retry from POS outbox)
      const duplicateTx = await ledgerService.appendTransaction(payload);
      expect(duplicateTx.id).toBe(firstTx.id);

      const count = await txRepo.count({
        where: { idempotency_key: idempotencyKey, tenant_id: tenantId },
      });
      expect(count).toBe(1);

      const projAfter = await projRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projAfter.balance_units).toBe(15);
      expect(projAfter.projection_version).toBe(initialVersion);
    });
  });

  describe('AV-13: Same idempotency key + different payload => integrity conflict', () => {
    it('rejects resend with same idempotency key but different units with ConflictException', async () => {
      const key = `loyalty:earn:${tenantId}:ticket-conflict:${programId}`;
      await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-conflict',
        transactionType: 'EARN',
        units: 20,
        idempotencyKey: key,
        origin: 'POS',
        occurredAt: new Date(),
      });

      // Different units!
      await expect(
        ledgerService.appendTransaction({
          tenantId,
          customerId,
          loyaltyProgramId: programId,
          ticketId: 'ticket-conflict',
          transactionType: 'EARN',
          units: 99, // Tampered payload
          idempotencyKey: key,
          origin: 'POS',
          occurredAt: new Date(),
        }),
      ).rejects.toThrow(ConflictException);

      // Verify original units unchanged in DB
      const existing = await txRepo.findOne({
        where: { idempotency_key: key },
      });
      expect(existing.units).toBe(20);
    });
  });

  describe('AV-14: Stale config offline preserves historical commercial snapshot', () => {
    it('offline transaction generated with config_version 1 preserves original calculation after program bump', async () => {
      // 1. Program is updated to v2 on cloud
      await progRepo.increment(
        { id: programId, tenant_id: tenantId },
        'config_version',
        1,
      );

      // 2. Inbound sync from offline terminal arrives with snapshot under v1
      const staleSnapshot = {
        ruleSnapshot: { pointsPerUnit: 1, spendPerUnitNio: 10 },
        calculatedAtUtc: '2026-09-01T10:00:00Z',
        appliedSpendNio: 100,
        offlineClientVersion: '1.4.0',
      };

      const tx = await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-stale-offline',
        transactionType: 'EARN',
        units: 10,
        programVersion: 1, // Offline terminal used v1
        commercialSnapshot: staleSnapshot,
        origin: 'POS',
        idempotencyKey: `loyalty:earn:${tenantId}:ticket-stale-offline:${programId}`,
        occurredAt: new Date('2026-09-01T10:00:00Z'),
      });

      expect(tx.program_version).toBe(1);
      expect((tx.commercial_snapshot as any).offlineClientVersion).toBe(
        '1.4.0',
      );
      expect((tx.commercial_snapshot as any).appliedSpendNio).toBe(100);
    });
  });

  describe('AV-15: Cloud ADJUST inbound & no echo loop', () => {
    it('cloud-originated ADJUST is recorded with CLOUD origin and updates projection correctly', async () => {
      const actorId = randomUUID();
      const adjustTx = await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        transactionType: 'ADJUST',
        units: -5,
        reason: 'Customer goodwill gesture correction',
        actorUserId: actorId,
        origin: 'CLOUD',
        idempotencyKey: `loyalty:adjust:${tenantId}:${customerId}:cloud-adj-01`,
        occurredAt: new Date(),
      });

      expect(adjustTx.origin).toBe('CLOUD');
      expect(adjustTx.actor_user_id).toBe(actorId);
      expect(adjustTx.reason).toBe('Customer goodwill gesture correction');

      // Verify projection updated
      const proj = await projRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      // 15 (test 1) + 20 (test 2) + 10 (test 3) - 5 (adjust) = 40
      expect(proj.balance_units).toBe(40);
    });

    it('distinguishes POS vs CLOUD origin to prevent echo loop', async () => {
      const posTx = await txRepo.find({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          origin: LoyaltyTransactionOrigin.POS,
        },
      });
      const cloudTx = await txRepo.find({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          origin: LoyaltyTransactionOrigin.CLOUD,
        },
      });

      expect(posTx.length).toBeGreaterThan(0);
      expect(cloudTx.length).toBe(1);

      // Verify every POS tx has origin POS and cloud has origin CLOUD
      expect(posTx.every((t) => t.origin === 'POS')).toBe(true);
      expect(cloudTx.every((t) => t.origin === 'CLOUD')).toBe(true);
    });
  });

  describe('Cursor Replay & Projection Verification', () => {
    it('cursor query over occurred_at and id reproduces complete uncorrupted ledger stream', async () => {
      const allTx = await txRepo.find({
        where: { tenant_id: tenantId, customer_id: customerId },
        order: { occurred_at: 'ASC', id: 'ASC' },
      });

      expect(allTx.length).toBe(4);
      const sumUnits = allTx.reduce((sum, t) => sum + Number(t.units ?? 0), 0);

      const proj = await projRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });

      expect(proj.balance_units).toBe(sumUnits);
    });
  });
});
