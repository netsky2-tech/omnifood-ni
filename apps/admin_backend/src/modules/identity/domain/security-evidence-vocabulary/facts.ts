import type {
  HoldValue,
  PrerequisiteName,
  PrerequisiteStatus,
  SecurityEvidenceCategory,
} from './vocabulary';

export const ERROR_CODES = {
  E_CONTAINER: 'E_CONTAINER',
  E_REQUIRED_FIELD: 'E_REQUIRED_FIELD',
  E_NAME: 'E_NAME',
  E_STATUS: 'E_STATUS',
  E_VALUE: 'E_VALUE',
} as const;

export const ERROR_REASONS = {
  R_NOT_OBJECT: 'R_NOT_OBJECT',
  R_MISSING_FIELD: 'R_MISSING_FIELD',
  R_UNKNOWN_NAME: 'R_UNKNOWN_NAME',
  R_INVALID_STATUS: 'R_INVALID_STATUS',
  R_INVALID_SEMANTIC_VALUE: 'R_INVALID_SEMANTIC_VALUE',
  R_IDENTICAL_DUPLICATE: 'R_IDENTICAL_DUPLICATE',
  R_CONFLICTING_DUPLICATE: 'R_CONFLICTING_DUPLICATE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export type ReasonCode = (typeof ERROR_REASONS)[keyof typeof ERROR_REASONS];

type ErrorReasonByCode = {
  readonly [ERROR_CODES.E_CONTAINER]: typeof ERROR_REASONS.R_NOT_OBJECT;
  readonly [ERROR_CODES.E_REQUIRED_FIELD]: typeof ERROR_REASONS.R_MISSING_FIELD;
  readonly [ERROR_CODES.E_NAME]: typeof ERROR_REASONS.R_UNKNOWN_NAME;
  readonly [ERROR_CODES.E_STATUS]: typeof ERROR_REASONS.R_INVALID_STATUS;
  readonly [ERROR_CODES.E_VALUE]: typeof ERROR_REASONS.R_INVALID_SEMANTIC_VALUE;
};

export type ErrorReasonPair = {
  readonly [Code in keyof ErrorReasonByCode]: {
    readonly code: Code;
    readonly reason: ErrorReasonByCode[Code];
  };
}[keyof ErrorReasonByCode];

export type ErrorData = ErrorReasonPair & { readonly name?: string };

export interface Notice {
  readonly name: PrerequisiteName;
  readonly reason: typeof ERROR_REASONS.R_IDENTICAL_DUPLICATE;
}

export interface Conflict {
  readonly name: PrerequisiteName;
  readonly reason: typeof ERROR_REASONS.R_CONFLICTING_DUPLICATE;
}

type BooleanPrerequisiteName = Exclude<PrerequisiteName, 'category' | 'hold'>;

type BooleanCanonicalFact = {
  readonly [Name in BooleanPrerequisiteName]: {
    readonly name: Name;
    readonly value: boolean;
    readonly status: PrerequisiteStatus;
  };
}[BooleanPrerequisiteName];

export type CanonicalFact =
  | {
      readonly name: 'category';
      readonly value: SecurityEvidenceCategory;
      readonly status: PrerequisiteStatus;
    }
  | {
      readonly name: 'hold';
      readonly value: HoldValue;
      readonly status: PrerequisiteStatus;
    }
  | BooleanCanonicalFact;
