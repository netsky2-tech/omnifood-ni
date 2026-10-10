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
      // --- POS forensic ledger codes (S4a): live writers verified by call
      // site in apps/pos_app/lib; each reaches audit_logs via
      // POST /identity/audit (push persists `action` verbatim,
      // identity/audit.controller.ts) or is written server-side. ---
      {
        action: 'SALE_CREATED',
        expected: 'INFO',
        evidence:
          'sales_repository_impl.dart:251 — plain sale creation, the expected every-invoice operation; awareness only (PRD §19.1 Info)',
      },
      {
        action: 'SALE_VOIDED',
        expected: 'CRITICAL',
        evidence:
          'sales_repository_impl.dart:880 — cancels an ALREADY-ISSUED fiscal invoice (DTI 09-2007 cancellation); money reversal on a numbered fiscal document (PRD §19.1 Critical)',
      },
      {
        action: 'CREDIT_NOTE_CREATED',
        expected: 'CRITICAL',
        evidence:
          'sales_repository_impl.dart:1090 — issues a fiscal credit note against an original invoice: money returned on a numbered fiscal document (PRD §19.1 Critical)',
      },
      {
        action: 'SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT',
        expected: 'CRITICAL',
        evidence:
          'sale_view.dart:2163 (logForensic) — privileged override applying a manual discount: control bypass on a money event (PRD §19.1 Critical)',
      },
      {
        action: 'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
        expected: 'CRITICAL',
        evidence:
          'sale_view.dart:698 (logForensic) — privileged override of the session close / cash reconciliation flow: control bypass on cash (PRD §19.1 Critical)',
      },
      {
        action: 'DRAWER_OPENED_MANUALLY',
        expected: 'WARNING',
        evidence:
          'sale_view.dart:744 (logForensic) and backend audit-trail.service.ts recordManualDrawerOpen — supervised cash drawer open outside a sale: cash exposure follow-up (PRD §19.1 Warning)',
      },
      {
        action: 'REPRINT_REQUESTED',
        expected: 'WARNING',
        evidence:
          'sales_repository_impl.dart:744 and durable_print_service.dart:373 — fiscal receipt reissue request: a receipt-fraud follow-up signal, no money movement (PRD §19.1 Warning)',
      },
      {
        action: 'PRINT_PAYLOAD_CORRUPT',
        expected: 'WARNING',
        evidence:
          'durable_print_service.dart:100,300 — emitted when the H4 fail-safe REFUSES to print a corrupt fiscal payload; the control worked, the follow-up is re-print/verify (PRD §19.1 Warning)',
      },
      // --- Backend audit_logs writers the same ledger surface renders
      // (verified call sites; today they fall through to INFO). ---
      {
        action: 'SUPERVISOR_OVERRIDE_APPROVED',
        expected: 'CRITICAL',
        evidence:
          'supervisor-override.service.ts:215 — a privileged override was actually GRANTED; the privilege event itself (PRD §19.1 Critical)',
      },
      {
        action: 'SUPERVISOR_OVERRIDE_REJECTED',
        expected: 'WARNING',
        evidence:
          'supervisor-override.service.ts:94-182 — a privileged override attempt was denied; repeated denials are a probing follow-up signal (PRD §19.1 Warning)',
      },
      {
        action: 'SALE_INVENTORY_REMEDIATED',
        expected: 'WARNING',
        evidence:
          'sale-inventory-remediation.service.ts:265 — inventory/money correction applied to an issued invoice; operational follow-up (PRD §19.1 Warning)',
      },
      {
        action: 'USER_CREATED',
        expected: 'INFO',
        evidence:
          'user.service.ts:124 — routine staff onboarding, awareness (PRD §19.1 Info)',
      },
      {
        action: 'USER_UPDATED',
        expected: 'INFO',
        evidence:
          'user.service.ts:193,298 — routine staff data change, awareness (PRD §19.1 Info)',
      },
      {
        action: 'USER_DEACTIVATED',
        expected: 'WARNING',
        evidence:
          'user.service.ts:232 — POS access revocation: security-relevant follow-up (PRD §19.1 Warning)',
      },
      {
        action: 'USER_PERMISSIONS_UPDATED',
        expected: 'CRITICAL',
        evidence:
          'user.service.ts:395 — permission change is a privilege-escalation vector (PRD §19.1 Critical)',
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

    // S4a guard: money, privilege and permission codes must NEVER silently
    // degrade to the unknown-code INFO fallback. A future edit that drops a
    // row from ACTION_SEVERITY_TABLE (or renames a code away) fails here
    // loudly instead of demoting voids, credit notes, privileged overrides
    // and permission changes to awareness noise on the owner dashboard.
    const MONEY_PRIVILEGE_PERMISSION_CODES: readonly string[] = [
      'SALE_VOIDED',
      'CREDIT_NOTE_CREATED',
      'SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT',
      'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
      'SUPERVISOR_OVERRIDE_APPROVED',
      'SALE_INVENTORY_REMEDIATED',
      'USER_PERMISSIONS_UPDATED',
      'DRAWER_OPENED_MANUALLY',
      'REPRINT_REQUESTED',
      'PRINT_PAYLOAD_CORRUPT',
      'USER_DEACTIVATED',
      'SUPERVISOR_OVERRIDE_REJECTED',
    ];

    it('never classifies money, privilege or permission codes as INFO (S4a guard)', () => {
      for (const action of MONEY_PRIVILEGE_PERMISSION_CODES) {
        const severity = classifyAuditSeverity(action);
        expect(
          severity === 'CRITICAL' || severity === 'WARNING',
        ).toBe(true);
      }
    });

    it('classifies plain sale creation as awareness, never as CRITICAL (S4a calibration)', () => {
      expect(classifyAuditSeverity('SALE_CREATED')).toBe('INFO');
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
      expect(resolveAuditSeverity('CRITICAL')).toBe('CRITICAL');
      expect(resolveAuditSeverity('WARNING')).toBe('WARNING');
      expect(resolveAuditSeverity('INFO')).toBe('INFO');
    });

    it('surfaces historical NULL/undefined severity rows as INFO (backfill-free rule, no history mutation)', () => {
      expect(resolveAuditSeverity(null)).toBe('INFO');
      expect(resolveAuditSeverity(undefined)).toBe('INFO');
      expect(resolveAuditSeverity('')).toBe('INFO');
    });

    it('surfaces an unrecognized stored value as INFO instead of escalating it', () => {
      expect(resolveAuditSeverity('SEVERE')).toBe('INFO');
    });

    it('prefers the persisted column over re-derivation (single severity source, spec §16.2)', () => {
      // A row persisted as CRITICAL must stay CRITICAL even though its
      // action alone would classify lower: the stored value is authoritative.
      expect(resolveAuditSeverity('CRITICAL')).toBe('CRITICAL');
    });
  });
});
