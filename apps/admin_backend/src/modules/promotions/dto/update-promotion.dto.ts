import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
} from 'class-validator';
import { PromotionType } from '../entities/promotion.entity';

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(PromotionType)
  type?: PromotionType;

  @IsOptional()
  @IsString()
  target_product_id?: string;

  // T0.5'a: a uuid referencing catalog_values(tenant_id, id); the service
  // additionally requires it to be a SALES_PRODUCT_CATEGORY row of the
  // caller's tenant. T0.5'd: an explicit JSON null is also accepted and
  // means "clear to global" (the column is set to NULL); an empty string
  // is still rejected by the service guard.
  @IsOptional()
  @IsUUID()
  target_category_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  buy_quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  get_quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_amount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  days_of_week?: string[];

  @IsOptional()
  @IsString()
  start_time?: string;

  @IsOptional()
  @IsString()
  end_time?: string;

  @IsOptional()
  @IsInt()
  start_date?: number;

  @IsOptional()
  @IsInt()
  end_date?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  is_stackable?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
