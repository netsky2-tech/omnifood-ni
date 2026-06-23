import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CatalogType } from '../catalog-type';

/**
 * Tenant-administrable master catalog value.
 *
 * One row per catalog entry (e.g. one UOM, one inventory category, one sales
 * product type). The `catalog_type` discriminator is a protocol invariant
 * (see catalog-type.ts); `code` is the stable tenant-unique key used by the
 * POS to reference a value, `name` maps to the persisted `label` shown in the
 * UI.
 *
 * Soft-delete via `is_active` instead of row deletion, to preserve referential
 * integrity of historical documents that reference a catalog `code`.
 */
@Entity('catalog_values')
@Unique('UQ_catalog_tenant_type_code', ['tenant_id', 'catalog_type', 'code'])
@Index('IDX_catalog_tenant_type_active', [
  'tenant_id',
  'catalog_type',
  'is_active',
])
export class CatalogValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', name: 'catalog_type' })
  catalog_type: CatalogType;

  @Column({ type: 'varchar' })
  code: string;

  @Column({ type: 'varchar', name: 'label' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
