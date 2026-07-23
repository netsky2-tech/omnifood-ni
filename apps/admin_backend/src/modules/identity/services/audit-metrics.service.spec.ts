import { Logger } from '@nestjs/common';
import {
  AuditMetricsService,
  AUDIT_REASON_LABELS,
  AUDIT_VERSION_LABELS,
} from './audit-metrics.service';

describe('AuditMetricsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accumulates bounded counters independently for each version and reason', () => {
    const metrics = new AuditMetricsService();

    metrics.increment(
      AUDIT_VERSION_LABELS.V2,
      AUDIT_REASON_LABELS.HASH_MISMATCH,
    );
    metrics.increment(
      AUDIT_VERSION_LABELS.V2,
      AUDIT_REASON_LABELS.HASH_MISMATCH,
    );
    metrics.increment(
      AUDIT_VERSION_LABELS.V3,
      AUDIT_REASON_LABELS.FRAME_INVALID,
    );

    expect(metrics.readCounters()).toEqual(
      new Map([
        ['v2-canonical-json:hash_mismatch', 2],
        ['v3-jcs-rfc8785:frame_invalid', 1],
      ]),
    );
  });

  it('emits one structured warning containing only safe version and reason labels', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const metrics = new AuditMetricsService();

    metrics.increment(
      AUDIT_VERSION_LABELS.INVALID,
      AUDIT_REASON_LABELS.VERSION_INVALID,
    );

    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'audit_verification_failure',
        version: 'invalid',
        reason: 'version_invalid',
      }),
    );
  });

  it('rejects forged runtime labels without creating a counter or logging them', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const metrics = new AuditMetricsService();

    metrics.increment(
      'forged-version' as (typeof AUDIT_VERSION_LABELS)[keyof typeof AUDIT_VERSION_LABELS],
      AUDIT_REASON_LABELS.VERSION_INVALID,
    );
    metrics.increment(
      AUDIT_VERSION_LABELS.INVALID,
      'forged-reason' as (typeof AUDIT_REASON_LABELS)[keyof typeof AUDIT_REASON_LABELS],
    );

    expect(metrics.readCounters()).toEqual(new Map());
    expect(warn).not.toHaveBeenCalled();
  });
});
