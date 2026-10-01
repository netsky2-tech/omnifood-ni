import { HttpStatus, ConflictException } from '@nestjs/common';

/**
 * D-6 (issue #526 unit B5): the named state the authority requires by name
 * (founder-pilot-execution-plan.md). It is deliberately NOT
 * `FISCAL_SEQUENCE_UNCONFIGURED`, which means an absent or corrupt local
 * cursor — this code means the cloud already holds the folio the device is
 * proposing, so selling would fabricate a duplicate.
 *
 * The tripwire never corrects the number silently: the response carries the
 * conflicting cloud max so the POS can render the recovery message, and the
 * refusal path performs no write.
 */
export const FISCAL_SEQUENCE_RECOVERY_REQUIRED_CODE =
  'FISCAL_SEQUENCE_RECOVERY_REQUIRED';

export class FiscalSequenceRecoveryRequiredException extends ConflictException {
  readonly code = FISCAL_SEQUENCE_RECOVERY_REQUIRED_CODE;

  /**
   * Two variants of the same named state:
   * - `highestSequenceNumber` known → the cloud already holds that folio, so
   *   selling the proposed one would fabricate a duplicate.
   * - `highestSequenceNumber` null → the cloud MAX read FAILED, so the
   *   proposal could not be verified at all. A replay tripwire fails closed:
   *   an unverifiable proposal is the recovery state, never a green light.
   */
  constructor(params: {
    proposedSequence: number;
    highestSequenceNumber?: number | null;
  }) {
    const { proposedSequence, highestSequenceNumber = null } = params;
    const message =
      highestSequenceNumber === null
        ? `Fiscal sequence recovery required: the cloud invoice-sequence ` +
          `MAX read failed, so the proposed sequence could not be verified. ` +
          `No number was guessed; explicit recovery is required before this ` +
          `terminal can sell.`
        : `Fiscal sequence recovery required: the cloud already holds invoice ` +
          `sequence ${highestSequenceNumber} for this tenant, so a terminal ` +
          `proposing sequence ${proposedSequence} cannot sell. No number was ` +
          `corrected or renumbered; explicit recovery is required.`;

    super({
      statusCode: HttpStatus.CONFLICT,
      error: FISCAL_SEQUENCE_RECOVERY_REQUIRED_CODE,
      code: FISCAL_SEQUENCE_RECOVERY_REQUIRED_CODE,
      message,
      // Serialized in the HTTP body so the POS can render the conflicting
      // number without guessing it (null when no number could be computed).
      highestSequenceNumber,
      proposedSequence,
    });
  }
}
