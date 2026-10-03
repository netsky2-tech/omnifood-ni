import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../identity/entities/device-sync-credential.entity';
import {
  deriveSyncFreshness,
  type TerminalReceiptEvidence,
  type TerminalStreamGapEvidence,
} from './freshness-derivation';
import { resolveFreshnessThresholdMinutes } from './freshness.config';
import {
  SyncFreshnessTerminalDto,
  SyncFreshnessDto,
} from './sync-freshness.dto';

/**
 * Per-(device, flow) receipt aggregation row returned by the watermark SQL.
 */
interface ReceiptStreamRow {
  deviceId: string;
  flowType: string;
  acceptedMax: string | number | null;
  acceptedMin: string | number | null;
  acceptedCount: string | number | null;
  declaredGapCount?: string | number | null;
  lastAcceptedAt: Date | null;
}

interface AboveWatermarkRow {
  deviceId: string;
  flowType: string;
  rejectedAboveWatermark?: string | number;
  pendingAboveWatermark?: string | number;
}

interface CredentialStreamRow {
  deviceId: string;
  flowType: string;
  pendingAboveWatermark: number;
}

/**
 * Owner Dashboard V2 — sync freshness/completeness read service
 * (architecture spec v0.3 §17.3/§17.12, PRD v1.0 §20 FR-SYNC-01..05).
 *
 * Issue #592 permanent rule: inventory_sync_receipts,
 * inventory_sync_outbox, and device_sync_credentials are RLS-forced tables,
 * so every read here runs inside runInTenantTransaction with a
 * transaction-local tenant binding. There are NO pooled repository reads.
 *
 * The service only gathers evidence; state derivation is delegated to the
 * pure `deriveSyncFreshness` function.
 */
@Injectable()
export class SyncHealthService {
  constructor(
    // Bound-read tripwire (#592 pattern): no pooled repository token exists
    // for the RLS-forced tables this service reads; the DataSource is used
    // exclusively to open tenant-bound transactions.
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getFreshness(
    tenantId: string,
    evaluatedAt: Date = new Date(),
  ): Promise<SyncFreshnessDto> {
    const thresholdMinutes = resolveFreshnessThresholdMinutes();

    const terminals = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const credentials = await manager
          .getRepository(DeviceSyncCredential)
          .find({
            where: { tenantId },
            relations: ['activationAttempt'],
          });
        const receiptStreams = await manager.query<ReceiptStreamRow[]>(
          SyncHealthService.RECEIPT_STREAMS_SQL,
          [tenantId],
        );
        const rejectedAbove = await manager.query<AboveWatermarkRow[]>(
          SyncHealthService.REJECTED_ABOVE_WATERMARK_SQL,
          [tenantId],
        );
        const outboxPending = await manager.query<CredentialStreamRow[]>(
          SyncHealthService.OUTBOX_PENDING_ABOVE_WATERMARK_SQL,
          [tenantId],
        );
        return SyncHealthService.buildTerminalEvidence({
          credentials,
          receiptStreams,
          rejectedAbove,
          outboxPending,
        });
      },
    );

    const derivation = deriveSyncFreshness({
      terminals,
      thresholdMinutes,
      now: evaluatedAt.toISOString(),
    });

    const perTerminal: SyncFreshnessTerminalDto[] = derivation.perTerminal.map(
      (terminal) => ({
        terminalId: terminal.terminalId,
        label: terminal.label,
        state: terminal.state,
        acceptedThroughSequence: terminal.acceptedThroughSequence,
        lastReceiptAt: terminal.lastReceiptAt,
        hasDeclaredGaps: terminal.hasDeclaredGaps,
      }),
    );

