import { IsNotEmpty, IsOptional, IsString, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsAbsentConstraint } from './admin-credit-note.dto';

export const ADMIN_VOID_INVOICE_FORGED_AUTHORIZER =
  'ADMIN_VOID_INVOICE_FORGED_AUTHORIZER';

export class VoidAdminInvoiceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsOptional()
  reasonDetail?: string;

  /** Forged-authority tripwires: 400 with a named error when present. */
  @Validate(IsAbsentConstraint)
  authorizedByUserId?: unknown;

  @Validate(IsAbsentConstraint)
  authorizedByRole?: unknown;
}
