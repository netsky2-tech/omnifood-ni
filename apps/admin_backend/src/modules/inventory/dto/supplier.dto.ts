import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true || value === 1 || value === '1') return true;
  if (value === 'false' || value === false || value === 0 || value === '0') return false;
  return value;
};

/**
 * Human supplier creation (owner dashboard, SOHO purchases).
 *
 * Mirrors the writable columns of the `Supplier` entity: only `name` is
 * required; phone, contact person and credit terms are optional context.
 * Tenant binding is NOT a body field — it always comes from the
 * authenticated human session via GetTenantId in the controller.
 */
export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  name: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  creditTerms?: string;
}

/**
 * Human supplier update (owner dashboard, SOHO purchases).
 * Allows modifying contact information and activating/deactivating the supplier.
 */
export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  creditTerms?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(toBoolean)
  isActive?: boolean;
}

export class ListSuppliersQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(toBoolean)
  includeInactive?: boolean;
}
