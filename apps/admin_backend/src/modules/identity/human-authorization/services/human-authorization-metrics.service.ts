import { Injectable, Logger } from '@nestjs/common';

/**
 * In-memory OHAC observability counters (design §12).
 *
 * Mirrors the AuditMetricsService precedent: no Prometheus dependency, an
 * in-memory Map plus one structured log line per event. Every label is a
 * stable outcome/integrity/lifecycle vocabulary or a cohort/build decision —
 * IDs and digests only. NEVER a PIN, a bcrypt verifier, a token secret, its
 * HMAC, or an assertion body.
 */
export const OHAC_PUBLICATION_DECISION = {
  PUBLISHED: 'published',
  SKIPPED_UNCHANGED: 'skipped_unchanged',
} as const;

export const OHAC_VERIFICATION_OUTCOME = {
  ADMITTED: 'admitted',
  DENIED: 'denied',
} as const;

export const OHAC_RECOVERY_LIFECYCLE = {
  ISSUED: 'issued',
  REDEEMED: 'redeemed',
  REVOKED: 'revoked',
  DENIED: 'denied',
  EXPIRED: 'expired',
  RACE_LOSS: 'race_loss',
} as const;

export type OhacPublicationDecision =
  (typeof OHAC_PUBLICATION_DECISION)[keyof typeof OHAC_PUBLICATION_DECISION];
export type OhacVerificationOutcome =
  (typeof OHAC_VERIFICATION_OUTCOME)[keyof typeof OHAC_VERIFICATION_OUTCOME];
export type OhacRecoveryLifecycle =
  (typeof OHAC_RECOVERY_LIFECYCLE)[keyof typeof OHAC_RECOVERY_LIFECYCLE];

const isLabel = <T extends string>(
  value: unknown,
  vocabulary: Readonly<Record<string, T>>,
): value is T =>
  typeof value === 'string' &&
  (Object.values(vocabulary) as readonly string[]).includes(value);

export interface IOhacMetrics {
  incrementEpochPublication(
    decision: OhacPublicationDecision,
    lagEpochs: number,
  ): void;
  incrementAckRetry(): void;
  incrementAckFloorConflict(resultCode: string): void;
  incrementIntegrityClass(classification: string): void;
  incrementVerificationOutcome(
    outcome: OhacVerificationOutcome,
    reasonCode?: string,
  ): void;
  incrementRecoveryLifecycle(
    event: OhacRecoveryLifecycle,
    reasonCode?: string,
  ): void;
  incrementCohortDecision(
    decision: string,
    posBuild: string,
    backendBuild: string,
  ): void;
  readCounters(): ReadonlyMap<string, number>;
}

const clampLagBucket = (lagEpochs: number): string => {
  if (!Number.isFinite(lagEpochs) || lagEpochs < 0) return 'invalid';
  if (lagEpochs === 0) return '0';
  if (lagEpochs <= 5) return '1-5';
  if (lagEpochs <= 20) return '6-20';
  return '20+';
};

@Injectable()
export class HumanAuthorizationMetricsService implements IOhacMetrics {
  private readonly logger = new Logger(HumanAuthorizationMetricsService.name);
  private readonly counters = new Map<string, number>();

  private increment(key: string): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    this.logger.log(JSON.stringify({ event: 'ohac_counter', counter: key }));
  }

  incrementEpochPublication(
    decision: OhacPublicationDecision,
    lagEpochs: number,
  ): void {
    if (!isLabel(decision, OHAC_PUBLICATION_DECISION)) return;
    this.increment(`ohac_epoch_publication:${decision}`);
    this.increment(`ohac_publication_lag_epochs:${clampLagBucket(lagEpochs)}`);
  }

  incrementAckRetry(): void {
    this.increment('ohac_ack_retries');
  }

  incrementAckFloorConflict(resultCode: string): void {
    if (typeof resultCode !== 'string' || resultCode.trim().length === 0)
      return;
    this.increment(`ohac_ack_floor_conflicts:${resultCode}`);
  }

  incrementIntegrityClass(classification: string): void {
    if (
      typeof classification !== 'string' ||
      classification.trim().length === 0
    )
      return;
    this.increment(`ohac_integrity_class:${classification}`);
  }

  incrementVerificationOutcome(
    outcome: OhacVerificationOutcome,
    reasonCode?: string,
  ): void {
    if (!isLabel(outcome, OHAC_VERIFICATION_OUTCOME)) return;
    this.increment(
      reasonCode
        ? `ohac_verification:${outcome}:${reasonCode}`
        : `ohac_verification:${outcome}`,
    );
  }

  incrementRecoveryLifecycle(
    event: OhacRecoveryLifecycle,
    reasonCode?: string,
  ): void {
    if (!isLabel(event, OHAC_RECOVERY_LIFECYCLE)) return;
    this.increment(
      reasonCode
        ? `ohac_recovery:${event}:${reasonCode}`
        : `ohac_recovery:${event}`,
    );
  }

  incrementCohortDecision(
    decision: string,
    posBuild: string,
    backendBuild: string,
  ): void {
    if (
      typeof decision !== 'string' ||
      decision.trim().length === 0 ||
      typeof posBuild !== 'string' ||
      posBuild.trim().length === 0 ||
      typeof backendBuild !== 'string' ||
      backendBuild.trim().length === 0
    ) {
      return;
    }
    this.increment(`ohac_cohort:${decision}:${posBuild}:${backendBuild}`);
  }

  readCounters(): ReadonlyMap<string, number> {
    return new Map(this.counters);
  }
}
