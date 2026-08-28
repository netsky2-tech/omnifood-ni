import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalizeNumberFreeJson } from '../../../core/audit/v3/canonicalizer';
import {
  buildAuditV3Frame,
  type FieldState,
} from '../../../core/audit/v3/frame';
import { sha256LowerHex } from '../../../core/audit/v3/sha256';
import { CreateAuditLogDto, type NumberFreeJson } from '../dto/identity.dto';
import { AuditHashVersionInvalidException } from '../exceptions/audit-hash-version-invalid.exception';
import {
  AUDIT_REASON_LABELS,
  AUDIT_VERSION_LABELS,
  AuditMetricsService,
  type AuditReasonLabel,
  type AuditVersionLabel,
} from './audit-metrics.service';

@Injectable()
export class AuditVerificationService {
  constructor(private readonly metrics: AuditMetricsService) {}

  verifyBatch(logs: CreateAuditLogDto[], requesterUserId: string): void {
    for (const log of logs) {
      const actor = log.user_id ?? requesterUserId;
      const action = log.action ?? log.tipo_accion;
      if (!actor || !action) continue;

      const version = this.versionOf(log);
      if (!version) {
        this.fail(
          AUDIT_VERSION_LABELS.INVALID,
          AUDIT_REASON_LABELS.VERSION_INVALID,
          new AuditHashVersionInvalidException('invalid'),
        );
      }

      if (version === AUDIT_VERSION_LABELS.V3) {
        this.verifyV3(log, actor, action);
      } else {
        this.verifyLegacyOrV2(log, actor, action, version);
      }
    }
  }

  private versionOf(log: CreateAuditLogDto): AuditVersionLabel | undefined {
    if (!Object.prototype.hasOwnProperty.call(log, 'hash_version')) {
      return AUDIT_VERSION_LABELS.ABSENT;
    }
    const { hash_version: value } = log;
    if (value === AUDIT_VERSION_LABELS.V2) return AUDIT_VERSION_LABELS.V2;
    if (value === AUDIT_VERSION_LABELS.V3) return AUDIT_VERSION_LABELS.V3;
    return undefined;
  }

  private verifyLegacyOrV2(
    log: CreateAuditLogDto,
    actor: string,
    action: string,
    version: AuditVersionLabel,
  ): void {
    const canonicalHash = this.hash(this.payload(log, actor, action, true));
    if (canonicalHash === log.entry_hash) return;
    if (version === AUDIT_VERSION_LABELS.V2) {
      this.fail(version, AUDIT_REASON_LABELS.HASH_MISMATCH);
    }

    const legacyHash = this.hash(this.payload(log, actor, action, false));
    if (legacyHash !== log.entry_hash) {
      this.fail(AUDIT_VERSION_LABELS.ABSENT, AUDIT_REASON_LABELS.HASH_MISMATCH);
    }
  }

  private verifyV3(
    log: CreateAuditLogDto,
    actor: string,
    action: string,
  ): void {
    if (typeof log.metadata_raw !== 'string') {
      this.failCanonical('AUDIT_V3_MISSING_METADATA_RAW', 0);
    }
    const rawMetadata = Buffer.from(log.metadata_raw, 'utf8');
    const canonical = canonicalizeNumberFreeJson(rawMetadata);
    if (canonical.ok === false) {
      this.failCanonical(canonical.error.code, canonical.error.offset);
    }
    try {
      log.metadata = JSON.parse(log.metadata_raw) as NumberFreeJson;
    } catch {
      this.failCanonical('AUDIT_V3_INVALID_JSON', 0);
    }
    const frame = buildAuditV3Frame(
      {
        user_id: actor,
        resolved_action: action,
        device_id: log.device_id,
        timestamp: log.timestamp,
        sequence_no: String(log.sequence_no),
        prev_hash: log.prev_hash,
        metodo_autorizacion: this.field(log.metodo_autorizacion),
        usuario_autorizador_id: this.field(log.usuario_autorizador_id),
      },
      canonical.value,
    );
    if (frame.ok === false)
      this.failFrame(frame.error.code, frame.error.offset);
    if (sha256LowerHex(frame.value) !== log.entry_hash) {
      this.fail(AUDIT_VERSION_LABELS.V3, AUDIT_REASON_LABELS.HASH_MISMATCH);
    }
  }

  private field(value: string | null | undefined): FieldState {
    if (value === undefined) return { state: 'absent' };
    if (value === null) return { state: 'null' };
    return { state: 'text', value };
  }

  private payload(
    log: CreateAuditLogDto,
    actor: string,
    action: string,
    canonical: boolean,
  ): string {
    const structuredMetadata =
      typeof log.metadata === 'object' &&
      log.metadata !== null &&
      !Array.isArray(log.metadata)
        ? (log.metadata as Readonly<Record<string, unknown>>)
        : undefined;
    const metadataRaw =
      log.metadata_raw ??
      (typeof structuredMetadata?.raw_text === 'string'
        ? structuredMetadata.raw_text
        : null);
    const metadata = canonical
      ? JSON.stringify(log.metadata ?? {})
      : (metadataRaw ?? 'null');
    return `${actor}|${action}|${log.device_id}|${log.timestamp}|${log.sequence_no}|${log.prev_hash}|${log.metodo_autorizacion || 'null'}|${log.usuario_autorizador_id || 'null'}|${metadata}`;
  }

  private hash(payload: string): string {
    return createHash('sha256').update(payload).digest('hex');
  }

  private failCanonical(code: string, offset: number): never {
    this.fail(
      AUDIT_VERSION_LABELS.V3,
      AUDIT_REASON_LABELS.CANONICALIZATION_FAILED,
      new BadRequestException({ code, offset }),
    );
  }

  private failFrame(code: string, offset: number): never {
    const reason =
      code === 'AUDIT_V3_FRAME_TOO_LARGE'
        ? AUDIT_REASON_LABELS.FRAME_TOO_LARGE
        : AUDIT_REASON_LABELS.FRAME_INVALID;
    this.fail(
      AUDIT_VERSION_LABELS.V3,
      reason,
      new BadRequestException({ code, offset }),
    );
  }

  private fail(
    version: AuditVersionLabel,
    reason: AuditReasonLabel,
    error: BadRequestException = new BadRequestException(
      'Invalid forensic chain',
    ),
  ): never {
    this.metrics.increment(version, reason);
    throw error;
  }
}
