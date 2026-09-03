import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { LoyaltyProgram } from './loyalty-program.entity';

export enum RewardType {
  DISCOUNT_AMOUNT = 'DISCOUNT_AMOUNT',
  FREE_PRODUCT = 'FREE_PRODUCT',
}

export enum RewardStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('loyalty_rewards')
@Index('idx_loyalty_rewards_program_status', [
  'tenant_id',
  'loyalty_program_id',
  'status',
  'presentation_order',
])
export class RewardDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  loyalty_program_id: string;

  @ManyToOne(() => LoyaltyProgram, (program) => program.rewards)
  @JoinColumn({ name: 'loyalty_program_id' })
  loyalty_program: LoyaltyProgram;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'enum',
    enum: RewardType,
  })
  reward_type: RewardType;

  @Column({ type: 'int' })
  cost_units: number;

  @Column({ type: 'jsonb' })
  benefit_config: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: RewardStatus,
    default: RewardStatus.INACTIVE,
  })
  status: RewardStatus;

  @Column({ type: 'timestamptz', nullable: true })
  starts_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ends_at?: Date | null;

  @Column({ type: 'int', default: 0 })
  presentation_order: number;

  @Column({ type: 'int', default: 1 })
  config_version: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
