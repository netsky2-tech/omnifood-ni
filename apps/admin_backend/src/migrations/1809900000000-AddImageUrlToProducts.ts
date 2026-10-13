import type { QueryRunner } from 'typeorm';

/**
 * Batch 2 (Product Images): adds nullable `image_url text` to `products` so the
 * catalog can store client-optimized (WebP 300x300 Data URL / asset URI) image
 * references.
 *
 * Safe nullable column addition; existing rows have NULL (no image, POS uses
 * typographic monogram fallback). Idempotent via IF NOT EXISTS / IF EXISTS.
 */
export class AddImageUrlToProducts1809900000000 {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE products DROP COLUMN IF EXISTS image_url',
    );
  }
}
