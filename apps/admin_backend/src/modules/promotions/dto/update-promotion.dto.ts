import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
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

  @IsOptional()
  @IsString()
  target_category_id?: string;

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
