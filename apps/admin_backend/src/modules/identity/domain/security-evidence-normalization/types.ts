import type {
  CanonicalFact,
  Conflict,
  ErrorData,
  Notice,
} from '../security-evidence-vocabulary';

export type NormalizationContainerError = ErrorData;

export type NormalizationEntryError = ErrorData & {
  readonly entryIndex: number;
};

export type NormalizationError =
  | NormalizationContainerError
  | NormalizationEntryError;

export interface NormalizationResult {
  readonly facts: readonly CanonicalFact[];
  readonly errors: readonly NormalizationError[];
  readonly notices: readonly Notice[];
  readonly conflicts: readonly Conflict[];
}
