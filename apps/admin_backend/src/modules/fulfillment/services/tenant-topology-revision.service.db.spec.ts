import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateTenantTopologyRevisions1794000000000 } from '../../../migrations/1794000000000-CreateTenantTopologyRevisions';
import { AddTenantTopologyRevisionsRls1794000000001 } from '../../../migrations/1794000000001-AddTenantTopologyRevisionsRls';
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
  it('keeps an unprovisioned tenant compatible, appends revisions, rejects stale bases, enforces RLS isolation and immutability', async () => {
    const adminSource = new DataSource(connection);
    await adminSource.initialize();
    const runner = adminSource.createQueryRunner();
    const schema = `topology_${randomUUID().replace(/-/g, '')}`;
    const tenantRole = `tenant_role_${randomUUID().replace(/-/g, '')}`;
    const migration = new CreateTenantTopologyRevisions1794000000000();
    const migrationRls = new AddTenantTopologyRevisionsRls1794000000001();
    let source: DataSource | undefined;
    try {
      await runner.connect();
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
      await runner.query(`SET search_path TO "${schema}"`);
      await migration.up(runner);
      await migrationRls.up(runner);
      await runner.query(
        `GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}"`,
      );
      await runner.query(
        `GRANT SELECT, INSERT ON tenant_topology_revisions TO "${tenantRole}"`,
      );

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

      // Provision tenant-b
      await expect(
        service.create({
          tenantId: 'tenant-b',
          baseRevision: 0,
          contractVersion: 1,
          topology: topology('device-tenant-b'),
          hash: 'hash-tenant-b',
        }),
      ).resolves.toMatchObject({
        tenantId: 'tenant-b',
        revision: 1,
      });

      // Tenant isolation: service.current() only sees own tenant
      const currentA = await service.current('tenant-a');
      expect(currentA).toMatchObject({
        provisioned: true,
        tenantId: 'tenant-a',
        revision: 2,
      });
      const currentB = await service.current('tenant-b');
      expect(currentB).toMatchObject({
        provisioned: true,
        tenantId: 'tenant-b',
        revision: 1,
      });

      // Verify PostgreSQL RLS enforcement under non-superuser tenant role
      await runner.startTransaction();
      try {
        await runner.query(`SET LOCAL ROLE "${tenantRole}"`);
        await runner.query("SELECT set_config('app.tenant_id', $1, true)", [
          'tenant-a',
        ]);
        const rowsUnderTenantA = (await runner.query(
          'SELECT tenant_id, revision FROM tenant_topology_revisions ORDER BY revision',
        )) as Array<{ tenant_id: string; revision: number }>;
        expect(rowsUnderTenantA.every((r) => r.tenant_id === 'tenant-a')).toBe(
          true,
        );
        expect(rowsUnderTenantA).toHaveLength(2);

        // Verify RLS rejects cross-tenant insertion
        await expect(
          runner.query(
            "INSERT INTO tenant_topology_revisions (tenant_id, contract_version, revision, topology, hash) VALUES ('tenant-b', 1, 99, '{}', 'cross-tenant-hash')",
          ),
        ).rejects.toThrow(/violates row-level security policy/);
      } finally {
        await runner.rollbackTransaction();
      }

      // Verify immutability trigger
      await expect(
        runner.query("UPDATE tenant_topology_revisions SET hash = 'tampered'"),
      ).rejects.toThrow(/immutable/);
    } finally {
      try {
        if (source) await source.destroy();
        await migrationRls.down(runner);
        await migration.down(runner);
        await runner.query('RESET ROLE');
        await runner.query('SET search_path TO public');
        await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await runner.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
      } finally {
        await runner.release();
        await adminSource.destroy();
      }
    }
  }, 30000);
});
