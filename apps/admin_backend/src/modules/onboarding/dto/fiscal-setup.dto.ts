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
  Max,
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
 * BXW-007 U1: POS canon vocabulary (apps/pos_app TenantOperationMode) for the
 * tenant's operation mode. The POS default is FOODPARK_QSR.
 */
export enum TenantOperationMode {
  FOODPARK_QSR = 'FOODPARK_QSR',
  RESTAURANT = 'RESTAURANT',
  HYBRID = 'HYBRID',
}

/**
 * BXW-007 U1: POS canon vocabulary (checkout_fx_mode) for the checkout FX
 * source. The POS default is COMMERCIAL.
 */
export enum CheckoutFxMode {
  COMMERCIAL = 'COMMERCIAL',
  BCN_OFFICIAL = 'BCN_OFFICIAL',
}

export function readTenantOperationModeOrNull(
  raw: unknown,
): TenantOperationMode | null {
  return (Object.values(TenantOperationMode) as string[]).includes(
    raw as string,
  )
    ? (raw as TenantOperationMode)
    : null;
}

export function readCheckoutFxModeOrNull(raw: unknown): CheckoutFxMode | null {
  return (Object.values(CheckoutFxMode) as string[]).includes(raw as string)
    ? (raw as CheckoutFxMode)
    : null;
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
  // Issue #75: the commercial FX spread is a C$ per USD exchange rate, not a
  // percentage spread — a value below 10 or above 100 is a data-entry error
  // (or the old dangerous 0.5 default leaking through). Strict 10..100 range,
  // matching the service-level guard and the POS/dashboard validators.
  @Min(10, {
    message: 'commercialFxSpread must be greater than or equal to 10',
  })
  @Max(100, {
    message: 'commercialFxSpread must be less than or equal to 100',
  })
  commercialFxSpread: number;

  @IsBoolean()
  pricesIncludeTax: boolean;

  /**
   * BXW-007 U1 rev 2: Business Profile operation mode — POS canon vocabulary.
   * OPTIONAL: absence asserts nothing and leaves the persisted parameter
   * untouched (D-16/D-21 spirit); an explicit null is the clear sentinel; an
   * invalid value is still rejected at the boundary.
   */
  @IsOptional()
  @IsEnum(TenantOperationMode, {
    message: 'operationMode must be either FOODPARK_QSR, RESTAURANT or HYBRID',
  })
  operationMode?: TenantOperationMode | null;

  /**
   * BXW-007 U1 rev 2: checkout FX source — same optionality contract as
   * operationMode.
   */
  @IsOptional()
  @IsEnum(CheckoutFxMode, {
    message: 'checkoutFxMode must be either COMMERCIAL or BCN_OFFICIAL',
  })
  checkoutFxMode?: CheckoutFxMode | null;

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
  /** BXW-007 U1 rev 2: null = the tenant never configured it (required key, nullable value). */
  operationMode: TenantOperationMode | null;
  /** BXW-007 U1 rev 2: null = the tenant never configured it (required key, nullable value). */
  checkoutFxMode: CheckoutFxMode | null;
  /** D-21 (#554): null means no active authorization (or tombstoned/cleared). */
  dgiAuthorizationCode: string | null;
  dgiAuthorizationIssuedAt: string | null;
  dgiAuthorizationExpiresAt: string | null;
  configVersion?: FiscalConfigVersion;
  configuredAt?: Date;
}
