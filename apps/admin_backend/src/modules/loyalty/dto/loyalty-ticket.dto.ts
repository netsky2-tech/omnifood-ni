import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class LoyaltyTicketLineDto {
  @IsString()
  lineId: string;

  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  merchandiseNetNioAfterAllBenefits: number;

  @IsString()
  @IsIn(['NORMAL', 'LOYALTY_REWARD'])
  source: 'NORMAL' | 'LOYALTY_REWARD';
}

export class LoyaltyTicketSnapshotDto {
  @IsString()
  tenantId: string;

  @IsString()
  branchId: string;

  @IsString()
  terminalId: string;

  @IsString()
  ticketId: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  paidAt: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoyaltyTicketLineDto)
  lines: LoyaltyTicketLineDto[];
}

export class ClassifyLegacyDto {
  @IsNumber()
  batchSize: number;
}
