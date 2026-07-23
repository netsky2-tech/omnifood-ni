import { getMetadataArgsStorage, type QueryRunner } from 'typeorm';
import { AuditLog } from '../modules/identity/entities/audit-log.entity';
import { AddAuditLogHashVersion1784000000000 } from './1784000000000-AddAuditLogHashVersion';

describe('AddAuditLogHashVersion1784000000000', () => {
  const migration = new AddAuditLogHashVersion1784000000000();
  const collectSql = async (direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  it('maps nullable hash provenance on audit logs', () => {
    const column = getMetadataArgsStorage().columns.find(
      ({ target, propertyName }) =>
        target === AuditLog && propertyName === 'hash_version',
    );

    expect(column?.options).toEqual(
      expect.objectContaining({ nullable: true }),
    );
  });

  it('maps protocol-valid nullable metadata on fresh audit log schemas', () => {
    const column = getMetadataArgsStorage().columns.find(
      ({ target, propertyName }) =>
        target === AuditLog && propertyName === 'metadata',
    );

    expect(column?.options).toEqual(
      expect.objectContaining({ type: 'jsonb', nullable: true }),
    );
  });

  it('adds a nullable varchar column without defaults or historical rewrites', async () => {
    const sql = await collectSql();

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS hash_version VARCHAR');
    expect(sql).toContain('ALTER COLUMN metadata DROP NOT NULL');
    expect(sql).not.toMatch(/DEFAULT|UPDATE|DELETE|INSERT/i);
  });

  it('drops only the migration-owned column on rollback', async () => {
    const sql = await collectSql('down');

    expect(sql).toContain('ALTER COLUMN metadata SET NOT NULL');
    expect(sql).toContain('DROP COLUMN IF EXISTS hash_version');
    expect(sql).not.toMatch(/UPDATE|DELETE|INSERT/i);
  });
});
