import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { User } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuditIntegrityService } from '../../src/modules/identity/services/audit-integrity.service';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('AuditIntegrityService.runNightly per-tenant scan under FORCE RLS (#512 S2)', () => {
  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: AuditIntegrityService;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      extra: {
        max: 2,
        allowExitOnIdle: true,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1,$2,$3),($4,$5,$6)`,
      [
        tenantAId,
        'nightly-a',
        normalizeTenantSlug('nightly-a'),
        tenantBId,
        'nightly-b',
        normalizeTenantSlug('nightly-b'),
      ],
    );
    await admin.query(
      `INSERT INTO users (id, tenant_id, name, email, role)
       VALUES ($1,$2,'Cashier A','cashier@nightly-a.test','CASHIER'),
              ($3,$4,'Cashier B','cashier@nightly-b.test','CASHIER')`,
      [userAId, tenantAId, userBId, tenantBId],
    );
    // One gap per tenant: sequences 1 and 3 leave sequence 2 missing.
    for (const [tenantId, userId, deviceId] of [
      [tenantAId, userAId, 'term-a'],
      [tenantBId, userBId, 'term-b'],
    ] as const) {
      for (const seq of [1, 3]) {
        await admin.query(
          `INSERT INTO audit_logs
             (id, tenant_id, user_id, action, target_type, target_id, device_id,
              sequence_no, prev_hash, entry_hash, hash_version, "timestamp",
              metadata, forensic_status)
           VALUES ($1,$2,$3,'SALE_CREATED','invoice',$4,$5,$6,'GENESIS',$7,
                   'v2-canonical-json',NOW(),'{}','ACTIVE')`,
          [
            randomUUID(),
            tenantId,
            userId,
            `inv-${seq}`,
            deviceId,
            seq,
            `entry-${deviceId}-${seq}`,
          ],
        );
      }
    }

    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: [AuditLog, AuditIntegrityAlert, User, SecurityProfile, Tenant],
      synchronize: false,
      extra: { max: 2, allowExitOnIdle: true },
    });
    await runtime.initialize();
    service = new AuditIntegrityService(
      runtime.getRepository(AuditLog),
      runtime.getRepository(AuditIntegrityAlert),
      { emit: jest.fn() } as never,
      runtime,
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('sees nothing unbound (FORCE RLS) on audit_logs and audit_integrity_alerts', async () => {
    const logs = await runtime.query(
      'SELECT count(*)::int AS c FROM audit_logs',
    );
    const alerts = await runtime.query(
      'SELECT count(*)::int AS c FROM audit_integrity_alerts',
    );
    expect(logs[0].c).toBe(0);
    expect(alerts[0].c).toBe(0);
  });

  it('scans and upserts each tenant inside its own bound transaction', async () => {
    const first = await service.runNightly();
    expect(first.totalGaps).toBe(2);
    expect(first.newAlerts).toBe(2);
    expect(first.alerts.map((a) => a.tenantId).sort()).toEqual(
      [tenantAId, tenantBId].sort(),
    );

    // Second run exercises the tenant-scoped UPDATE policy (observed, not new).
    const second = await service.runNightly();
    expect(second.totalGaps).toBe(2);
    expect(second.newAlerts).toBe(0);
    expect(second.unchangedAlerts).toBe(2);

    for (const tenantId of [tenantAId, tenantBId]) {
      const qr = runtime.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      await qr.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      const own = await qr.query(
        'SELECT tenant_id FROM audit_integrity_alerts',
      );
      const crossUpdate = await qr.query(
        'UPDATE audit_integrity_alerts SET gap_end = gap_end WHERE tenant_id <> $1',
        [tenantId],
      );
      await qr.rollbackTransaction();
      await qr.release();
      expect(own).toEqual([{ tenant_id: tenantId }]);
      expect(crossUpdate[1]).toBe(0);
    }
  });
});
