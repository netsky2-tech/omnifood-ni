import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';

// Partial unique indexes `uq_human_auth_ack_history_accepted_sequence` and
// `uq_human_auth_ack_history_idempotency` carry the predicate
// `WHERE status = 'ACCEPTED'` and are declared only in the migration:
// TypeORM cannot express partial indexes declaratively.
@Entity({ name: 'human_auth_terminal_ack_history' })
// The migration owns the `received_at DESC` ordering of this index.
@Index('idx_human_auth_ack_history_terminal_received', [
  'tenantId',
  'terminalId',
  'receivedAt',
])
export class HumanAuthTerminalAckHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  tenantId!: string;
  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;
  @Column({ name: 'sequence', type: 'bigint', transformer: BIGINT_STRING })
  sequence!: string;
  @Column({
    name: 'previous_sequence',
    type: 'bigint',
    transformer: BIGINT_STRING,
  })
  previousSequence!: string;
  @Column({ name: 'digest', type: 'varchar', length: 71 })
  digest!: string;
  @Column({ name: 'previous_digest', type: 'varchar', length: 71 })
  previousDigest!: string;
  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string;
  @Column({ name: 'result_code', type: 'varchar', length: 64, nullable: true })
  resultCode!: string | null;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 128 })
  requestHash!: string;
  @Column({ name: 'pos_build', type: 'varchar', length: 128 })
  posBuild!: string;
  @Column({ name: 'assertion_schema', type: 'varchar', length: 128 })
  assertionSchema!: string;
  @Column({ name: 'ack_receipt_id', type: 'uuid', nullable: true })
  ackReceiptId!: string | null;
  @Column({
    name: 'server_floor_sequence',
    type: 'bigint',
    nullable: true,
    transformer: BIGINT_STRING,
  })
  serverFloorSequence!: string | null;
  @Column({
    name: 'server_build',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  serverBuild!: string | null;
  @Column({
    name: 'received_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  receivedAt!: Date;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;
}
