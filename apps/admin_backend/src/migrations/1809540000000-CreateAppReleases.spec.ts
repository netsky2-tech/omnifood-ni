import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateAppReleases1809540000000 } from './1809540000000-CreateAppReleases';

describe('CreateAppReleases1809540000000', () => {
  const migration = new CreateAppReleases1809540000000();

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

  it('creates the app_releases table with schema, unique constraint, and lookup index', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE app_releases');
    expect(sql).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sql).toContain('channel VARCHAR(32) NOT NULL');
    expect(sql).toContain('abi VARCHAR(32) NOT NULL');
    expect(sql).toContain('version_code INTEGER NOT NULL');
    expect(sql).toContain('version_name VARCHAR(32) NOT NULL');
    expect(sql).toContain('sha256 VARCHAR(64) NOT NULL');
    expect(sql).toContain('size_bytes BIGINT NOT NULL');
    expect(sql).toContain('storage_key VARCHAR(255) NOT NULL');
    expect(sql).toContain('min_from_version_code INTEGER NOT NULL');
    expect(sql).toContain('mandatory BOOLEAN NOT NULL DEFAULT FALSE');
    expect(sql).toContain(
      'CONSTRAINT uq_app_releases_channel_abi_version_code UNIQUE (channel, abi, version_code)',
    );
    expect(sql).toContain('CREATE INDEX idx_app_releases_lookup');
    expect(sql).toContain(
      'ON app_releases (channel, abi, version_code DESC)',
    );
  });

  it('drops the table in down()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP TABLE IF EXISTS app_releases');
  });
});
