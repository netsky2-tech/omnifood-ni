import {
  AUDIT_SEVERITIES,
  AuditSeverity,
  classifyAuditSeverity,
  resolveAuditSeverity,
} from './audit-risk-classifier';

/**
 * Table-driven deterministic classifier spec (AG-07, architecture spec v0.3
 * §16.2): one `AuditRiskClassifier` maps the event/action type to the PRD
 * v1.0 §19.1 severity taxonomy CRITICAL / WARNING / INFO. Every mapping row
 * carries the repository evidence for its severity so the table cannot drift
 * silently when new actions appear.
 */
describe('audit-risk-classifier', () => {
  describe('classifyAuditSeverity (event/action type -> severity)', () => {
    const classificationTable: Array<{
      action: string;
      expected: AuditSeverity;
      evidence: string;
    }> = [
      {
        action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
        expected: 'CRITICAL',
        evidence:
          'activation.service.ts records a FAIL activation check (security/integrity control failure); PRD §19.1 Critical: security or integrity risk requiring investigation',
      },
      {
        action: 'ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE',
        expected: 'CRITICAL',
        evidence:
          'activation.service.ts records a SUPPORT_OPERATOR override of the activation flow; a control bypass is a material security risk (PRD §19.1 Critical)',
      },
      {
        action: 'ONBOARDING_ACTIVATION_FINALIZED',
        expected: 'WARNING',
        evidence:
          'activation.service.ts: finalizing an activation issues device sync credentials — a security-relevant lifecycle event an owner should notice (PRD §19.1 Warning)',
      },
      {
        action: 'ONBOARDING_ACTIVATION_FOLLOW_UP_OPENED',
        expected: 'WARNING',
        evidence:
          'opening a follow-up is by definition explicit operational follow-up (PRD §19.1 Warning)',
      },
      {
        action: 'ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED',
        expected: 'INFO',
        evidence:
          'closing a follow-up resolves a previously surfaced item; awareness only (PRD §19.1 Info)',
      },
      {
        action: 'ONBOARDING_ACTIVATION_ATTEMPT_STARTED',
        expected: 'INFO',
        evidence:
          'expected activation lifecycle start, no integrity signal (PRD §19.1 Info)',
      },
      {
        action: 'CREATE',
        expected: 'INFO',
        evidence:
          'catalog.service.ts / product.service.ts routine data creation (PRD §19.1 Info)',
      },
      {
        action: 'UPDATE',
        expected: 'INFO',
        evidence:
          'catalog.service.ts / product.service.ts routine data change (PRD §19.1 Info)',
      },
      {
        action: 'DEACTIVATE',
        expected: 'WARNING',
        evidence:
          'catalog.service.ts / product.service.ts availability removal — the catalog analog of void activity requiring review (PRD §19.1 Warning)',
      },
    ];

    it.each(classificationTable)(
      'classifies $action as $expected',
      ({ action, expected, evidence }) => {
        // The evidence field documents the mapping source; the assertion is
        // the deterministic contract itself.
        expect(evidence).toBeTruthy();
        expect(classifyAuditSeverity(action)).toBe(expected);
      },
    );

    it('falls back to INFO for an unknown action (conservative documented rule)', () => {
      expect(classifyAuditSeverity('SOME_FUTURE_ACTION')).toBe('INFO');
    });

    it('is insensitive to surrounding whitespace and case for known actions', () => {
      expect(classifyAuditSeverity('  UPDATE  ')).toBe('INFO');
      expect(classifyAuditSeverity('deactivate')).toBe('WARNING');
      expect(classifyAuditSeverity('onboarding_activation_check_failed')).toBe(
        'CRITICAL',
      );
    });

    it('never returns a value outside the PRD taxonomy', () => {
      for (const action of [
        'ONBOARDING_ACTIVATION_CHECK_FAILED',
        'UPDATE',
        'UNKNOWN',
      ]) {
        expect(AUDIT_SEVERITIES).toContain(classifyAuditSeverity(action));
      }
    });
  });

  describe('resolveAuditSeverity (stored severity with historical NULL rule)', () => {
    it('returns the stored severity when it is a known taxonomy value', () => {
      expect(resolveAuditSeverity('CRITICAL', 'UPDATE')).toBe('CRITICAL');
      expect(resolveAuditSeverity('WARNING', 'UPDATE')).toBe('WARNING');
      expect(resolveAuditSeverity('INFO', 'UPDATE')).toBe('INFO');
    });

    it('surfaces historical NULL/undefined severity rows as INFO (backfill-free rule, no history mutation)', () => {
      expect(resolveAuditSeverity(null, 'UPDATE')).toBe('INFO');
      expect(resolveAuditSeverity(undefined, 'UPDATE')).toBe('INFO');
      expect(resolveAuditSeverity('', 'UPDATE')).toBe('INFO');
    });

    it('surfaces an unrecognized stored value as INFO instead of escalating it', () => {
      expect(resolveAuditSeverity('SEVERE', 'UPDATE')).toBe('INFO');
    });

    it('prefers the persisted column over re-derivation (single severity source, spec §16.2)', () => {
      // A row persisted as CRITICAL must stay CRITICAL even though its
      // action alone would classify lower: the stored value is authoritative.
      expect(resolveAuditSeverity('CRITICAL', 'UPDATE')).toBe('CRITICAL');
    });
  });
});
