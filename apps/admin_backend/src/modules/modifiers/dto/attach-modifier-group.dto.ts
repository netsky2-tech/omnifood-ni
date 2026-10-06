import { IsInt, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * Attach a modifier group to a product CATEGORY (a `catalog_values` row of
 * type SALES_PRODUCT_CATEGORY). The service additionally validates the
 * catalog type inside the tenant transaction (promotions
 * assertValidTargetCategory doctrine: one message for
 * nonexistent/foreign-tenant/wrong-type ids — no cross-tenant existence
 * oracle). Attach is idempotent.
 */
export class AttachCategoryDto {
  @IsNotEmpty()
  @IsUUID()
  catalog_value_id: string;

  @IsOptional()
  @IsInt()
  sort_order?: number = 0;
}

/**
 * Attach a modifier group to a single PRODUCT. The service validates the
 * product exists in this tenant, inside the tenant transaction. Attach is
 * idempotent.
 */
export class AttachProductDto {
  @IsNotEmpty()
  @IsUUID()
  product_id: string;

  @IsOptional()
  @IsInt()
  sort_order?: number = 0;
}
