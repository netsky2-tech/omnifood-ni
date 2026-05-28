import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditIntegrityAlert } from '../entities/audit-integrity-alert.entity';

type GapRow = {
  tenant_id: string;
  device_id: string;
  user_id: string;
  gap_start: number;
  gap_end: number;
  forensic_status?: 'ACTIVE' | 'QUARANTINED' | 'REVOKED';
};

type GapEvidence = {
  tenantId: string;
  deviceId: string;
  userId: string;
  gapStart: number;
  gapEnd: number;
  signature: string;
};

@Injectable()
export class AuditIntegrityService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(AuditIntegrityAlert)
    private readonly alertRepository: Repository<AuditIntegrityAlert>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('0 2 * * *', {
    name: 'identity-audit-integrity-nightly',
    timeZone: 'America/Managua',
    waitForCompletion: true,
  })
  async handleNightlyAuditIntegrity(): Promise<void> {
    await this.runNightly();
  }

  async runNightly(): Promise<{
    totalGaps: number;
    newAlerts: number;
    unchangedAlerts: number;
    alerts: GapEvidence[];
  }> {
    const rowsRaw: unknown = await this.auditLogRepository.query(
      `WITH ordered AS (
        SELECT tenant_id, device_id, user_id, sequence_no,
               LAG(sequence_no) OVER (
                 PARTITION BY tenant_id, device_id, user_id
                 ORDER BY sequence_no
               ) AS prev_sequence_no
        FROM audit_logs
        WHERE forensic_status = 'ACTIVE'
      )
      SELECT tenant_id, device_id, user_id,
             prev_sequence_no + 1 AS gap_start,
             sequence_no - 1 AS gap_end
      FROM ordered
      WHERE prev_sequence_no IS NOT NULL
        AND sequence_no > prev_sequence_no + 1`,
    );

    const rows = Array.isArray(rowsRaw)
      ? (rowsRaw as GapRow[]).filter(
          (row) => !row.forensic_status || row.forensic_status === 'ACTIVE',
        )
      : [];

    let newAlerts = 0;
    let unchangedAlerts = 0;
    const alerts: GapEvidence[] = [];

    for (const row of rows) {
      const evidence = this.mapRowToEvidence(row);
      alerts.push(evidence);

      const existing = await this.alertRepository.findOneBy({
        tenant_id: evidence.tenantId,
        device_id: evidence.deviceId,
        user_id: evidence.userId,
        signature: evidence.signature,
      });

      const now = new Date();

      if (existing) {
        unchangedAlerts += 1;
        await this.alertRepository.update(
          { id: existing.id },
          {
            last_seen_at: now,
          },
        );
        continue;
      }

      newAlerts += 1;
      await this.alertRepository.insert({
        tenant_id: evidence.tenantId,
        device_id: evidence.deviceId,
        user_id: evidence.userId,
        gap_start: evidence.gapStart,
        gap_end: evidence.gapEnd,
        signature: evidence.signature,
        first_detected_at: now,
        last_seen_at: now,
      });

      this.eventEmitter.emit('identity.audit_integrity.gap_detected', {
        tenantId: evidence.tenantId,
        deviceId: evidence.deviceId,
        userId: evidence.userId,
        gapStart: evidence.gapStart,
        gapEnd: evidence.gapEnd,
        signature: evidence.signature,
      });
    }

    return {
      totalGaps: rows.length,
      newAlerts,
      unchangedAlerts,
      alerts,
    };
  }

  private mapRowToEvidence(row: GapRow): GapEvidence {
    const signaturePayload = `${row.tenant_id}|${row.device_id}|${row.user_id}|${row.gap_start}|${row.gap_end}`;
    const signature = crypto
      .createHash('sha256')
      .update(signaturePayload)
      .digest('hex');

    return {
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      userId: row.user_id,
      gapStart: Number(row.gap_start),
      gapEnd: Number(row.gap_end),
      signature,
    };
  }
}
