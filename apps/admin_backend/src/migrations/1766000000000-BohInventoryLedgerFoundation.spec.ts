import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';

type ExistsRow = { exists: boolean };

function readExists(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  const first: ExistsRow = rows[0] as ExistsRow;
  return typeof first?.exists === 'boolean' ? first.exists : false;
}

async function tableExists(
  queryRunner: QueryRunner,
  tableName: string,
): Promise<boolean> {
  const rows: unknown = await queryRunner.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = $1
    ) as "exists"`,
    [tableName],
  );

  return readExists(rows);
}

describe('BohInventoryLedgerFoundation1766000000000', () => {
  const migration = new BohInventoryLedgerFoundation1766000000000();

  const postgresConnection = {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'admin',
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  it('creates foundational ledger tables with up migration', async () => {
    const dataSource = new DataSource(postgresConnection);
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    const schemaName = `test_boh_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      await queryRunner.connect();
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await queryRunner.query(`SET search_path TO "${schemaName}"`);
      await migration.up(queryRunner);

      await expect(tableExists(queryRunner, 'inventory_kardex')).resolves.toBe(
        true,
      );
      await expect(
        tableExists(queryRunner, 'inventory_sync_outbox'),
      ).resolves.toBe(true);
      await expect(
        tableExists(queryRunner, 'inventory_sync_receipts'),
      ).resolves.toBe(true);
      await expect(tableExists(queryRunner, 'forensic_alerts')).resolves.toBe(
        true,
      );
    } finally {
      await queryRunner.query(`SET search_path TO "${schemaName}"`);
      await migration.down(queryRunner);
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await queryRunner.release();
      await dataSource.destroy();
    }
  }, 20000);
});
