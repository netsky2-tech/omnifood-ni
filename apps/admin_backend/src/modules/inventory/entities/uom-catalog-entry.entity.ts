import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Platform-global units-of-measure catalog (Zona A, S1/S2). Protocol data —
 * NOT tenant-administrable: dimensions, anchors and the container/serving
 * semantics are fixed by the application contract. Seeded from the
 * UOM_CATALOG constant by migration 1809850000000; the constant is the
 * single source of truth, the table is its queryable projection.
 *
 * Universal units carry factor_to_anchor (mass → g, volume → ml,
 * count → unidad). Container/serving units carry NULL: converting them to a
 * physical unit is per-insumo business data (the insumo's conversionFactor),
 * never a platform constant.
 */
@Entity('uom_catalog')
export class UomCatalogEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  dimension: string;

  @Column('numeric', { precision: 18, scale: 8, nullable: true })
  factor_to_anchor: number | null;

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  aliases: string[];

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
