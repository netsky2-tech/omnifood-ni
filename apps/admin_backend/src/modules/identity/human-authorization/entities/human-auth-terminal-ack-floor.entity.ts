import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';

// One mutable compare-and-set row per terminal, keyed (tenant_id, terminal_id).
// Monotonicity and no-delete guards live in the migration triggers.
@Entity({ name: 'human_auth_terminal_ack_floor' })
export class HumanAuthTerminalAckFloor {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
  @PrimaryColumn({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;
  @Column({ name: 'sequence', type: 'bigint', transformer: BIGINT_STRING })
  sequence!: string;
  @Column({ name: 'digest', type: 'varchar', length: 71 })
  digest!: string;
  @Column({
    name: 'revision',
    type: 'bigint',
    default: 1,
    transformer: BIGINT_STRING,
  })
  revision!: string;
  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;
}
