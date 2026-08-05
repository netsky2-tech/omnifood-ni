export const SECURITY_EVIDENCE_CATEGORIES = {
  SECURITY_FORENSIC: 'security/forensic',
  FISCAL_DGI: 'fiscal/DGI',
  UNKNOWN: 'unknown',
} as const;

export const PREREQUISITE_NAMES = {
  CATEGORY: 'category',
  ELAPSED_COMMITMENT: 'elapsedCommitment',
  SEGMENT_CLOSED: 'segmentClosed',
  ARCHIVE_ENCRYPTED: 'archiveEncrypted',
  ARCHIVE_MANIFEST_IMMUTABLE: 'archiveManifestImmutable',
  ARCHIVE_RESTORE_VERIFIED: 'archiveRestoreVerified',
  CHAIN_CHECKPOINT_VERIFIED: 'chainCheckpointVerified',
  HOLD: 'hold',
} as const;

export const PREREQUISITE_STATUSES = {
  VERIFIED: 'verified',
  FAILED: 'failed',
  UNAVAILABLE: 'unavailable',
  INVALID: 'invalid',
} as const;

export const HOLD_VALUES = { ACTIVE: 'active', CLEAR: 'clear' } as const;

export type SecurityEvidenceCategory =
  (typeof SECURITY_EVIDENCE_CATEGORIES)[keyof typeof SECURITY_EVIDENCE_CATEGORIES];
export type PrerequisiteName =
  (typeof PREREQUISITE_NAMES)[keyof typeof PREREQUISITE_NAMES];
export type PrerequisiteStatus =
  (typeof PREREQUISITE_STATUSES)[keyof typeof PREREQUISITE_STATUSES];
export type HoldValue = (typeof HOLD_VALUES)[keyof typeof HOLD_VALUES];

const hasValue = <Value extends string>(
  values: Readonly<Record<string, Value>>,
  value: unknown,
): value is Value =>
  typeof value === 'string' && Object.values(values).includes(value as Value);

export const isSecurityEvidenceCategory = (
  value: unknown,
): value is SecurityEvidenceCategory =>
  hasValue(SECURITY_EVIDENCE_CATEGORIES, value);

export const isPrerequisiteName = (value: unknown): value is PrerequisiteName =>
  hasValue(PREREQUISITE_NAMES, value);

export const isPrerequisiteStatus = (
  value: unknown,
): value is PrerequisiteStatus => hasValue(PREREQUISITE_STATUSES, value);

export const isHoldValue = (value: unknown): value is HoldValue =>
  hasValue(HOLD_VALUES, value);
