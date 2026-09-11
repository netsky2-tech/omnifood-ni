import { IsUUID, IsString, IsNotEmpty } from 'class-validator';

export class SaleInventoryRemediationDto {
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @IsUUID()
  @IsNotEmpty()
  recipeVersionId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}
