import { QueryResult, type QueryRunner } from 'typeorm';
import { AddInvoiceNumberUniqueness1809270000000 } from './1809270000000-AddInvoiceNumberUniqueness';

const CONSTRAINT_NAME = 'uq_invoices_tenant_invoice_number';
const CLEANUP_SCRIPT = 'scripts/dev-cleanup-duplicate-invoice-numbers.sql';
const INCIDENT_PROCEDURE = 'docs/operations/pilot-terminal-incident-procedure.md';

interface DuplicateGroup {
  tenantId: string;
  invoiceNumber: string;
  n: number;
}

/**
 * The migration reads two things before it writes: whether `invoices` is FORCE
 * ROW LEVEL SECURITY, and which (tenant_id, invoice_number) groups are
 * duplicated. This runner answers those two reads from the options and records
 * every statement it does not answer, so a test can assert both the decision
 * and the emitted SQL — including the AC-11 assertion that no DELETE or UPDATE
 * is ever issued.
 */
const makeRunner = (options?: {
  forcedRls?: boolean;
  duplicateGroups?: DuplicateGroup[];
}): { runner: QueryRunner; sql: string[]; all: string[] } => {
  const sql: string[] = [];
  const all: string[] = [];

  const runner = {
    query: jest.fn((statement: string): Promise<unknown> => {
      all.push(statement);
      if (statement.includes('relforcerowsecurity')) {
        return Promise.resolve([{ forced: options?.forcedRls ?? false }]);
      }
      if (statement.includes('GROUP BY')) {
        return Promise.resolve(options?.duplicateGroups ?? []);
      }
      sql.push(statement);
      return Promise.resolve(new QueryResult());
    }),
  } as unknown as QueryRunner;

  return { runner, sql, all };
};

/**
 * The exact duplicate fingerprint observed in the live dev database: three
 * duplicate groups born of the hardcoded 1..1000 POS boot range, two rows
 * each. Synthetic, not real fiscal collisions — but the migration must treat
 * them as blockers all the same.
 */
const DEV_FINGERPRINT: DuplicateGroup[] = [
  {
    tenantId: '497d0f48-027c-4d86-ac33-9d6d070822c7',
    invoiceNumber: '001-001-01-00000001',
    n: 2,
  },
  {
    tenantId: '497d0f48-027c-4d86-ac33-9d6d070822c7',
    invoiceNumber: '001-001-01-00000002',
    n: 2,
  },
  {
    tenantId: 'e05bf002-b1d3-45f2-a46a-3592e1cc1431',
    invoiceNumber: '001-001-01-00000003',
    n: 2,
  },
];

const emitted = (sql: string[]): string => sql.join('\n');
const everything = (all: string[]): string => all.join('\n');

