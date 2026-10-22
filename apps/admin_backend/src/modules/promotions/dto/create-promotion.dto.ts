import {
  IsNotEmpty,
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

export class CreatePromotionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEnum(PromotionType)
  type: PromotionType;

  @IsOptional()
  @IsString()
  target_product_id?: string;

  // T0.5'a: a uuid referencing catalog_values(tenant_id, id); the service
  // additionally requires it to be a SALES_PRODUCT_CATEGORY row of the
  // caller's tenant. Optional: NULL keeps its POS-engine meaning of a
  // GLOBAL promotion. T0.5'd: an explicit JSON null is also accepted and
  // means "no category target" (global on create, clear on update); an
  // empty string is still rejected by the service guard.
  @IsOptional()
  @IsUUID()
  target_category_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  buy_quantity?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  get_quantity?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_amount?: number = 0;

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
  priority?: number = 0;

  @IsOptional()
  @IsBoolean()
  is_stackable?: boolean = true;

  // Código corto de referencia interna del convenio/promoción (ej. "CONV-A").
  // Único por tenant. Opcional: si no se envía, la promoción no tiene código.
  @IsOptional()
  @IsString()
  code?: string | null;

  // FK opcional al Customer al que aplica este convenio. NULL = promoción global.
  @IsOptional()
  @IsUUID()
  target_customer_id?: string | null;

  // Tipo de restricción: 'global' (aplica a cualquier cliente) o 'customer'
  // (aplica solo al target_customer_id). Opcional, default 'global'.
  @IsOptional()
  @IsString()
  restriction_type?: 'global' | 'customer' | null;
}
