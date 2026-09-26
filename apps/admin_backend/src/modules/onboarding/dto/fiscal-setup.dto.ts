import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { FiscalConfigVersion } from './fiscal-config-version.dto';
import { IsValidNicaraguaFiscalId } from '../validators/is-valid-nicaragua-fiscal-id.validator';

export enum FiscalRegime {
  CUOTA_FIJA = 'CUOTA_FIJA',
  REGIMEN_GENERAL = 'REGIMEN_GENERAL',
}

/**
 * D-21 (#554): DGI authorization rejection messages, exported so specs pin
 * the exact boundary wording.
 */
export const DGI_AUTHORIZATION_CODE_TOO_LONG_MESSAGE =
  'dgiAuthorizationCode must not exceed 50 characters';
export const DGI_AUTHORIZATION_CODE_CHARSET_MESSAGE =
  'dgiAuthorizationCode must only contain letters, digits, hyphens and slashes';
export const DGI_AUTHORIZATION_DATE_RANGE_MESSAGE =
  'dgiAuthorizationExpiresAt must be a date greater than or equal to dgiAuthorizationIssuedAt';

/**
 * D-21 (#554): DGI authorization charset — letters, digits, hyphens and
 * slashes ONLY. Intentionally NOT a structural mask: DGI's format is not
 * officially documented, so no format enforcement beyond this ceiling.
 */
export const DGI_AUTHORIZATION_CODE_PATTERN = /^[A-Za-z0-9\-/]*$/;

/**
 * Cross-field rule (D-21, #554): when both authorization dates are
 * present, expiresAt must be >= issuedAt. When either side is missing or
 * unparseable, the range comparison is skipped — each field's own
 * IsISO8601 decorator owns format rejection, so no double-reporting.
 */
@ValidatorConstraint({ name: 'dgiAuthorizationDateRange', async: false })
export class DgiAuthorizationDateRangeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string' || value === '') {
      return true;
    }
    const issuedAt = (args.object as FiscalSetupDto).dgiAuthorizationIssuedAt;
    if (typeof issuedAt !== 'string' || issuedAt === '') {
      return true;
    }
    const expiresMs = Date.parse(value);
    const issuedMs = Date.parse(issuedAt);
    if (Number.isNaN(expiresMs) || Number.isNaN(issuedMs)) {
      return true;
    }
    return expiresMs >= issuedMs;
  }

  defaultMessage(): string {
    return DGI_AUTHORIZATION_DATE_RANGE_MESSAGE;
  }
}

/**
 * D-16 symmetry (D-21, #554): the authorization dates must be clearable over
 * HTTP the same way the code is. An empty/whitespace-only string transforms
 * to null — the clear sentinel the service routes through its tombstone
 * path — so a blank date NEVER reaches IsISO8601 or the persistence layer.
 */
const blankStringToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class FiscalSetupDto {
  @IsEnum(FiscalRegime, {
    message: 'regime must be either CUOTA_FIJA or REGIMEN_GENERAL',
  })
  regime: FiscalRegime;

  @IsString()
  @MinLength(1, { message: 'businessName must not be empty' })
  businessName: string;

  @IsDefined()
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsValidNicaraguaFiscalId()
  ruc: string;

  @IsNumber()
  @Min(0, { message: 'commercialFxSpread must be greater than or equal to 0' })
  commercialFxSpread: number;

  @IsBoolean()
  pricesIncludeTax: boolean;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  /**
   * D-21 (#554): DGI authorization letter data. The authorization code has
   * NO structural mask — DGI's format is not officially documented (e.g.
   * 'DGI-SFC-2024-00123', 'RES-SFC-145/2025') — only a charset + length
   * ceiling. An empty string is accepted at the boundary so the service's
   * clear path (superseding null tombstone) is reachable from HTTP.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: DGI_AUTHORIZATION_CODE_TOO_LONG_MESSAGE })
  @Matches(DGI_AUTHORIZATION_CODE_PATTERN, {
    message: DGI_AUTHORIZATION_CODE_CHARSET_MESSAGE,
  })
  dgiAuthorizationCode?: string;

  @Transform(blankStringToNull)
  @IsOptional()
  @IsISO8601(
    {},
    {
      message: 'dgiAuthorizationIssuedAt must be a valid ISO-8601 date string',
    },
  )
  dgiAuthorizationIssuedAt?: string | null;

  @Transform(blankStringToNull)
  @IsOptional()
  @IsISO8601(
    {},
    {
      message: 'dgiAuthorizationExpiresAt must be a valid ISO-8601 date string',
    },
  )
  @Validate(DgiAuthorizationDateRangeConstraint)
  dgiAuthorizationExpiresAt?: string | null;
}

export interface FiscalSetupResponse {
  tenantId: string;
  businessName: string;
  ruc: string | null;
  regime: FiscalRegime;
  taxRateIva: number;
  pricesIncludeTax: boolean;
  commercialFxSpread: number;
  /** D-21 (#554): null means no active authorization (or tombstoned/cleared). */
  dgiAuthorizationCode: string | null;
  dgiAuthorizationIssuedAt: string | null;
  dgiAuthorizationExpiresAt: string | null;
  configVersion?: FiscalConfigVersion;
  configuredAt?: Date;
}
