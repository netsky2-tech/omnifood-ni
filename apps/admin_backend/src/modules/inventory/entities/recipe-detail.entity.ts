import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { RecipeVersion } from './recipe-version.entity';

@Entity('recipe_details')
export class RecipeDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  recipe_version_id: string;

  @ManyToOne(() => RecipeVersion)
  @JoinColumn({ name: 'recipe_version_id' })
  recipeVersion: RecipeVersion;

  @Column()
  insumo_id: string;

  /**
   * Per-sold-unit stock consumption of the ingredient.
   *
   * For ingested POS documents this is normalized to
   *   inventoryBase(gross_quantity, component_uom) *
   *   (1 - technical_shrink_pct / 100) / yield_quantity
   * so `BomExplosionService.explode` (quantity * orderQuantity) yields the
   * correct consumed stock in the insumo base consumption UOM. For versions
   * created via the legacy
   * `RecipeService.createNewVersion` (no yield), this holds
   *   gross_quantity * (1 - technical_shrink_pct / 100)
   * which is equivalent under an implicit yield of 1.
   */
  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  gross_quantity: number;

  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  technical_shrink_pct: number;

  /** Snapshot of the ingredient name at publish time. */
  @Column({ type: 'varchar', nullable: true })
  ingredient_name: string | null;

  /**
   * Ingredient kind as reported by the POS. POS values: `INSUMO` | `SUB_RECIPE`.
   * Ingested INSUMO components are persisted as recipe details; SUB_RECIPE
   * components are rejected in this cleanup slice (multi-level versioned BOM
   * ingestion is deferred and must not silently corrupt insumo lines).
   */
  @Column({ type: 'varchar', default: 'INSUMO' })
  ingredient_type: string;

  /** Component UOM reported by the POS (validated against the insumo base consumption UOM on ingestion). */
  @Column({ type: 'varchar', nullable: true })
  component_uom: string | null;

  /**
   * For SUB_RECIPE components, the POS references the source sub-recipe version.
   * Persisted for future multi-level BOM explosion; not consumed in this slice.
   */
  @Column({ type: 'varchar', nullable: true })
  reference_version_id: string | null;
}
