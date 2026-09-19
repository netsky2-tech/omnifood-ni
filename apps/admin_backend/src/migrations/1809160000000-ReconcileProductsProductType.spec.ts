import { QueryResult, type QueryRunner } from 'typeorm';
import { ReconcileProductsProductType1809160000000 } from './1809160000000-ReconcileProductsProductType';

const ENUM_TYPE = 'products_product_type_enum';
const COLUMN_STATE_SQL = 'information_schema.columns';

interface Harness {
  sql: string[];
  runners: { value: string; occurrences: string }[];
}

/**
 * The migration reads two things before it writes: the column's current type and
 * the rows that would not survive the cast. This runner answers those reads and
 * records everything else, so a test can assert both the decision and the SQL.
 */
const makeRunner = (
  state: { dataType: string; udtName: string } | null,
  offenders: { value: string; occurrences: string }[] = [],
): { runner: QueryRunner; captured: Harness } => {
  const captured: Harness = { sql: [], runners: offenders };

  const runner = {
    query: jest.fn((sql: string): Promise<unknown> => {
      if (sql.includes(COLUMN_STATE_SQL)) {
        return Promise.resolve(state === null ? [] : [state]);
      }
      if (sql.includes('CREATE TYPE')) {
        return Promise.resolve(new QueryResult());
      }
      if (sql.includes('NOT IN (')) {
        return Promise.resolve(captured.runners);
      }
      captured.sql.push(sql);
      return Promise.resolve(new QueryResult());
    }),
  } as unknown as QueryRunner;

  return { runner, captured };
};

const emitted = (captured: Harness): string => captured.sql.join('\n');

describe('ReconcileProductsProductType1809160000000', () => {
  const migration = new ReconcileProductsProductType1809160000000();

  describe('up()', () => {
    it('converts a text column to the enum, in the order PostgreSQL requires', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'character varying',
        udtName: 'varchar',
      });

      await migration.up(runner);
      const sql = emitted(captured);

      expect(sql).toContain('DROP DEFAULT');
      expect(sql).toContain(
        `ALTER TABLE "products" ALTER COLUMN "product_type" TYPE "${ENUM_TYPE}"`,
      );
      expect(sql).toContain(`USING "product_type"::text::"${ENUM_TYPE}"`);
      expect(sql).toContain(`SET DEFAULT 'SIMPLE'::"${ENUM_TYPE}"`);

      // DROP DEFAULT must precede the type change, or the old varchar default
      // cannot be cast and PostgreSQL rejects the ALTER.
      expect(sql.indexOf('DROP DEFAULT')).toBeLessThan(
        sql.indexOf(`TYPE "${ENUM_TYPE}"`),
      );
    });

    it('creates the enum type, with every member, before using it', async () => {
      const queries: string[] = [];
      const runner = {
        query: jest.fn((sql: string): Promise<unknown> => {
          if (sql.includes(COLUMN_STATE_SQL)) {
            return Promise.resolve([
              { dataType: 'character varying', udtName: 'varchar' },
            ]);
          }
          if (sql.includes('NOT IN (')) return Promise.resolve([]);
          queries.push(sql);
          return Promise.resolve(new QueryResult());
        }),
      } as unknown as QueryRunner;

      await migration.up(runner);

      const createTypeIndex = queries.findIndex((q) =>
        q.includes('CREATE TYPE'),
      );
      expect(createTypeIndex).toBeGreaterThanOrEqual(0);
      const createType = queries[createTypeIndex];
      for (const member of [
        'SIMPLE',
        'COMPOUND',
        'PREPARED',
        'VARIANT_PARENT',
      ]) {
        expect(createType).toContain(`'${member}'`);
      }
      // And it is created before the ALTER that needs it.
      expect(createTypeIndex).toBeLessThan(
        queries.findIndex((q) =>
          q.includes('ALTER COLUMN "product_type" TYPE'),
        ),
      );
    });

    it('is a no-op when the column is already the enum', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'USER-DEFINED',
        udtName: ENUM_TYPE,
      });

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('is a no-op when the schema has no products table', async () => {
      const { runner, captured } = makeRunner(null);

      await migration.up(runner);

      expect(captured.sql).toHaveLength(0);
    });

    it('fails closed, naming the offending values, before any ALTER', async () => {
      const { runner, captured } = makeRunner(
        { dataType: 'character varying', udtName: 'varchar' },
        [{ value: 'KIT', occurrences: '3' }],
      );

      await expect(migration.up(runner)).rejects.toThrow(
        /PRODUCT_TYPE_VALUE_NOT_A_MEMBER/,
      );

      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });

    it('names the unrecognised value and its row count in the failure', async () => {
      const { runner } = makeRunner(
        { dataType: 'character varying', udtName: 'varchar' },
        [{ value: 'KIT', occurrences: '3' }],
      );

      await expect(migration.up(runner)).rejects.toThrow(
        /'KIT' \(3 row\(s\)\)/,
      );
    });

    it('refuses a type it cannot convert instead of guessing', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'integer',
        udtName: 'int4',
      });

      await expect(migration.up(runner)).rejects.toThrow(
        /UNEXPECTED_PRODUCT_TYPE_COLUMN/,
      );
      expect(captured.sql.join('\n')).not.toContain('ALTER COLUMN');
    });

    it('never rewrites a value, whatever it does emit', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'character varying',
        udtName: 'varchar',
      });

      await migration.up(runner);

      expect(emitted(captured)).not.toMatch(/UPDATE\s+"?products/i);
      expect(emitted(captured)).not.toMatch(/INSERT INTO/i);
      expect(emitted(captured)).not.toMatch(/DELETE FROM/i);
    });
  });

  describe('down()', () => {
    it('restores character varying and the previous default', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'USER-DEFINED',
        udtName: ENUM_TYPE,
      });

      await migration.down(runner);
      const sql = emitted(captured);

      expect(sql).toContain(
        'ALTER TABLE "products" ALTER COLUMN "product_type" TYPE character varying',
      );
      expect(sql).toContain(`USING "product_type"::text`);
      expect(sql).toContain(`SET DEFAULT 'SIMPLE'::character varying`);
      expect(sql).not.toContain('DROP TABLE');
    });

    it('is a no-op when the column is not on the enum', async () => {
      const { runner, captured } = makeRunner({
        dataType: 'character varying',
        udtName: 'varchar',
      });

      await migration.down(runner);

      expect(captured.sql).toHaveLength(0);
    });
  });
});
