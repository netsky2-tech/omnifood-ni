import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ApplyTemplateDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  templateVersion?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedItemIds?: string[];

  @IsOptional()
  @IsObject()
  productPriceOverrides?: Record<string, number>;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  overrideExisting?: boolean;

  @IsOptional()
  @IsString()
  prefixSku?: string;
}

export interface TemplateSummaryResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  insumoCount: number;
  productCount: number;
}

export interface ApplyTemplateResult {
  tenantId: string;
  templateCode: string;
  templateVersion?: number;
  applicationId?: string;
  insumosCreated: number;
  insumosSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  recipesCreated: number;
}
