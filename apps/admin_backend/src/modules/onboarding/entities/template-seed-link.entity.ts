import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateSourceItemType {
  PRODUCT = 'PRODUCT',
  INGREDIENT = 'INGREDIENT',
  RECIPE = 'RECIPE',
}

export enum TemplateTargetEntityType {
  PRODUCT = 'PRODUCT',
  INSUMO = 'INSUMO',
  RECIPE_VERSION = 'RECIPE_VERSION',
}

@Entity('onboarding_template_seed_links')
@Index(
  'uq_template_seed_links_provenance',
  ['tenant_id', 'template_code', 'source_item_id', 'target_entity_type'],
  { unique: true },
)
@Index('idx_template_seed_links_tenant_code', ['tenant_id', 'template_code'])
export class TemplateSeedLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  tenant_id: string;

  @Column({ type: 'varchar', length: 128 })
  template_code: string;

  @Column({ type: 'varchar', length: 128 })
  source_item_id: string;

  @Column({ type: 'varchar', length: 64 })
  source_item_type: TemplateSourceItemType;

  @Column({ type: 'varchar', length: 64 })
  target_entity_type: TemplateTargetEntityType;

  @Column({ type: 'varchar', length: 128 })
  target_entity_id: string;

  @Column({ type: 'int', default: 1 })
  first_applied_version: number;

  @Column({ type: 'int', default: 1 })
  last_seen_version: number;

  @Column({ type: 'int', default: 1 })
  last_applied_version: number;

  @Column({ type: 'varchar', length: 128 })
  last_source_fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
