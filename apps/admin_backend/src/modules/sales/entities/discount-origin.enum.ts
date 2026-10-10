/**
 * Categorical origin of a per-line discount (D-A2): records WHY an
 * `invoice_items.discount` amount exists so the owner can tell a manual
 * discount from a promotion or a loyalty redemption.
 *
 * These values are the SOURCE OF THE KEYS of the per-line amounts breakdown
 * (`DiscountOriginBreakdown` below and `invoice_items.discount_origin`, a
 * nullable jsonb column): a line can be discounted by MORE THAN ONE origin
 * at once, so a single categorical value cannot express the provenance and
 * was replaced by the breakdown
 * (1809630000000-ReplaceDiscountOriginWithBreakdown). The database CHECK
 * constraint `chk_invoice_items_discount_origin_breakdown` enforces that
 * every key of the stored object is one of these values.
 *
 * NULL (absent breakdown) means legacy/unknown — rows written before
 * provenance existed, and lines with no discount at all — and no origin or
 * amount may ever be fabricated for them (no backfill, same rule as
 * `shift_id`/D-9 and `recipe_version_id`/1769000000000).
 *
 * NAMING: the values are lowercase and the type is named `DiscountOrigin`
 * (not `Origin`) on purpose: `customer_point_transactions.origin` already
 * means `POS` | `CLOUD` (where a transaction was ingested), which answers a
 * different question.
 */
export enum DiscountOrigin {
  MANUAL = 'manual',
  PROMOTION = 'promotion',
  LOYALTY = 'loyalty',
}

/**
 * Per-origin AMOUNTS breakdown of a line discount (D-A2): e.g.
 * `{ [DiscountOrigin.MANUAL]: 5, [DiscountOrigin.PROMOTION]: 10 }` — a
 * promotion on the item PLUS a manual discount on the order, each with the
 * amount it contributed.
 *
 * Stored as `invoice_items.discount_origin` (nullable jsonb). Only origins
 * with a NON-ZERO amount are present. NULL means legacy/unknown and is never
 * fabricated. A jsonb column was chosen over a child table ON PURPOSE: a new
 * table would need its own entry in this schema's RLS coverage ratchet
 * (`apps/admin_backend/scripts/schema-rls-coverage-manifest.txt`) with its
 * own policies and immutability wiring — too much surface for three fixed
 * amounts. The DB-level whitelist the old enum type provided lives in the
 * `chk_invoice_items_discount_origin_breakdown` CHECK constraint instead
 * (keys ⊆ `DiscountOrigin`, values positive numbers).
 */
export type DiscountOriginBreakdown = Partial<Record<DiscountOrigin, number>>;
