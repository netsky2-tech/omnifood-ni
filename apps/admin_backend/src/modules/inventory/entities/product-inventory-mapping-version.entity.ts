import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { Insumo } from './insumo.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('product_inventory_mapping_versions')
@Index('uq_product_inventory_active_mapping', ['tenant_id', 'product_id'], {
  unique: true,
  where: 'superseded_at IS NULL',
})
export class ProductInventoryMappingVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'uuid' })
  insumo_id: string;

  @ManyToOne(() => Insumo)
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  effective_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  superseded_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
