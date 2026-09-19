import { QueryResult, type QueryRunner } from 'typeorm';
import { ReconcileEnumColumns1809180000000 } from './1809180000000-ReconcileEnumColumns';

interface ColumnKeyState {
  dataType: string;
  udtName: string;
}

interface Harness {
  sql: string[];
  /** Every statement including the answered reads, in order. */
  all: string[];
  offenders: Map<string, { value: string; occurrences: string }[]>;
  forcedRls: Map<string, boolean>;
}

/**
 * The migration reads three things before it writes: the column's current type,
 * whether the table is FORCE ROW LEVEL SECURITY, and the rows that would not
 * survive the cast. This runner answers those reads per table.column and records
 * every statement it does not answer, so a test can assert both the decision
 * and the emitted SQL.
 */
const makeRunner = (options?: {
  states?: Record<string, ColumnKeyState | null>;
  offenders?: Record<string, { value: string; occurrences: string }[]>;
  forcedRls?: Record<string, boolean>;
}): { runner: QueryRunner; captured: Harness } => {
  const captured: Harness = {
    sql: [],
    all: [],
    offenders: new Map(Object.entries(options?.offenders ?? {})),
    forcedRls: new Map(Object.entries(options?.forcedRls ?? {})),
  };
  const states = new Map(Object.entries(options?.states ?? {}));

  const runner = {
    query: jest.fn((sql: string, parameters?: unknown[]): Promise<unknown> => {
      captured.all.push(sql);
      if (sql.includes('information_schema.columns')) {
        const [table, column] = parameters as [string, string];
        const state = states.get(`${table}.${column}`) ?? null;
        return Promise.resolve(state === null ? [] : [state]);
      }
      if (sql.includes('relforcerowsecurity')) {
        const [table] = parameters as [string];
        return Promise.resolve([
          { forced: captured.forcedRls.get(table) ?? false },
        ]);
      }
      if (sql.includes('NOT IN (')) {
        // The counting SELECT does not parameterize the table; read it from
        // the FROM clause so offenders stay per-target.
        const fromMatch = sql.match(/FROM "([A-Za-z_0-9]+)"/);
        const table = fromMatch ? fromMatch[1] : '';
        return Promise.resolve(captured.offenders.get(table) ?? []);
      }
      captured.sql.push(sql);
      return Promise.resolve(new QueryResult());
    }),
  } as unknown as QueryRunner;

  return { runner, captured };
};

const emitted = (captured: Harness): string => captured.sql.join('\n');
const everything = (captured: Harness): string => captured.all.join('\n');

const VARCHAR_STATE: ColumnKeyState = {
  dataType: 'character varying',
  udtName: 'varchar',
};

const ENUM_STATE = (enumType: string): ColumnKeyState => ({
  dataType: 'USER-DEFINED',
  udtName: enumType,
});

const TXN_ENUM = 'customer_point_transactions_transaction_type_enum';
const KARDEX_ENUM = 'inventory_kardex_movement_type_enum';

