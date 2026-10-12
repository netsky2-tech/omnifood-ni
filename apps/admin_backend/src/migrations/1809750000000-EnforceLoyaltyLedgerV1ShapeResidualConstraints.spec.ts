import { type QueryRunner } from 'typeorm';
import { EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000 } from './1809750000000-EnforceLoyaltyLedgerV1ShapeResidualConstraints';

/**
 * Unit acceptance for the residual §9.3 shape clauses (owner option A, T4
 * follow-up #4): up() must run one fail-closed pre-detection scan per residual
 * rule (units sign per declared type, non-zero reversal delta, declared-row
 * idempotency key, ADJUST actor/reason) and add exactly the
 * ck_loyalty_tx_v1_shape_residual CHECK matching the SHIPPED contract — the
 * version/snapshot clauses stay deliberately deferred (T4 legitimately writes
 * reward-less REDEEM and snapshot-less EARN rows; see
 * odd/tasks/loyalty-s93-residual-checks.md). A scan reporting violations must
 * abort with LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION, the clause kind and the
 * sample row ids, without mutating anything. down() only drops the CHECK.
 */

const CHECK_NAME = 'ck_loyalty_tx_v1_shape_residual';

const isResidualScan = (sql: string): boolean =>
  sql.includes(`pre-detection scan`) && sql.includes('occurrences');

const isExistenceCheck = (sql: string): boolean =>
  sql.includes('pg_constraint');

const isAddConstraint = (sql: string): boolean =>
  sql.includes(`ADD CONSTRAINT ${CHECK_NAME}`);

const isDropConstraint = (sql: string): boolean =>
  sql.includes(`DROP CONSTRAINT IF EXISTS ${CHECK_NAME}`);

const cleanRunner = (): QueryRunner =>
  ({
    query: jest.fn().mockImplementation((sql: string) => {
      if (isResidualScan(sql)) {
        return Promise.resolve([{ occurrences: 0, sample_ids: null }]);
      }
      if (isExistenceCheck(sql)) {
        return Promise.resolve([]); // constraint absent → must add
      }
      return Promise.resolve([]);
    }),
  }) as unknown as QueryRunner;

describe('EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000', () => {
  let migration: EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000;

  beforeEach(() => {
    migration =
      new EnforceLoyaltyLedgerV1ShapeResidualConstraints1809750000000();
  });

  describe('up()', () => {
    it('scans every residual rule fail-closed, then adds the CHECK', async () => {
      const runner = cleanRunner();
      await migration.up(runner);

      const queries = (runner.query as jest.Mock).mock.calls.map(
        (call) => call[0] as string,
      );
      const scans = queries.filter(isResidualScan);
      // earn_units, redeem_units, adjust_units, reversal_units,
      // declared_key, adjust_actor_reason
      expect(scans).toHaveLength(6);
      for (const kind of [
        'earn_units',
        'redeem_units',
        'adjust_units',
        'reversal_units',
        'declared_key',
        'adjust_actor_reason',
      ]) {
        expect(scans.some((sql) => sql.includes(kind))).toBe(true);
      }

      const add = queries.find(isAddConstraint);
      expect(add).toBeDefined();
      // Shipped-contract clause set: sign per declared type, non-zero
      // reversal delta (NULL allowed), declared-row key. No
      // version/snapshot clause and no occurred_at clause.
      expect(add).toContain(
        "transaction_type <> 'earn' OR (units IS NOT NULL AND units > 0)",
      );
      expect(add).toContain(
        "transaction_type <> 'redeem' OR (units IS NOT NULL AND units < 0)",
      );
      expect(add).toContain('actor_user_id IS NOT NULL');
      expect(add).toContain('idempotency_key IS NOT NULL');
      expect(add).toContain(
        "transaction_type <> 'reversal' OR units IS DISTINCT FROM 0",
      );
      expect(add).not.toContain('program_version');
      expect(add).not.toContain('commercial_snapshot');
      expect(add).not.toContain('occurred_at');
    });

    it('is idempotent: a same-named constraint short-circuits the ALTER', async () => {
      const runner = cleanRunner();
      (runner.query as jest.Mock).mockImplementation((sql: string) => {
        if (isExistenceCheck(sql)) {
          return Promise.resolve([{ 1: 1 }]); // constraint already there
        }
        if (isResidualScan(sql)) {
          return Promise.resolve([{ occurrences: 0, sample_ids: null }]);
        }
        return Promise.resolve([]);
      });

      await migration.up(runner);

      const queries = (runner.query as jest.Mock).mock.calls.map(
        (call) => call[0] as string,
      );
      expect(queries.some(isAddConstraint)).toBe(false);
    });

    it('aborts fail-closed with the violated kind and sample ids, touching nothing', async () => {
      const runner = cleanRunner();
      (runner.query as jest.Mock).mockImplementation((sql: string) => {
        if (isResidualScan(sql) && sql.includes('earn_units')) {
          return Promise.resolve([
            { occurrences: 2, sample_ids: ['row-7', 'row-9'] },
          ]);
        }
        if (isResidualScan(sql)) {
          return Promise.resolve([{ occurrences: 0, sample_ids: null }]);
        }
        return Promise.resolve([]);
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION[\s\S]*earn_units[\s\S]*row-7[\s\S]*row-9/,
      );
      const queries = (runner.query as jest.Mock).mock.calls.map(
        (call) => call[0] as string,
      );
      expect(queries.some(isAddConstraint)).toBe(false);
      expect(
        queries.some((sql) => sql.includes('UPDATE') || sql.includes('DELETE')),
      ).toBe(false);
    });
  });

  describe('down()', () => {
    it('drops only the residual CHECK', async () => {
      const runner = cleanRunner();
      await migration.down(runner);

      const queries = (runner.query as jest.Mock).mock.calls.map(
        (call) => call[0] as string,
      );
      expect(queries).toHaveLength(1);
      expect(isDropConstraint(queries[0])).toBe(true);
    });
  });
});
