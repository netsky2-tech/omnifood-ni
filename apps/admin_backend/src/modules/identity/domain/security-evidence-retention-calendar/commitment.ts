import { compareDateOnly, type DateOnly } from './calendar';
import type { ValidatedCategory, ValidatedEvidenceInput } from './evidence';
import { calendarError, type CalendarError } from './errors';
import type { CommitmentId, PredecessorId } from './identifiers';
import type { HoldRef } from './holds';
import type { ValidatedPolicy } from './policy';
import { err, ok, type Result } from './result';

export interface CommitmentSnapshot {
  readonly commitmentId: CommitmentId;
  readonly predecessorId?: PredecessorId;
  readonly category: ValidatedCategory;
  readonly originDate: DateOnly;
  readonly effectiveDate: DateOnly;
  readonly durationYears: number;
  readonly holdRef?: HoldRef;
  readonly createdAt: DateOnly;
}

export const createCommitment = (
  commitmentId: CommitmentId,
  evidence: ValidatedEvidenceInput,
  originDate: DateOnly,
  selectedPolicy: ValidatedPolicy,
  holdRef?: HoldRef,
): Result<CommitmentSnapshot, CalendarError> => {
  if (compareDateOnly(originDate, evidence.originDate) !== 0)
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));

  if (evidence.category !== selectedPolicy.category)
    return err(calendarError('INVALID_POLICY', 'MALFORMED_SHAPE'));

  return ok({
    commitmentId,
    category: evidence.category,
    originDate,
    effectiveDate: selectedPolicy.effectiveDate,
    durationYears: selectedPolicy.durationYears,
    holdRef,
    createdAt: originDate,
  });
};

export const extendCommitment = (
  predecessor: CommitmentSnapshot,
  newCommitmentId: CommitmentId,
  newPolicy: ValidatedPolicy,
  holdRef?: HoldRef,
): Result<CommitmentSnapshot, CalendarError> => {
  if (predecessor.category !== newPolicy.category)
    return err(calendarError('INVALID_POLICY', 'MALFORMED_SHAPE'));

  if (newPolicy.durationYears <= predecessor.durationYears)
    return err(calendarError('INVALID_POLICY', 'DURATION_OUT_OF_RANGE'));

  const successorOrigin = newPolicy.effectiveDate;

  return ok({
    commitmentId: newCommitmentId,
    predecessorId: predecessor.commitmentId as unknown as PredecessorId,
    category: predecessor.category,
    originDate: successorOrigin,
    effectiveDate: newPolicy.effectiveDate,
    durationYears: newPolicy.durationYears,
    holdRef: holdRef ?? predecessor.holdRef,
    createdAt: successorOrigin,
  });
};