describe('ReconcileEnumColumns1809180000000', () => {
  const migration = new ReconcileEnumColumns1809180000000();

  describe('up(): conversion per descriptor', () => {
    it('converts each varchar column to its enum with the order PostgreSQL requires', async () => {
      const cases: Array<{
        table: string;
        column: string;
        enumType: string;
        defaultMember: string | null;
        caseFold: boolean;
      }> = [
        {
          table: 'customer_point_transactions',
          column: 'transaction_type',
          enumType: TXN_ENUM,
          defaultMember: null,
          caseFold: true,
        },
        {
          table: 'customer_point_transactions',
          column: 'origin',
          enumType: 'customer_point_transactions_origin_enum',
          defaultMember: null,
          caseFold: false,
        },
        {
          table: 'customer_point_transactions',
          column: 'type',
          enumType: 'customer_point_transactions_type_enum',
          defaultMember: 'earn',
          caseFold: false,
        },
        {
          table: 'inventory_kardex',
          column: 'movement_type',
          enumType: KARDEX_ENUM,
          defaultMember: null,
          caseFold: false,
        },
        {
          table: 'kardex_recalculate_queue',
          column: 'status',
          enumType: 'kardex_recalculate_queue_status_enum',
          defaultMember: 'PENDING',
          caseFold: false,
        },
        {
          table: 'promotions',
          column: 'type',
          enumType: 'promotions_type_enum',
          defaultMember: 'buyXGetYFree',
          caseFold: false,
        },
      ];

      for (const target of cases) {
        const { runner, captured } = makeRunner({
          states: { [`${target.table}.${target.column}`]: VARCHAR_STATE },
        });

        await migration.up(runner);
        const sql = emitted(captured);

        expect(sql).toContain('DROP DEFAULT');
        expect(sql).toContain(
          `ALTER TABLE "${target.table}" ALTER COLUMN "${target.column}" TYPE "${target.enumType}"`,
        );
        expect(sql).toContain(
          target.caseFold
            ? `USING lower("${target.column}"::text)::"${target.enumType}"`
            : `USING "${target.column}"::text::"${target.enumType}"`,
        );
        if (target.defaultMember === null) {
          // A default that never existed must not be invented.
          expect(sql).not.toContain('SET DEFAULT');
        } else {
          expect(sql).toContain(
            `SET DEFAULT '${target.defaultMember}'::"${target.enumType}"`,
          );
          expect(sql.indexOf('DROP DEFAULT')).toBeLessThan(
            sql.indexOf(
              `ALTER COLUMN "${target.column}" TYPE "${target.enumType}"`,
            ),
          );
          expect(
            sql.indexOf(
              `ALTER COLUMN "${target.column}" TYPE "${target.enumType}"`,
            ),
          ).toBeLessThan(sql.indexOf('SET DEFAULT'));
        }
      }
    });

    it('creates every enum type, with every member, before using it', async () => {
      const { runner, captured } = makeRunner({
        states: { 'inventory_kardex.movement_type': VARCHAR_STATE },
      });

      await migration.up(runner);

      const createType = captured.sql.find((q) => q.includes('CREATE TYPE'));
      expect(createType).toBeDefined();
      expect(createType).toContain(KARDEX_ENUM);
      for (const member of [
        'SALE',
        'SALE_CANCEL',
        'PURCHASE',
        'ENTRADA_COMPRA',
        'SHRINKAGE',
        'PRODUCTION',
        'CREDIT_NOTE_RESTOCK',
        'ADJUSTMENT',
        'REVERSAL',
        'INITIAL_STOCK',
      ]) {
        expect(createType).toContain(`'${member}'`);
      }
      expect(captured.sql.indexOf('CREATE TYPE')).toBeLessThan(
        captured.sql.findIndex((q) =>
          q.includes('ALTER COLUMN "movement_type" TYPE'),
        ),
      );
    });

    it('is a no-op when a column is already its enum type', async () => {
      const { runner, captured } = makeRunner({
        states: { 'inventory_kardex.movement_type': ENUM_STATE(KARDEX_ENUM) },
      });

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('skips targets whose table the schema does not have', async () => {
      const { runner, captured } = makeRunner();

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('refuses a column type it cannot convert instead of guessing', async () => {
      const { runner, captured } = makeRunner({
        states: {
          'inventory_kardex.movement_type': {
            dataType: 'integer',
            udtName: 'int4',
          },
        },
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /UNEXPECTED_ENUM_COLUMN_TYPE/,
      );
      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });
  });

  describe('up(): the fail-closed membership guard', () => {
    it('throws naming the offending values before any ALTER', async () => {
      const { runner, captured } = makeRunner({
        states: { 'inventory_kardex.movement_type': VARCHAR_STATE },
        offenders: {
          inventory_kardex: [{ value: 'MYSTERY', occurrences: '3' }],
        },
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /ENUM_COLUMN_VALUE_NOT_A_MEMBER: inventory_kardex\.movement_type/,
      );
      await expect(migration.up(runner)).rejects.toThrow(
        /'MYSTERY' \(3 row\(s\)\)/,
      );
      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });

    it('never rewrites a value, whatever it does emit', async () => {
      const { runner, captured } = makeRunner({
        states: { 'promotions.type': VARCHAR_STATE },
      });

      await migration.up(runner);

      expect(emitted(captured)).not.toMatch(/UPDATE\s+"?promotions/i);
      expect(emitted(captured)).not.toMatch(/INSERT INTO/i);
      expect(emitted(captured)).not.toMatch(/DELETE FROM/i);
    });
  });

  describe('up(): the case-fold path for transaction_type', () => {
    it('accepts a case-folded member and converts with lower()', async () => {
      const { runner, captured } = makeRunner({
        states: {
          'customer_point_transactions.transaction_type': VARCHAR_STATE,
        },
      });

      await migration.up(runner);
      const sql = emitted(captured);

      expect(sql).toContain(
        `USING lower("transaction_type"::text)::"${TXN_ENUM}"`,
      );
      // The membership guard runs case-folded for this column.
      expect(everything(captured)).toContain(
        'AND lower("transaction_type"::text) NOT IN',
      );
    });

    it('still fails closed for a value that is a member in no case', async () => {
      const { runner, captured } = makeRunner({
        states: {
          'customer_point_transactions.transaction_type': VARCHAR_STATE,
        },
        offenders: {
          customer_point_transactions: [{ value: 'REFUND', occurrences: '1' }],
        },
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /'REFUND' \(1 row\(s\)\)/,
      );
      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });
  });

  describe('up(): FORCE ROW LEVEL SECURITY handling', () => {
    it('drops FORCE before the count and restores it after the conversion', async () => {
      const { runner, captured } = makeRunner({
        states: { 'inventory_kardex.movement_type': VARCHAR_STATE },
        forcedRls: { inventory_kardex: true },
      });

      await migration.up(runner);

      const all = everything(captured);

      expect(all).toContain(
        'ALTER TABLE "inventory_kardex" NO FORCE ROW LEVEL SECURITY',
      );
      expect(all).toContain(
        'ALTER TABLE "inventory_kardex" FORCE ROW LEVEL SECURITY',
      );
      // FORCE must be dropped before the counting SELECT that would otherwise
      // be filtered to zero rows, and restored only after the ALTER.
      expect(all.indexOf('NO FORCE ROW LEVEL SECURITY')).toBeLessThan(
        all.indexOf('NOT IN ('),
      );
      expect(
        all.indexOf(`ALTER COLUMN "movement_type" TYPE "${KARDEX_ENUM}"`),
      ).toBeLessThan(
        all.lastIndexOf(
          'ALTER TABLE "inventory_kardex" FORCE ROW LEVEL SECURITY',
        ),
      );
    });

    it('does not touch RLS on tables that are not FORCE', async () => {
      const { runner, captured } = makeRunner({
        states: { 'promotions.type': VARCHAR_STATE },
        forcedRls: { promotions: false },
      });

      await migration.up(runner);

      expect(emitted(captured)).not.toContain('ROW LEVEL SECURITY');
    });

    it('restores FORCE even when the membership guard throws', async () => {
      const { runner, captured } = makeRunner({
        states: { 'inventory_kardex.movement_type': VARCHAR_STATE },
        forcedRls: { inventory_kardex: true },
        offenders: {
          inventory_kardex: [{ value: 'MYSTERY', occurrences: '2' }],
        },
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /ENUM_COLUMN_VALUE_NOT_A_MEMBER/,
      );

      const all = everything(captured);
      expect(all).toContain(
        'ALTER TABLE "inventory_kardex" NO FORCE ROW LEVEL SECURITY',
      );
      expect(all).toContain(
        'ALTER TABLE "inventory_kardex" FORCE ROW LEVEL SECURITY',
      );
      expect(all.lastIndexOf('FORCE ROW LEVEL SECURITY')).toBeGreaterThan(
        all.indexOf('NOT IN ('),
      );
      expect(emitted(captured)).not.toContain('ALTER COLUMN');
    });
  });

  describe('down()', () => {
    it('restores character varying and the pre-existing default per descriptor', async () => {
      const { runner, captured } = makeRunner({
        states: {
          'customer_point_transactions.type': ENUM_STATE(
            'customer_point_transactions_type_enum',
          ),
          'inventory_kardex.movement_type': ENUM_STATE(KARDEX_ENUM),
        },
      });

      await migration.down(runner);
      const sql = emitted(captured);

      expect(sql).toContain(
        'ALTER TABLE "customer_point_transactions" ALTER COLUMN "type" TYPE character varying',
      );
      expect(sql).toContain(`SET DEFAULT 'earn'::character varying`);
      expect(sql).toContain(
        'ALTER TABLE "inventory_kardex" ALTER COLUMN "movement_type" TYPE character varying',
      );
      // movement_type has no default today; down() must not invent one.
      expect(sql).not.toContain(
        'ALTER TABLE "inventory_kardex" ALTER COLUMN "movement_type" SET DEFAULT',
      );
      expect(sql).not.toContain('DROP TABLE');
    });

    it('is a no-op when a column is not on its enum', async () => {
      const { runner, captured } = makeRunner({
        states: { 'promotions.type': VARCHAR_STATE },
      });

      await migration.down(runner);

      expect(captured.sql).toHaveLength(0);
    });
  });
});
