import {
  isHoldValue,
  isPrerequisiteName,
  isPrerequisiteStatus,
  isSecurityEvidenceCategory,
  type CanonicalFact,
  type ErrorData,
  type PrerequisiteName,
  type PrerequisiteStatus,
} from '../security-evidence-vocabulary';
import type {
  NormalizationContainerError,
  NormalizationEntryError,
  NormalizationResult,
} from './types';

type EvidenceEntry = Readonly<Record<string, unknown>>;

interface ExtractedEntry {
  readonly name: unknown;
  readonly status: unknown;
  readonly value: unknown;
}

const EMPTY_RESULT: NormalizationResult = {
  facts: [],
  errors: [],
  notices: [],
  conflicts: [],
};

const containerError = (): NormalizationContainerError => ({
  code: 'E_CONTAINER',
  reason: 'R_NOT_OBJECT',
});

const entryError = (
  error: ErrorData,
  entryIndex: number,
): NormalizationEntryError => ({ ...error, entryIndex });

const isRecord = (value: unknown): value is EvidenceEntry =>
  typeof value === 'object' &&
  value !== null &&
  (() => {
    try {
      return !Array.isArray(value);
    } catch {
      return false;
    }
  })();

const extractEntries = (input: unknown): readonly unknown[] | undefined => {
  if (!isRecord(input)) {
    return undefined;
  }

  try {
    const { entries } = input;
    return Array.isArray(entries) ? entries : undefined;
  } catch {
    return undefined;
  }
};

const extractEntry = (entry: unknown): ExtractedEntry | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }

  try {
    const { name, status, value } = entry;
    return { name, status, value };
  } catch {
    return undefined;
  }
};

const toCanonicalFact = (
  name: PrerequisiteName,
  status: PrerequisiteStatus,
  value: unknown,
): CanonicalFact | undefined => {
  if (name === 'category') {
    return isSecurityEvidenceCategory(value)
      ? { name, status, value }
      : undefined;
  }

  if (name === 'hold') {
    return isHoldValue(value) ? { name, status, value } : undefined;
  }

  return typeof value === 'boolean' ? { name, status, value } : undefined;
};

const normalizeEntry = (
  entry: unknown,
  entryIndex: number,
): CanonicalFact | NormalizationEntryError => {
  const extracted = extractEntry(entry);
  if (!extracted) {
    return entryError(containerError(), entryIndex);
  }

  const { name, status, value } = extracted;
  if (name === undefined || status === undefined || value === undefined) {
    return entryError(
      typeof name === 'string'
        ? { code: 'E_REQUIRED_FIELD', reason: 'R_MISSING_FIELD', name }
        : { code: 'E_REQUIRED_FIELD', reason: 'R_MISSING_FIELD' },
      entryIndex,
    );
  }

  if (!isPrerequisiteName(name)) {
    return entryError(
      {
        code: 'E_NAME',
        reason: 'R_UNKNOWN_NAME',
        name: typeof name === 'string' ? name : undefined,
      },
      entryIndex,
    );
  }

  if (!isPrerequisiteStatus(status)) {
    return entryError(
      { code: 'E_STATUS', reason: 'R_INVALID_STATUS', name },
      entryIndex,
    );
  }

  const fact = toCanonicalFact(name, status, value);
  return (
    fact ??
    entryError(
      { code: 'E_VALUE', reason: 'R_INVALID_SEMANTIC_VALUE', name },
      entryIndex,
    )
  );
};

const isNormalizationEntryError = (
  value: CanonicalFact | NormalizationEntryError,
): value is NormalizationEntryError => 'entryIndex' in value;

export const normalizeSecurityEvidence = (
  input: unknown,
): NormalizationResult => {
  const entries = extractEntries(input);
  if (!entries) {
    return { ...EMPTY_RESULT, errors: [containerError()] };
  }

  const facts: CanonicalFact[] = [];
  const errors: NormalizationEntryError[] = [];
  try {
    const length = entries.length;
    if (!Number.isSafeInteger(length) || length < 0) {
      return { ...EMPTY_RESULT, errors: [containerError()] };
    }
    for (let entryIndex = 0; entryIndex < length; entryIndex += 1) {
      const normalized = normalizeEntry(entries[entryIndex], entryIndex);
      if (isNormalizationEntryError(normalized)) {
        errors.push(normalized);
        continue;
      }

      facts.push(normalized);
    }
  } catch {
    return { ...EMPTY_RESULT, errors: [containerError()] };
  }

  return { facts, errors, notices: [], conflicts: [] };
};
