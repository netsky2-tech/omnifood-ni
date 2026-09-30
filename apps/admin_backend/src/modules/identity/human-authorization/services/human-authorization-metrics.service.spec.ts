import {
  HumanAuthorizationMetricsService,
  OHAC_PUBLICATION_DECISION,
  OHAC_RECOVERY_LIFECYCLE,
  OHAC_VERIFICATION_OUTCOME,
} from './human-authorization-metrics.service';

describe('HumanAuthorizationMetricsService (design §12)', () => {
  it('counts epoch publications with a lag bucket', () => {
    const metrics = new HumanAuthorizationMetricsService();
    metrics.incrementEpochPublication(OHAC_PUBLICATION_DECISION.PUBLISHED, 0);
    metrics.incrementEpochPublication(OHAC_PUBLICATION_DECISION.PUBLISHED, 3);
    metrics.incrementEpochPublication(
      OHAC_PUBLICATION_DECISION.SKIPPED_UNCHANGED,
      42,
    );
    const counters = metrics.readCounters();
    expect(counters.get('ohac_epoch_publication:published')).toBe(2);
    expect(counters.get('ohac_publication_lag_epochs:0')).toBe(1);
    expect(counters.get('ohac_publication_lag_epochs:1-5')).toBe(1);
    expect(counters.get('ohac_publication_lag_epochs:20+')).toBe(1);
  });

  it('counts ack retries and floor conflicts by stable code', () => {
    const metrics = new HumanAuthorizationMetricsService();
    metrics.incrementAckRetry();
    metrics.incrementAckRetry();
    metrics.incrementAckFloorConflict('STALE_SEQUENCE');
    const counters = metrics.readCounters();
    expect(counters.get('ohac_ack_retries')).toBe(2);
    expect(counters.get('ohac_ack_floor_conflicts:STALE_SEQUENCE')).toBe(1);
  });

  it('counts integrity classes, verification outcomes, and cohort/build decisions', () => {
    const metrics = new HumanAuthorizationMetricsService();
    metrics.incrementIntegrityClass('LOCAL_ROLLBACK');
    metrics.incrementVerificationOutcome(
      OHAC_VERIFICATION_OUTCOME.DENIED,
      'OHAC_STALE_EPOCH',
    );
    metrics.incrementVerificationOutcome(OHAC_VERIFICATION_OUTCOME.ADMITTED);
    metrics.incrementCohortDecision('ELIGIBLE', 'pos-1', 'backend-1');
    const counters = metrics.readCounters();
    expect(counters.get('ohac_integrity_class:LOCAL_ROLLBACK')).toBe(1);
    expect(counters.get('ohac_verification:denied:OHAC_STALE_EPOCH')).toBe(1);
    expect(counters.get('ohac_verification:admitted')).toBe(1);
    expect(counters.get('ohac_cohort:ELIGIBLE:pos-1:backend-1')).toBe(1);
  });

  it('counts the recovery lifecycle with optional reason codes', () => {
    const metrics = new HumanAuthorizationMetricsService();
    metrics.incrementRecoveryLifecycle(OHAC_RECOVERY_LIFECYCLE.ISSUED);
    metrics.incrementRecoveryLifecycle(
      OHAC_RECOVERY_LIFECYCLE.DENIED,
      'OHAC_RECOVERY_EXPIRED',
    );
    const counters = metrics.readCounters();
    expect(counters.get('ohac_recovery:issued')).toBe(1);
    expect(counters.get('ohac_recovery:denied:OHAC_RECOVERY_EXPIRED')).toBe(1);
  });

  it('ignores unknown labels and blank inputs instead of inventing keys', () => {
    const metrics = new HumanAuthorizationMetricsService();
    metrics.incrementVerificationOutcome('hacked' as never);
    metrics.incrementAckFloorConflict('');
    metrics.incrementIntegrityClass('   ');
    metrics.incrementCohortDecision('', 'pos', 'backend');
    expect(metrics.readCounters().size).toBe(0);
  });

  it('returns a defensive copy and never exposes secret-looking labels', () => {
    const metrics = new HumanAuthorizationMetricsService();
    metrics.incrementRecoveryLifecycle(OHAC_RECOVERY_LIFECYCLE.REDEEMED);
    const first = metrics.readCounters() as Map<string, number>;
    first.set('tampered', 1);
    expect(metrics.readCounters().has('tampered')).toBe(false);
    for (const key of metrics.readCounters().keys()) {
      expect(key).toMatch(/^ohac_[a-z_]+(:[A-Za-z0-9_.-]+)*$/);
      expect(key).not.toMatch(/pin|verifier|secret|hmac|bcrypt/i);
    }
  });
});
