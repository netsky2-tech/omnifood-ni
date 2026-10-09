/**
 * Categorical origin of a per-line discount (D-A2): records WHY an
 * `invoice_items.discount` amount exists so the owner can tell a manual
 * discount from a promotion or a loyalty redemption.
 *
 * NULL means legacy/unknown — rows written before this column existed, and
 * lines with no discount at all — and no origin may ever be fabricated for
 * them (no backfill, same rule as `shift_id`/D-9 and
 * `recipe_version_id`/1769000000000).
 *
 * NAMING: the values are lowercase and the type is named `DiscountOrigin`
 * (not `Origin`) on purpose: `customer_point_transactions.origin` already
 * means `POS` | `CLOUD` (where a transaction was ingested), which answers a
 * different question. The PostgreSQL type follows the schema-wide
 * `<table>_<column>_enum` convention (`invoice_items_discount_origin_enum`),
 * the name TypeORM derives when an entity enum column sets no `enumName`.
 */
export enum DiscountOrigin {
  MANUAL = 'manual',
  PROMOTION = 'promotion',
  LOYALTY = 'loyalty',
}
