import {
  HOLD_VALUES,
  PREREQUISITE_NAMES,
  PREREQUISITE_STATUSES,
  SECURITY_EVIDENCE_CATEGORIES,
  isHoldValue,
  isPrerequisiteName,
  isPrerequisiteStatus,
  isSecurityEvidenceCategory,
  type HoldValue,
  type PrerequisiteName,
  type PrerequisiteStatus,
  type SecurityEvidenceCategory,
} from './index';

describe('security evidence vocabulary', () => {
  it('exposes only the exact vocabulary literals', () => {
    expect(SECURITY_EVIDENCE_CATEGORIES).toEqual({
      SECURITY_FORENSIC: 'security/forensic',
      FISCAL_DGI: 'fiscal/DGI',
      UNKNOWN: 'unknown',
    });
    expect(PREREQUISITE_NAMES).toEqual({
      CATEGORY: 'category',
      ELAPSED_COMMITMENT: 'elapsedCommitment',
      SEGMENT_CLOSED: 'segmentClosed',
      ARCHIVE_ENCRYPTED: 'archiveEncrypted',
      ARCHIVE_MANIFEST_IMMUTABLE: 'archiveManifestImmutable',
      ARCHIVE_RESTORE_VERIFIED: 'archiveRestoreVerified',
      CHAIN_CHECKPOINT_VERIFIED: 'chainCheckpointVerified',
      HOLD: 'hold',
    });
    expect(PREREQUISITE_STATUSES).toEqual({
      VERIFIED: 'verified',
      FAILED: 'failed',
      UNAVAILABLE: 'unavailable',
      INVALID: 'invalid',
    });
    expect(HOLD_VALUES).toEqual({ ACTIVE: 'active', CLEAR: 'clear' });
  });

  it('narrows exact scalar values and rejects other scalars and containers', () => {
    const category: unknown = 'security/forensic';
    const name: unknown = 'category';
    const status: unknown = 'verified';
    const hold: unknown = 'active';

    expect(isSecurityEvidenceCategory(category)).toBe(true);
    expect(isPrerequisiteName(name)).toBe(true);
    expect(isPrerequisiteStatus(status)).toBe(true);
    expect(isHoldValue(hold)).toBe(true);
    expect(isSecurityEvidenceCategory('security')).toBe(false);
    expect(isPrerequisiteName([])).toBe(false);
    expect(isPrerequisiteStatus({ value: 'verified' })).toBe(false);
    expect(isHoldValue(null)).toBe(false);

    if (
      isSecurityEvidenceCategory(category) &&
      isPrerequisiteName(name) &&
      isPrerequisiteStatus(status) &&
      isHoldValue(hold)
    ) {
      const narrowed: [
        SecurityEvidenceCategory,
        PrerequisiteName,
        PrerequisiteStatus,
        HoldValue,
      ] = [category, name, status, hold];
      expect(narrowed).toEqual([
        'security/forensic',
        'category',
        'verified',
        'active',
      ]);
    }
  });
});