    return {
      state: derivation.state,
      thresholdMinutes: derivation.thresholdMinutes,
      lastCompleteAt: derivation.lastCompleteAt,
      perTerminal,
      evaluatedAt: derivation.evaluatedAt,
      hasDeclaredGaps: derivation.hasDeclaredGaps,
    };
  }

  /**
   * Per-(device, flow) confirmed watermark aggregation over accepted sync
   * receipts. `lastAcceptedAt` uses the acceptance timestamp when present,
   * falling back to receipt arrival — this is the freshness watermark age,
   * never a business-activity timestamp (AC-09A).
   */
  private static readonly RECEIPT_STREAMS_SQL = `
    SELECT
      r.source_device_id AS "deviceId",
      r.flow_type AS "flowType",
      MAX(r.source_sequence::bigint) FILTER (WHERE r.result_status = 'ACCEPTED') AS "acceptedMax",
      MIN(r.source_sequence::bigint) FILTER (WHERE r.result_status = 'ACCEPTED') AS "acceptedMin",
      COUNT(*) FILTER (WHERE r.result_status = 'ACCEPTED')::bigint AS "acceptedCount",
      COUNT(*) FILTER (WHERE r.result_code = 'GAP_FILL_DECLARED' OR r.result_code LIKE 'GAP_FILL%')::int AS "declaredGapCount",
      MAX(COALESCE(r.accepted_at, r.created_at))
        FILTER (WHERE r.result_status = 'ACCEPTED') AS "lastAcceptedAt"
    FROM inventory_sync_receipts r
    WHERE r.tenant_id = $1
    GROUP BY r.source_device_id, r.flow_type
  `;

  /**
   * Non-accepted receipt rows strictly above the per-stream accepted
   * watermark: persisted proof of records that arrived out of order or were
   * rejected ahead of the cursor.
   */
  private static readonly REJECTED_ABOVE_WATERMARK_SQL = `
    SELECT
      r.source_device_id AS "deviceId",
      r.flow_type AS "flowType",
      COUNT(*)::int AS "rejectedAboveWatermark"
    FROM inventory_sync_receipts r
    LEFT JOIN (
      SELECT source_device_id, flow_type,
        MAX(source_sequence::bigint) FILTER (WHERE result_status = 'ACCEPTED') AS accepted_max
      FROM inventory_sync_receipts
      WHERE tenant_id = $1
      GROUP BY source_device_id, flow_type
    ) wm ON wm.source_device_id = r.source_device_id
       AND wm.flow_type = r.flow_type
    WHERE r.tenant_id = $1
      AND r.result_status <> 'ACCEPTED'
      AND r.source_sequence::bigint > COALESCE(wm.accepted_max, 0)
    GROUP BY r.source_device_id, r.flow_type
  `;

  /**
   * STAGED_FUTURE outbox rows strictly above the per-stream accepted
   * watermark: records durably received but blocked on a sequence gap —
   * completeness is NOT proven through them (§17.4).
   */
  private static readonly OUTBOX_PENDING_ABOVE_WATERMARK_SQL = `
    SELECT
      o.source_device_id AS "deviceId",
      o.flow_type AS "flowType",
      COUNT(*)::int AS "pendingAboveWatermark"
    FROM inventory_sync_outbox o
    LEFT JOIN (
      SELECT source_device_id, flow_type,
        MAX(source_sequence::bigint) FILTER (WHERE result_status = 'ACCEPTED') AS accepted_max
      FROM inventory_sync_receipts
      WHERE tenant_id = $1
      GROUP BY source_device_id, flow_type
    ) wm ON wm.source_device_id = o.source_device_id
       AND wm.flow_type = o.flow_type
    WHERE o.tenant_id = $1
      AND o.status = 'STAGED_FUTURE'
      AND o.source_sequence::bigint > COALESCE(wm.accepted_max, 0)
    GROUP BY o.source_device_id, o.flow_type
  `;

  private static toNumber(
    value: string | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private static buildTerminalEvidence({
    credentials,
    receiptStreams,
    rejectedAbove,
    outboxPending,
  }: {
    credentials: DeviceSyncCredential[];
    receiptStreams: ReceiptStreamRow[];
    rejectedAbove: AboveWatermarkRow[];
    outboxPending: AboveWatermarkRow[];
  }): TerminalReceiptEvidence[] {
    // Device set per §17.2: the authoritative credential lifecycle gates
    // participation. Explicitly revoked/retired devices are excluded (their
    // historical receipts must not block freshness forever); absence of
    // recent activity never excludes a device on its own.
    //
    // Orphan exclusion: a device with receipts but NO credential entry at
    // all is a stale ID left behind by a re-link (pm clear + new linking
    // code). Its single historical activation receipt must not drag the
    // tenant watermark backwards. Only devices with a known credential
    // lifecycle participate.
    const excludedStatuses: string[] = [
      DeviceSyncCredentialStatus.REVOKED,
      DeviceSyncCredentialStatus.RETIRED,
    ];
    const allCredentialDeviceIds = new Set(
      SyncHealthService.latestCredentialByDevice(credentials).map(
        (credential) => credential.deviceId,
      ),
    );
    const excludedDeviceIds = new Set(
      SyncHealthService.latestCredentialByDevice(credentials)
        .filter((credential) => excludedStatuses.includes(credential.status))
        .map((credential) => credential.deviceId),
    );

    const activeCredentialByDevice = new Map(
      SyncHealthService.latestCredentialByDevice(credentials)
        .filter((credential) => credential.status === 'ACTIVE')
        .map((credential) => [credential.deviceId, credential]),
    );

    // Founder freshness participation policy: every non-excluded credential
    // lifecycle (ACTIVE or newly provisioned PENDING) joins the evidence
    // set. A provisioned device that has never synced resolves downstream to
    // the display-only 'PENDING' terminal state (no accepted receipt -> no
    // freshness participation), while explicitly revoked/retired devices
    // stay excluded.
    const participatingCredentialByDevice = new Map(
      SyncHealthService.latestCredentialByDevice(credentials)
        .filter((credential) => !excludedStatuses.includes(credential.status))
        .map((credential) => [credential.deviceId, credential]),
    );

    // The device/terminal set is the union of observed sync streams,
    // participating provisioned credentials, and gap-evidence rows.
    // Orphaned receipt-only devices (no credential ever provisioned) are
    // excluded ONLY when the credential lifecycle is in use (at least one
    // credential exists). This preserves backwards compatibility for
    // deployments without credential provisioning while excluding stale
    // IDs from re-links on credential-managed tenants.
    const deviceIds = new Set<string>();
    const hasCredentialLifecycle = allCredentialDeviceIds.size > 0;
    for (const stream of receiptStreams) {
      if (excludedDeviceIds.has(stream.deviceId)) continue;
      if (
        hasCredentialLifecycle &&
        !allCredentialDeviceIds.has(stream.deviceId)
      ) {
        continue;
      }
      deviceIds.add(stream.deviceId);
    }
    for (const row of [...rejectedAbove, ...outboxPending]) {
      if (excludedDeviceIds.has(row.deviceId)) continue;
      if (hasCredentialLifecycle && !allCredentialDeviceIds.has(row.deviceId)) {
        continue;
      }
      deviceIds.add(row.deviceId);
    }
    for (const deviceId of participatingCredentialByDevice.keys()) {
      deviceIds.add(deviceId);
    }

    const streamsByDevice = new Map<string, ReceiptStreamRow[]>();
    for (const stream of receiptStreams) {
      if (excludedDeviceIds.has(stream.deviceId)) continue;
      if (
        hasCredentialLifecycle &&
        !allCredentialDeviceIds.has(stream.deviceId)
      ) {
        continue;
      }
      const streams = streamsByDevice.get(stream.deviceId) ?? [];
      streams.push(stream);
      streamsByDevice.set(stream.deviceId, streams);
    }

    const rejectedByStream = new Map(
      rejectedAbove
        .filter((row) => !excludedDeviceIds.has(row.deviceId))
        .map((row) => [
          SyncHealthService.streamKey(row.deviceId, row.flowType),
          SyncHealthService.toNumber(row.rejectedAboveWatermark) ?? 0,
        ]),
    );
    const pendingByStream = new Map(
      outboxPending
        .filter((row) => !excludedDeviceIds.has(row.deviceId))
        .map((row) => [
          SyncHealthService.streamKey(row.deviceId, row.flowType),
          SyncHealthService.toNumber(row.pendingAboveWatermark) ?? 0,
        ]),
    );

    return [...deviceIds]
      .filter((deviceId) => !excludedDeviceIds.has(deviceId))
      .sort()
      .map((deviceId): TerminalReceiptEvidence | null => {
        const streams = streamsByDevice.get(deviceId) ?? [];
        const gapStreams: TerminalStreamGapEvidence[] = streams.map(
          (stream) => ({
            flowType: stream.flowType,
            acceptedMax: SyncHealthService.toNumber(stream.acceptedMax),
            acceptedCount: SyncHealthService.toNumber(stream.acceptedCount),
            minAcceptedSequence: SyncHealthService.toNumber(stream.acceptedMin),
            declaredGapCount:
              SyncHealthService.toNumber(stream.declaredGapCount) ?? 0,
            rejectedAboveWatermark:
              rejectedByStream.get(
                SyncHealthService.streamKey(deviceId, stream.flowType),
              ) ?? 0,
            pendingAboveWatermark:
              pendingByStream.get(
                SyncHealthService.streamKey(deviceId, stream.flowType),
              ) ?? 0,
          }),
        );

        // Streams that only appear in the outbox/rejected evidence (no
        // accepted receipt ever) still participate as gap-evidence streams.
        for (const [key, pending] of pendingByStream) {
          if (pending === 0) continue;
          if (!key.startsWith(`${deviceId}::`)) continue;
          const flowType = key.split('::')[1];
          if (gapStreams.some((s) => s.flowType === flowType)) continue;
          gapStreams.push({
            flowType,
            acceptedMax: null,
            acceptedCount: null,
            minAcceptedSequence: null,
            declaredGapCount: 0,
            rejectedAboveWatermark: 0,
            pendingAboveWatermark: pending,
          });
        }

        const acceptedWatermarks = gapStreams
          .map((stream) => stream.acceptedMax)
          .filter((value): value is number => value !== null);
        const lastReceiptDates = streams
          .map((stream) => stream.lastAcceptedAt)
          .filter((value): value is Date => value !== null);

        return {
          terminalId: deviceId,
          // AG-03: the device registry carries no display label; the best
          // available human identity is the credential's canonical terminal id.
          label: activeCredentialByDevice.get(deviceId)?.label ?? null,
          acceptedThroughSequence:
            acceptedWatermarks.length > 0
              ? Math.min(...acceptedWatermarks)
              : null,
          lastReceiptAt:
            lastReceiptDates.length > 0
              ? new Date(
                  Math.min(...lastReceiptDates.map((date) => date.getTime())),
                ).toISOString()
              : null,
          gapEvidence: gapStreams.length > 0 ? { streams: gapStreams } : null,
        };
      });
  }

  private static latestCredentialByDevice(
    credentials: DeviceSyncCredential[],
  ): Array<{ deviceId: string; label: string | null; status: string }> {
    const byDevice = new Map<
      string,
      {
        deviceId: string;
        label: string | null;
        status: string;
        version: number;
      }
    >();
    for (const credential of credentials) {
      const deviceId =
        credential.activationAttempt?.trustedTerminalId?.trim() ||
        credential.activationAttempt?.candidateTerminalId?.trim();
      if (!deviceId) continue;
      const existing = byDevice.get(deviceId);
      if (existing && existing.version >= credential.version) continue;
      byDevice.set(deviceId, {
        deviceId,
        label: deviceId,
        status: credential.status,
        version: credential.version,
      });
    }
    return [...byDevice.values()];
  }

  private static streamKey(deviceId: string, flowType: string): string {
    return `${deviceId}::${flowType}`;
  }
}
