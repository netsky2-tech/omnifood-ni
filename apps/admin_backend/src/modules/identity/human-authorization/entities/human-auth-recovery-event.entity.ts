import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// The partial unique index `uq_human_auth_recovery_events_expiry_observed`
// carries the predicate `WHERE event_type = 'EXPIRY_OBSERVED'` and is declared
// only in the migration: TypeORM cannot express partial indexes declaratively.
@Entity({ name: 'human_auth_recovery_events' })
// The migration owns the `occurred_at DESC` ordering of this index.
@Index('idx_human_auth_recovery_events_token', [
  'tenantId',
  'tokenId',
  'occurredAt',
])
export class HumanAuthRecoveryEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;
  @Column({ name: 'token_id', type: 'uuid' })
  tokenId!: string;
  @Column({ name: 'event_type', type: 'varchar', length: 32 })
  eventType!: string;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;
  @Column({ name: 'principal_type', type: 'varchar', length: 32 })
  principalType!: string;
  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode!: string | null;
  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId!: string | null;
  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;
}
