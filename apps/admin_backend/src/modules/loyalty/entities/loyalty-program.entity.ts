import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { RewardDefinition } from './reward-definition.entity';

export enum LoyaltyProgramType {
  SPEND_POINTS = 'SPEND_POINTS',
  PRODUCT_STAMPS = 'PRODUCT_STAMPS',
  VISIT_STAMPS = 'VISIT_STAMPS',
}

export enum LoyaltyProgramStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('loyalty_programs')
@Index('idx_loyalty_programs_tenant_status', ['tenant_id', 'status'])
export class LoyaltyProgram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({
    type: 'enum',
    enum: LoyaltyProgramType,
  })
  program_type: LoyaltyProgramType;

  @Column({
    type: 'enum',
    enum: LoyaltyProgramStatus,
    default: LoyaltyProgramStatus.DRAFT,
  })
  status: LoyaltyProgramStatus;

  @Column({ type: 'timestamptz', nullable: true })
  starts_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ends_at?: Date | null;

  @Column({ type: 'jsonb' })
  earning_rule: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  eligibility_rule: Record<string, unknown>;

  @Column({ type: 'int', default: 1 })
  config_version: number;

  @OneToMany(() => RewardDefinition, (reward) => reward.loyalty_program)
  rewards: RewardDefinition[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
