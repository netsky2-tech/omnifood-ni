import { QueryResult, type QueryRunner } from 'typeorm';
import { CanonicalizeTemplateUomCodes1809610000000 } from './1809610000000-CanonicalizeTemplateUomCodes';

/**
 * T10/F2a — the template SOURCE rows must carry platform-canonical UOM codes.
 *
 * The seed (1787000000000) wrote uppercase non-canonical spellings ('UN',
 * 'KG', 'G', 'L', 'ML') while the platform UOM catalog (uom-catalog.ts) is
 * anchored on lowercase singular codes ('unidad', 'kg', 'g', 'l', 'ml').
 * Template-applied insumos inherited the non-canonical spellings, so the S3
 * conversion invariant and the UOM master data drifted by spelling.
 */
describe('CanonicalizeTemplateUomCodes1809610000000 (Unit)', () => {
  const migration = new CanonicalizeTemplateUomCodes1809610000000();

  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('canonicalizes template_products.uom UN → unidad on up', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toMatch(/UPDATE\s+template_products[\s\S]*SET\s+uom\s*=\s*'unidad'[\s\S]*WHERE[\s\S]*uom\s*=\s*'UN'/i);
  });

  it('canonicalizes template_insumos purchase_uom and consumption_uom on up', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // Exact seed-spelling pairs: canonical target ← uppercase source.
    for (const [canonical, uppercase] of [
      ['kg', 'KG'],
      ['g', 'G'],
      ['l', 'L'],
      ['ml', 'ML'],
      ['unidad', 'UN'],
    ] as const) {
      expect(sql).toMatch(
        new RegExp(
          `UPDATE\\s+template_insumos[\\s\\S]*SET\\s+purchase_uom\\s*=\\s*'${canonical}'[\\s\\S]*WHERE[\\s\\S]*purchase_uom\\s*=\\s*'${uppercase}'`,
          'i',
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `UPDATE\\s+template_insumos[\\s\\S]*SET\\s+consumption_uom\\s*=\\s*'${canonical}'[\\s\\S]*WHERE[\\s\\S]*consumption_uom\\s*=\\s*'${uppercase}'`,
          'i',
        ),
      );
    }
  });

  it('matches exact uppercase spellings only, never already-canonical values', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    // Per-statement checks: no UPDATE may rewrite a value that is already
    // canonical (idempotent repair), and every WHERE must pin the exact
    // uppercase seed spelling.
    for (const statement of queries) {
      if (statement.includes('UPDATE template_products')) {
        expect(statement).toMatch(/SET uom = 'unidad'[\s\S]*WHERE uom = 'UN'/);
        expect(statement).not.toMatch(/WHERE uom = 'unidad'/);
      }
      if (statement.includes('UPDATE template_insumos')) {
        for (const column of ['purchase_uom', 'consumption_uom'] as const) {
          if (!statement.includes(`SET ${column}`)) continue;
          expect(statement).toMatch(
            new RegExp(
              `SET ${column} = '(kg|g|l|ml|unidad)'[\\s\\S]*WHERE ${column} = '(KG|G|L|ML|UN)'`,
            ),
          );
          expect(statement).not.toMatch(
            new RegExp(`WHERE ${column} = '(kg|g|l|ml|unidad)'`),
          );
        }
      }
    }
  });

  it('reverses to the original seed spellings on down', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toMatch(/UPDATE\s+template_products[\s\S]*SET\s+uom\s*=\s*'UN'[\s\S]*WHERE[\s\S]*uom\s*=\s*'unidad'/i);
    expect(sql).toMatch(/purchase_uom\s*=\s*'KG'[\s\S]*WHERE[\s\S]*purchase_uom\s*=\s*'kg'/i);
    expect(sql).toMatch(/consumption_uom\s*=\s*'ML'[\s\S]*WHERE[\s\S]*consumption_uom\s*=\s*'ml'/i);
  });
});