describe('AddInvoiceNumberUniqueness1809270000000', () => {
  const migration = new AddInvoiceNumberUniqueness1809270000000();

  describe('up(): fail-closed duplicate guard', () => {
    it('rejects when duplicate invoice numbers exist, naming the constraint, the offender count and the offender rows', async () => {
      const { runner } = makeRunner({ duplicateGroups: DEV_FINGERPRINT });

      await expect(migration.up(runner)).rejects.toThrow(
        /DUPLICATE_INVOICE_NUMBERS.*3 duplicate \(tenant_id, invoice_number\) group\(s\)/s,
      );
      await expect(migration.up(runner)).rejects.toThrow(CONSTRAINT_NAME);
      await expect(migration.up(runner)).rejects.toThrow(
        'tenant_id=497d0f48-027c-4d86-ac33-9d6d070822c7 number=001-001-01-00000001 rows=2',
      );
      await expect(migration.up(runner)).rejects.toThrow(
        'tenant_id=497d0f48-027c-4d86-ac33-9d6d070822c7 number=001-001-01-00000002 rows=2',
      );
      await expect(migration.up(runner)).rejects.toThrow(
        'tenant_id=e05bf002-b1d3-45f2-a46a-3592e1cc1431 number=001-001-01-00000003 rows=2',
      );
    });

    it('names the dev/staging cleanup script and the Scenario D fiscal path, and refuses to automate either', async () => {
      const { runner } = makeRunner({ duplicateGroups: DEV_FINGERPRINT });

      let message = '';
      await migration.up(runner).catch((error: Error) => {
        message = error.message;
      });

      expect(message).toContain(CLEANUP_SCRIPT);
      expect(message).toContain('development or staging');
      expect(message).toContain(INCIDENT_PROCEDURE);
      expect(message).toContain('Scenario D');
      expect(message).toMatch(/fiscal incident/i);
      expect(message).toMatch(/not a cleanup to automate/i);
    });

    it('never issues a DELETE or UPDATE statement when duplicates block the migration (issue #526 AC-11)', async () => {
      const { runner, all } = makeRunner({ duplicateGroups: DEV_FINGERPRINT });

      await expect(migration.up(runner)).rejects.toThrow(
        /DUPLICATE_INVOICE_NUMBERS/,
      );

      // The guard is the point: the append-only trigger on invoices raises on
      // any DELETE, and AC-11 forbids satisfying this criterion by editing an
      // issued invoice. The recorded log must contain no mutation at all.
      expect(everything(all)).not.toMatch(/\b(DELETE|UPDATE)\b/i);
      // And the guard actually ran: the rejection came from data, not from a
      // skipped check.
      expect(
        all.some((statement) => statement.includes('GROUP BY')),
      ).toBe(true);
    });

    it('caps the offender list at 10 entries while reporting the full group count', async () => {
      const twelveGroups: DuplicateGroup[] = Array.from(
        { length: 12 },
        (_, index) => ({
          tenantId: '497d0f48-027c-4d86-ac33-9d6d070822c7',
          invoiceNumber: `001-001-01-${String(index + 1).padStart(8, '0')}`,
          n: 2,
        }),
      );
      const { runner } = makeRunner({ duplicateGroups: twelveGroups });

      let message = '';
      await migration.up(runner).catch((error: Error) => {
        message = error.message;
      });

      expect(message).toContain('12 duplicate (tenant_id, invoice_number) group(s)');
      expect(message.match(/tenant_id=/g)).toHaveLength(10);
    });
  });

  describe('up(): index creation on a clean table', () => {
    it('issues exactly one CREATE UNIQUE INDEX with the exact constraint name and both key columns', async () => {
      const { runner, sql } = makeRunner();

      await migration.up(runner);

      const creates = sql.filter((statement) =>
        statement.includes('CREATE UNIQUE INDEX'),
      );
      expect(creates).toHaveLength(1);
      expect(emitted(sql)).toContain(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${CONSTRAINT_NAME} ON "invoices" (tenant_id, invoice_number)`,
      );
    });

    it('leaves FORCE ROW LEVEL SECURITY untouched when the table is not FORCE-enabled', async () => {
      const { runner, sql } = makeRunner({ forcedRls: false });

      await migration.up(runner);

      expect(emitted(sql)).not.toMatch(/ROW LEVEL SECURITY/i);
    });

    it('temporarily relaxes FORCE RLS around the guard and restores it, so the guard is not vacuous on a FORCE-enabled table', async () => {
      const { runner, all } = makeRunner({ forcedRls: true });

      await migration.up(runner);

      const noForce = all.findIndex((statement) =>
        statement.includes('NO FORCE ROW LEVEL SECURITY'),
      );
      const guard = all.findIndex((statement) =>
        statement.includes('GROUP BY'),
      );
      const restore = all.findIndex(
        (statement) =>
          statement.includes('FORCE ROW LEVEL SECURITY') &&
          !statement.includes('NO FORCE'),
      );
      expect(noForce).toBeGreaterThan(-1);
      expect(guard).toBeGreaterThan(noForce);
      expect(restore).toBeGreaterThan(guard);
    });

    it('is idempotent on a re-run: the CREATE stays guarded by IF NOT EXISTS and never throws', async () => {
      const first = makeRunner();
      const second = makeRunner();

      await migration.up(first.runner);
      await expect(migration.up(second.runner)).resolves.toBeUndefined();

      const createPattern = /CREATE UNIQUE INDEX IF NOT EXISTS/u;
      expect(first.all.filter((s) => createPattern.test(s))).toHaveLength(1);
      expect(second.all.filter((s) => createPattern.test(s))).toHaveLength(1);
    });
  });

  describe('down(): drops only the index', () => {
    it('issues exactly one DROP INDEX IF EXISTS for this constraint and nothing else', async () => {
      const { runner, all } = makeRunner();

      await migration.down(runner);

      expect(all).toEqual([
        'DROP INDEX IF EXISTS uq_invoices_tenant_invoice_number',
      ]);
      expect(everything(all)).not.toMatch(/\b(DELETE|UPDATE|ALTER)\b/i);
    });
  });
});
