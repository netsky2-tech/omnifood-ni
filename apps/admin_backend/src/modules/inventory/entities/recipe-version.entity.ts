import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Product } from './product.entity';

@Entity('recipe_versions')
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

  @CreateDateColumn()
  created_at: Date;
}
