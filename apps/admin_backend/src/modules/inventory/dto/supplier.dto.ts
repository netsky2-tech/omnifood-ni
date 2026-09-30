import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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
