import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Device-side redemption body for `POST /v1/sync/inbound/human-authorization/recovery/redeem`
 * (design §9). Tenant and terminal are deliberately absent: both come from
 * the authenticated device principal the transport guard attaches, so a body
 * can never redeem a token for another terminal or tenant.
 */
export class RedeemHumanAuthorizationRecoveryDto {
  /** Plaintext `ohr1.<tokenId>.<secret>`; shown once at issuance. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  /** Redemption idempotency key: same principal + key returns the receipt. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  posBuild!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  policySchema!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  assertionSchema!: string;

  /** Local integrity classification reported by the POS (design §9). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  integrityClassification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  correlationId?: string;
}

export interface RedeemHumanAuthorizationRecoveryResponseDto {
  status: 'REDEEMED' | 'REPLAYED';
  tokenId: string;
  terminalId: string;
  redeemedAt: string;
}
