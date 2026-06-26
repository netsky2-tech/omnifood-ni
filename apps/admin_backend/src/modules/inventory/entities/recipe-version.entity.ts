import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Product } from './product.entity';

/**
 * Historical recipe version snapshot.
 *
 * Ingestion notes (pre-Batch 3 cleanup slice):
 * - `pos_document_id` is the POS-side document id used for idempotent
 *   ingestion (tenant + pos_document_id uniquely identifies a reposted
 *   document).
 * - `yield_quantity` + version-level `technical_shrink_pct` snapshot the
 *   gross/yield model from Slice 2.2 so the backend can recompute
 *   per-sold-unit consumption without re-fetching the POS.
 * - Recipe versions are historical/audit references (DGI): rows are never
 *   deleted. Prior active versions are only deactivated, never removed.
 */
@Entity('recipe_versions')
@Index('idx_recipe_versions_tenant_pos_doc', ['tenant_id', 'pos_document_id'], {
  unique: true,
  where: 'pos_document_id IS NOT NULL',
})
@Index('idx_recipe_versions_active_product', ['tenant_id', 'product_id'], {
  unique: true,
  where: 'is_active = true',
})
export class RecipeVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  version_number: number;

  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_inicio_vigencia: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_fin_vigencia: Date;

  /**
   * POS document id used for idempotent ingestion (tenant + pos_document_id).
   * Null for versions created internally (e.g. RecipeService.createNewVersion).
   */
  @Column({ type: 'varchar', nullable: true })
  pos_document_id: string | null;

  /** Snapshot of the product name at publish time (POS may rename later). */
  @Column({ type: 'varchar', nullable: true })
  product_name: string | null;

  /**
   * Yield produced by one batch of this version. `quantity` on each
   * RecipeDetail is normalized to per-sold-unit consumption
   * (gross * (1 - shrink) / yield).
   */
  @Column('decimal', { precision: 14, scale: 4, default: 1 })
  yield_quantity: number;

  /** Version-level technical shrink percentage (snapshot, [0, 100)). */
  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  technical_shrink_pct: number;

  /** Free-form note attached by the POS publisher. */
  @Column({ type: 'varchar', nullable: true })
  version_note: string | null;

  /** POS publish timestamp (when the version became effective on the POS). */
  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  /** POS-side creation timestamp (snapshot of document.createdAt). */
  @Column({ type: 'timestamptz', nullable: true })
  pos_created_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
