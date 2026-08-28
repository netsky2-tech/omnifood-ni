import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('kardex_correction')
@Index('uq_kardex_correction_lineage', ['tenant_id', 'lineageHash'], {
  unique: true,
})
@Index('idx_kardex_correction_tenant_insumo', [
  'tenant_id',
  'insumoId',
  'createdAt',
])
export class KardexCorrection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'insumo_id', type: 'uuid' })
  insumoId: string;

  @Column({ name: 'origin_movement_id', type: 'bigint' })
  originMovementId: string;

  @Column({ name: 'trigger_movement_id', type: 'bigint' })
  triggerMovementId: string;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    name: 'previous_unit_cost_nio',
  })
  previousUnitCostNio: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    name: 'recalculated_unit_cost_nio',
  })
  recalculatedUnitCostNio: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'delta_unit_cost_nio' })
  deltaUnitCostNio: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'total_delta_cost_nio' })
  totalDeltaCostNio: number;

  @Column('decimal', { precision: 14, scale: 4, name: 'affected_quantity' })
  affectedQuantity: number;

  @Column({ name: 'lineage_hash' })
  lineageHash: string;

  @Column({ name: 'authorized_by_user_id', nullable: true })
  authorizedByUserId: string | null;

  @Column({ name: 'authorized_by_role', nullable: true })
  authorizedByRole: string | null;

  @Column({ name: 'authorization_method', nullable: true })
  authorizationMethod: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
