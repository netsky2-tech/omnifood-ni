import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApplyTemplateDto {
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
  insumosCreated: number;
  insumosSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  recipesCreated: number;
}
