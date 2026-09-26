import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { REFUND_REASON_POLICY, RefundReasonPolicy } from './sync-invoice.dto';

/**
 * B1c-2 slice A (D-14, #553 part 2): human-shaped DTO for Backoffice
 * credit-note issuance. This is a different transport from the device sync
 * path: a human JWT principal authorizes, so the authorizer identity is
 * NEVER accepted from the request body.
 */

/** Named rejection for forged-authority attempts (ratified: reject, never ignore). */
export const ADMIN_CREDIT_NOTE_FORGED_AUTHORIZER =
  'ADMIN_CREDIT_NOTE_FORGED_AUTHORIZER';

/**
 * Rejects any present value. The authorizer identity is derived from the
 * JWT principal server-side; a body carrying it is a forged-authority
 * attempt and must surface as a named 400, not a silently ignored field.
 */
@ValidatorConstraint({ name: 'isAbsent', async: false })
export class IsAbsentConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${ADMIN_CREDIT_NOTE_FORGED_AUTHORIZER}: ${args.property} is derived from the authenticated principal and must never be sent in the request body`;
  }
}

export class CreateAdminCreditNoteItemDto {
  @IsUUID()
  originInvoiceItemId!: string;

  /** Positive refund quantity; the server applies the credit-note sign. */
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class CreateAdminCreditNoteDto {
  @IsUUID()
  originInvoiceId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  refundReasonCode!: string;

  /** Same policy vocabulary as the device sync path (D-14/#525). */
  @IsEnum(REFUND_REASON_POLICY)
  refundReasonPolicy!: RefundReasonPolicy;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAdminCreditNoteItemDto)
  items!: CreateAdminCreditNoteItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  /** Forged-authority tripwires: 400 with a named error when present. */
  @Validate(IsAbsentConstraint)
  authorizedByUserId?: unknown;

  @Validate(IsAbsentConstraint)
  authorizedByRole?: unknown;
}
