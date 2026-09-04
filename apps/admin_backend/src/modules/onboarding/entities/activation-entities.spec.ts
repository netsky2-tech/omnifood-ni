import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from './activation-attempt.entity';
import {
  ActivationCheckResult,
  ActivationCheckCode,
  ActivationCheckStatus,
} from './activation-check-result.entity';
import {
  ActivationFollowUp,
  ActivationFollowUpStatus,
} from './activation-follow-up.entity';

describe('Activation Entities', () => {
  it('instantiates ActivationAttempt with defaults and pinned metadata', () => {
    const attempt = new ActivationAttempt();
    attempt.id = 'att-1';
    attempt.tenantId = 'tenant-1';
    attempt.onboardingSessionId = 'sess-1';
    attempt.candidateTerminalId = 'term-1';
    attempt.status = ActivationAttemptStatus.CREATED;
    attempt.startedByUserId = 'user-1';
    attempt.startedAt = new Date('2026-09-04T12:00:00Z');
    attempt.serverTimeAnchorAt = new Date('2026-09-04T12:00:00Z');
    attempt.requiredFiscalRevision = 1;
    attempt.requiredFiscalFingerprint = 'fiscal-fp-1';
    attempt.verificationProductId = 'prod-1';
    attempt.verificationProductRevision = 1;
    attempt.verificationProductFingerprint = 'prod-fp-1';

    expect(attempt.status).toBe(ActivationAttemptStatus.CREATED);
    expect(attempt.candidateTerminalId).toBe('term-1');
    expect(attempt.requiredFiscalRevision).toBe(1);
    expect(attempt.requiredFiscalFingerprint).toBe('fiscal-fp-1');
    expect(attempt.verificationProductId).toBe('prod-1');
  });

  it('instantiates ActivationCheckResult with catalog codes and status', () => {
    const check = new ActivationCheckResult();
    check.tenantId = 'tenant-1';
    check.activationAttemptId = 'att-1';
    check.checkCode = ActivationCheckCode.TERMINAL_LINKED;
    check.status = ActivationCheckStatus.PASS;
    check.required = true;

    expect(check.checkCode).toBe(ActivationCheckCode.TERMINAL_LINKED);
    expect(check.status).toBe(ActivationCheckStatus.PASS);
    expect(check.required).toBe(true);
  });

  it('instantiates ActivationFollowUp with warning details', () => {
    const followUp = new ActivationFollowUp();
    followUp.tenantId = 'tenant-1';
    followUp.activationAttemptId = 'att-1';
    followUp.warningCode = 'POST_RECONNECT_SYNC_TRANSIENT';
    followUp.status = ActivationFollowUpStatus.OPEN;
    followUp.openedBy = 'SYSTEM_FINALIZER';

    expect(followUp.status).toBe(ActivationFollowUpStatus.OPEN);
    expect(followUp.warningCode).toBe('POST_RECONNECT_SYNC_TRANSIENT');
  });
});
