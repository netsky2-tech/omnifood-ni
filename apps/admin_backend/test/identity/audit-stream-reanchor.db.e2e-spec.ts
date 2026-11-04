import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { ForensicAlert } from '../../src/modules/inventory/entities/forensic-alert.entity';
import { User } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuditController } from '../../src/modules/identity/controllers/audit.controller';
import { AuditLogsService } from '../../src/modules/audit/audit-logs.service';
import { AuditVerificationService } from '../../src/modules/identity/services/audit-verification.service';
import { AuditMetricsService } from '../../src/modules/identity/services/audit-metrics.service';
import type { PushAuditLogsDto } from '../../src/modules/identity/dto/identity.dto';
import { ConflictException } from '@nestjs/common';

/**
 * Issue #936 — REAL-DATABASE E2E test for forensic stream continuity,
 * stream-head resolution, 409 conflict alert persistence, and re-anchoring.
 *
 * Runs against a migrated scratch PostgreSQL schema with NOSUPERUSER NOBYPASSRLS runtime role.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

function computeLogHash(log: {
  user_id: string;
  action: string;
  device_id: string;
  timestamp: string;
  sequence_no: number;
  prev_hash: string;
  metodo_autorizacion?: string;
  usuario_autorizador_id?: string;
  metadata?: unknown;
}): string {
  const metadataStr = JSON.stringify(log.metadata ?? {});
  const payload = `${log.user_id}|${log.action}|${log.device_id}|${log.timestamp}|${log.sequence_no}|${log.prev_hash}|${log.metodo_autorizacion || 'null'}|${log.usuario_autorizador_id || 'null'}|${metadataStr}`;
  return createHash('sha256').update(payload).digest('hex');
}

describe('Audit forensic stream re-anchoring & continuity (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let controller: AuditController;
  let logsService: AuditLogsService;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userAId = randomUUID();
  const userBId = randomUUID();

  const deviceSharedId = 'pos-term-shared-01';

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        tenantAId,
        'reanchor-tenant-a',
        normalizeTenantSlug('reanchor-tenant-a'),
        tenantBId,
        'reanchor-tenant-b',
        normalizeTenantSlug('reanchor-tenant-b'),
      ],
    );

    await admin.query(
      `INSERT INTO users (id, tenant_id, name, email, role)
       VALUES ($1, $2, 'Cashier A', 'cashier@reanchor-a.test', 'CASHIER'),
              ($3, $4, 'Cashier B', 'cashier@reanchor-b.test', 'CASHIER')`,
      [userAId, tenantAId, userBId, tenantBId],
    );

    // Seed Tenant A: 19 records on deviceSharedId with userAId. Head sequence is 19.
    await admin.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, target_type, target_id,
          device_id, sequence_no, prev_hash, entry_hash, hash_version,
          "timestamp", metadata, forensic_status)
       VALUES
         ($1, $2, $3, 'SALE_CREATED', 'invoice', 'inv-a-01',
          $4, 19, 'hash-a-18', 'entry-hash-a-19', 'v2-canonical-json',
          NOW(), '{"total":100}', 'ACTIVE')`,
      [randomUUID(), tenantAId, userAId, deviceSharedId],
    );

    // Seed Tenant B: 42 records on identical deviceSharedId with userBId. Head sequence is 42.
    await admin.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, target_type, target_id,
          device_id, sequence_no, prev_hash, entry_hash, hash_version,
          "timestamp", metadata, forensic_status)
       VALUES
         ($1, $2, $3, 'SALE_CREATED', 'invoice', 'inv-b-01',
          $4, 42, 'hash-b-41', 'entry-hash-b-42', 'v2-canonical-json',
          NOW(), '{"total":250}', 'ACTIVE')`,
      [randomUUID(), tenantBId, userBId, deviceSharedId],
    );

    // Runtime datasource with ordinary NOSUPERUSER role
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: [
        AuditLog,
        AuditIntegrityAlert,
        ForensicAlert,
        User,
        SecurityProfile,
        Tenant,
      ],
      synchronize: false,
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    const verificationService = new AuditVerificationService(
      new AuditMetricsService(),
    );
    controller = new AuditController(
      runtime.manager.getRepository(AuditLog),
      runtime,
      {} as never,
      verificationService,
    );

    logsService = new AuditLogsService(
      runtime.manager.getRepository(AuditLog),
      runtime.manager.getRepository(AuditIntegrityAlert),
      runtime,
      runtime.manager.getRepository(ForensicAlert),
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  describe('GET /identity/audit/stream-head multi-tenant continuity', () => {
    it('returns tenant A stream head (sequence 19) for deviceSharedId without leaking tenant B', async () => {
      const headA = await controller.getStreamHead(
        tenantAId,
        deviceSharedId,
        userAId,
        { devicePrincipal: { deviceId: deviceSharedId } },
      );

      expect(headA.sequence_no).toBe(19);
      expect(headA.entry_hash).toBe('entry-hash-a-19');
    });

    it('returns tenant B stream head (sequence 42) for identical deviceSharedId (triangulation)', async () => {
      const headB = await controller.getStreamHead(
        tenantBId,
        deviceSharedId,
        userBId,
        { devicePrincipal: { deviceId: deviceSharedId } },
      );

      expect(headB.sequence_no).toBe(42);
      expect(headB.entry_hash).toBe('entry-hash-b-42');
    });

    it('returns 0 and GENESIS when stream does not exist in tenant', async () => {
      const freshUser = randomUUID();
      const head = await controller.getStreamHead(
        tenantAId,
        deviceSharedId,
        freshUser,
        { devicePrincipal: { deviceId: deviceSharedId } },
      );

      expect(head.sequence_no).toBe(0);
      expect(head.entry_hash).toBe('GENESIS');
    });
  });

  describe('Conflict detection, ForensicAlert persistence and Re-anchoring', () => {
    it('persists AUDIT_BACKEND_TERMINAL_REJECTION in forensic_alerts and rolls back transaction on 409', async () => {
      const timestamp = new Date().toISOString();
      const rawLog = {
        id: randomUUID(),
        user_id: userAId,
        action: 'SALE_CREATED',
        timestamp,
        device_id: deviceSharedId,
        sequence_no: 1, // Proposing sequence 1 when cloud is at 19!
        prev_hash: 'GENESIS',
        metadata: { total: 100 },
      };
      const entryHash = computeLogHash(rawLog);

      const conflictingDto: PushAuditLogsDto = {
        logs: [
          {
            ...rawLog,
            entry_hash: entryHash,
          },
        ],
      } as unknown as PushAuditLogsDto;

      let caughtError: ConflictException | null = null;
      try {
        await controller.pushLogs(tenantAId, conflictingDto, {
          devicePrincipal: { deviceId: deviceSharedId },
        });
      } catch (err) {
        if (err instanceof ConflictException) {
          caughtError = err;
        }
      }

      expect(caughtError).not.toBeNull();
      const responseBody = caughtError.getResponse() as Record<string, unknown>;
      expect(responseBody.message).toBe('Conflicting forensic replay detected');
      expect(responseBody.streamHead).toEqual({
        sequence_no: 19,
        entry_hash: 'entry-hash-a-19',
      });
      expect(responseBody.alertId).toBeDefined();

      // Verify the alert was actually persisted in PostgreSQL forensic_alerts!
      const alerts = await admin.query(
        `SELECT id, alert_type, severity, resolved_at FROM forensic_alerts WHERE tenant_id = $1`,
        [tenantAId],
      );
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const alert = alerts.find(
        (a: { alert_type: string }) =>
          a.alert_type === 'AUDIT_BACKEND_TERMINAL_REJECTION',
      );
      expect(alert).toBeDefined();
      expect(alert.severity).toBe('critical');
      expect(alert.resolved_at).toBeNull();

      // Verify Tenant B cannot see Tenant A's alert in PostgreSQL (RLS verification)!
      const alertsB = await logsService.getForensicAlerts(tenantBId, 'active');
      expect(alertsB.alerts.find((a) => a.id === alert.id)).toBeUndefined();
    });

    it('accepts AUDIT_STREAM_REANCHOR at sequence 20 followed by contiguous sequence 21, updating stream head', async () => {
      const reanchorId = randomUUID();
      const saleId = randomUUID();
      const timestamp = new Date().toISOString();

      const rawReanchor = {
        id: reanchorId,
        user_id: userAId,
        action: 'AUDIT_STREAM_REANCHOR',
        timestamp,
        device_id: deviceSharedId,
        sequence_no: 20, // N + 1
        prev_hash: 'entry-hash-a-19', // Cloud head
        metadata: { reason: 'conflicting_replay_resolved', cloud_head: 19 },
      };
      const reanchorHash = computeLogHash(rawReanchor);

      const rawSale = {
        id: saleId,
        user_id: userAId,
        action: 'SALE_CREATED',
        timestamp,
        device_id: deviceSharedId,
        sequence_no: 21, // N + 2
        prev_hash: reanchorHash,
        metadata: { invoice_id: 'inv-new-21' },
      };
      const saleHash = computeLogHash(rawSale);

      const reanchorDto: PushAuditLogsDto = {
        logs: [
          {
            ...rawReanchor,
            entry_hash: reanchorHash,
          },
          {
            ...rawSale,
            entry_hash: saleHash,
          },
        ],
      } as unknown as PushAuditLogsDto;

      const result = await controller.pushLogs(tenantAId, reanchorDto, {
        devicePrincipal: { deviceId: deviceSharedId },
      });

      expect(result.status).toBe('success');
      expect(result.count).toBe(2);

      // Verify new stream head in real database is now sequence 21!
      const updatedHead = await controller.getStreamHead(
        tenantAId,
        deviceSharedId,
        userAId,
        { devicePrincipal: { deviceId: deviceSharedId } },
      );

      expect(updatedHead.sequence_no).toBe(21);
      expect(updatedHead.entry_hash).toBe(saleHash);
    });

    it('resolves the forensic alert from backoffice and verifies it in real PostgreSQL', async () => {
      const activeAlerts = await logsService.getForensicAlerts(
        tenantAId,
        'active',
      );
      expect(activeAlerts.alerts.length).toBeGreaterThanOrEqual(1);
      const alertToResolve = activeAlerts.alerts[0];

      const resolveResult = await logsService.resolveForensicAlert(
        tenantAId,
        alertToResolve.id,
      );

      expect(resolveResult.status).toBe('success');
      expect(resolveResult.id).toBe(alertToResolve.id);
      expect(resolveResult.resolved_at).toBeDefined();

      // Verify in PostgreSQL that resolved_at is set
      const checkAlert = await admin.query(
        `SELECT resolved_at FROM forensic_alerts WHERE id = $1`,
        [alertToResolve.id],
      );
      expect(checkAlert[0].resolved_at).not.toBeNull();

      // Verify it no longer appears in active alerts
      const afterActive = await logsService.getForensicAlerts(
        tenantAId,
        'active',
      );
      expect(
        afterActive.alerts.find((a) => a.id === alertToResolve.id),
      ).toBeUndefined();
    });
  });
});
