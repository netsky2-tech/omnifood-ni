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

  @Column('decimal', { precision: 14, scale: 4 })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  gross_quantity: number;

  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  technical_shrink_pct: number;
}
