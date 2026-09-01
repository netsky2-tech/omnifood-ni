import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateTenantTopologyRevisions1794000000000 } from '../../../migrations/1794000000000-CreateTenantTopologyRevisions';
import { TopologyRevisionConflictError } from '../domain/topology-revision-conflict.error';
import { TenantTopologyRevisionService } from './tenant-topology-revision.service';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for DB-backed migration tests`);
  return value;
}

function readPostgresPort(): number {
  const port = Number(process.env.DB_PORT?.trim() ?? '5432');
  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed migration tests',
    );
  }
  return port;
}

const connection = {
  type: 'postgres' as const,
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const topology = (deviceId: string) => ({
  operationMode: 'FOOD_PARK',
  channels: ['KDS_AND_PRINT'],
  devices: [
    {
      deviceId,
      roles: ['CASHIER', 'KITCHEN'],
      capabilities: ['KDS', 'PRINT'],
    },
  ],
});

describe('TenantTopologyRevisionService (db)', () => {
  it('keeps an unprovisioned tenant compatible, appends revisions, rejects stale bases, and preserves prior snapshots', async () => {
    const adminSource = new DataSource(connection);
    await adminSource.initialize();
    const runner = adminSource.createQueryRunner();
    const schema = `topology_${randomUUID().replace(/-/g, '')}`;
    const migration = new CreateTenantTopologyRevisions1794000000000();
    let source: DataSource | undefined;
    try {
      await runner.connect();
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET search_path TO "${schema}"`);
      await migration.up(runner);
      source = new DataSource({
        ...connection,
        extra: { options: `-c search_path=${schema}` },
      });
      await source.initialize();
      const service = new TenantTopologyRevisionService(source);
      const createQueryRunner = jest.spyOn(source, 'createQueryRunner');
      await expect(service.current(' \t ')).rejects.toThrow(
        'tenantId must not be blank',
      );
      expect(createQueryRunner).not.toHaveBeenCalled();
      await expect(service.current('tenant-a')).resolves.toEqual({
        provisioned: false,
        revision: 0,
      });
      await expect(
        service.create({
          tenantId: 'tenant-a',
          baseRevision: 0,
          contractVersion: 1,
          topology: topology('device-a'),
          hash: 'hash-a',
        }),
      ).resolves.toMatchObject({
        tenantId: 'tenant-a',
        revision: 1,
        contractVersion: 1,
        topology: topology('device-a'),
        hash: 'hash-a',
      });
      await expect(
        service.create({
          tenantId: 'tenant-a',
          baseRevision: 1,
          contractVersion: 1,
          topology: topology('device-b'),
          hash: 'hash-b',
        }),
      ).resolves.toMatchObject({ revision: 2, topology: topology('device-b') });
      await expect(
        service.create({
          tenantId: 'tenant-a',
          baseRevision: 1,
          contractVersion: 1,
          topology: topology('device-c'),
          hash: 'hash-c',
        }),
      ).rejects.toBeInstanceOf(TopologyRevisionConflictError);
      const concurrent = await Promise.allSettled([
        service.create({
          tenantId: 'tenant-concurrent',
          baseRevision: 0,
          contractVersion: 1,
          topology: topology('device-d'),
          hash: 'hash-d',
        }),
        service.create({
          tenantId: 'tenant-concurrent',
          baseRevision: 0,
          contractVersion: 1,
          topology: topology('device-e'),
          hash: 'hash-e',
        }),
      ]);
      expect(
        concurrent.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const conflict = concurrent.find(
        (result) => result.status === 'rejected',
      );
      expect(conflict?.status).toBe('rejected');
      if (conflict?.status === 'rejected') {
        expect(conflict.reason).toBeInstanceOf(TopologyRevisionConflictError);
      }
      await expect(
        runner.query(
          'SELECT revision, topology, hash FROM tenant_topology_revisions WHERE tenant_id = $1 ORDER BY revision',
          ['tenant-a'],
        ),
      ).resolves.toEqual([
        { revision: 1, topology: topology('device-a'), hash: 'hash-a' },
        { revision: 2, topology: topology('device-b'), hash: 'hash-b' },
      ]);
      await expect(
        runner.query("UPDATE tenant_topology_revisions SET hash = 'tampered'"),
      ).rejects.toThrow(/immutable/);
    } finally {
      try {
        if (source) await source.destroy();
        await migration.down(runner);
        await runner.query('SET search_path TO public');
        await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await runner.release();
        await adminSource.destroy();
      }
    }
  }, 30000);
});
