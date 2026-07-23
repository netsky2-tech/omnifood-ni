import { Injectable, Logger } from '@nestjs/common';

export const AUDIT_VERSION_LABELS = {
  ABSENT: 'absent',
  V2: 'v2-canonical-json',
  V3: 'v3-jcs-rfc8785',
  INVALID: 'invalid',
} as const;

export type AuditVersionLabel =
  (typeof AUDIT_VERSION_LABELS)[keyof typeof AUDIT_VERSION_LABELS];

export const AUDIT_REASON_LABELS = {
  HASH_MISMATCH: 'hash_mismatch',
  FRAME_INVALID: 'frame_invalid',
  FRAME_TOO_LARGE: 'frame_too_large',
  CANONICALIZATION_FAILED: 'canonicalization_failed',
  VERSION_INVALID: 'version_invalid',
} as const;

export type AuditReasonLabel =
  (typeof AUDIT_REASON_LABELS)[keyof typeof AUDIT_REASON_LABELS];

const isAuditVersionLabel = (value: unknown): value is AuditVersionLabel =>
  Object.values(AUDIT_VERSION_LABELS).includes(value as AuditVersionLabel);

const isAuditReasonLabel = (value: unknown): value is AuditReasonLabel =>
  Object.values(AUDIT_REASON_LABELS).includes(value as AuditReasonLabel);

export interface IAuditMetrics {
  increment(version: AuditVersionLabel, reason: AuditReasonLabel): void;
  readCounters(): ReadonlyMap<string, number>;
}

@Injectable()
export class AuditMetricsService implements IAuditMetrics {
  private readonly logger = new Logger(AuditMetricsService.name);
  private readonly counters = new Map<string, number>();

  increment(version: AuditVersionLabel, reason: AuditReasonLabel): void {
    if (!isAuditVersionLabel(version) || !isAuditReasonLabel(reason)) {
      return;
    }

    const key = `${version}:${reason}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    this.logger.warn(
      JSON.stringify({
        event: 'audit_verification_failure',
        version,
        reason,
      }),
    );
  }

  readCounters(): ReadonlyMap<string, number> {
    return new Map(this.counters);
  }
}
