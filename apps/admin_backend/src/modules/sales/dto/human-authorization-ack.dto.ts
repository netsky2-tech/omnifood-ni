import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Acknowledgement request body (design §5.3). The terminal and tenant are
 * deliberately absent: both come from the authenticated device principal the
 * transport guard attaches, so a body can never claim to be another terminal
 * or another tenant.
 */
export class AcknowledgeStaffPolicyEpochDto {
  @IsString()
  @IsNotEmpty()
  schema!: string;

  @IsString()
  @Matches(/^\d+$/, { message: 'sequence must be a canonical decimal string' })
  sequence!: string;

  @IsString()
  @Matches(/^sha256:[0-9a-f]{64}$/, { message: 'digest must be a sha256:' })
  digest!: string;

  @IsString()
  @Matches(/^\d+$/, {
    message: 'previousSequence must be a canonical decimal string',
  })
  previousSequence!: string;

  @IsString()
  @Matches(/^(GENESIS|sha256:[0-9a-f]{64})$/, {
    message: 'previousDigest must be GENESIS or a sha256: digest',
  })
  previousDigest!: string;

  @IsString()
  @IsNotEmpty()
  posBuild!: string;

  @IsString()
  @IsNotEmpty()
  assertionSchema!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

/**
 * The receipt an accepted acknowledgement returns. The same shape is returned
 * for a retry, because the server returns the receipt it already issued
 * rather than deciding again.
 */
export interface AcknowledgeStaffPolicyEpochResponseDto {
  status: 'ACCEPTED';
  receiptId: string;
  sequence: string;
  digest: string;
  floorSequence: string;
}

/**
 * A rejection body. The stable code is what a terminal acts on, so it is
 * always present and never replaced by prose.
 */
export interface AcknowledgeStaffPolicyEpochRejectionDto {
  status: 'REJECTED';
  resultCode: string;
  sequence: string;
}
