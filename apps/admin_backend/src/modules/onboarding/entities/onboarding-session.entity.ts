import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

export enum OnboardingLifecycleState {
  PROVISIONED = 'PROVISIONED',
  SETUP_IN_PROGRESS = 'SETUP_IN_PROGRESS',
  SALE_READY = 'SALE_READY',
  ACTIVATION_IN_PROGRESS = 'ACTIVATION_IN_PROGRESS',
  ACTIVATED = 'ACTIVATED',
}

@Entity({ name: 'onboarding_sessions' })
@Unique(['tenantId'])
export class OnboardingSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  @Index('idx_onboarding_sessions_tenant_id')
  tenantId!: string;

  @Column({
    name: 'lifecycle_state',
    type: 'varchar',
    length: 64,
    default: OnboardingLifecycleState.PROVISIONED,
  })
  lifecycleState!: OnboardingLifecycleState;

  @Column({
    name: 'onboarding_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  onboardingStartedAt!: Date | null;

  @Column({
    name: 'sale_ready_first_at',
    type: 'timestamptz',
    nullable: true,
  })
  saleReadyFirstAt!: Date | null;

  @Column({
    name: 'activation_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  activationStartedAt!: Date | null;

  @Column({
    name: 'activated_at',
    type: 'timestamptz',
    nullable: true,
  })
  activatedAt!: Date | null;

  @Column({
    name: 'first_successful_sale_at',
    type: 'timestamptz',
    nullable: true,
  })
  firstSuccessfulSaleAt!: Date | null;

  @Column({
    name: 'first_customer_sale_at',
    type: 'timestamptz',
    nullable: true,
  })
  firstCustomerSaleAt!: Date | null;

  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastActivityAt!: Date | null;

  @Column({
    name: 'current_activation_attempt_id',
    type: 'uuid',
    nullable: true,
  })
  currentActivationAttemptId!: string | null;

  @Column({
    name: 'measurement_eligible',
    type: 'boolean',
    default: true,
  })
  measurementEligible!: boolean;

  @Column({
    name: 'legacy_baseline',
    type: 'boolean',
    default: false,
  })
  legacyBaseline!: boolean;

  @Column({
    name: 'optimistic_version',
    type: 'int',
    default: 1,
  })
  optimisticVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
