import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'terminal_install_fingerprints' })
@Unique('uq_terminal_install_fingerprints_tenant_terminal_hash', [
  'tenantId',
  'terminalId',
  'fingerprintHash',
])
@Index('idx_terminal_install_fingerprints_hash', ['fingerprintHash'])
@Index('idx_terminal_install_fingerprints_tenant_terminal', [
  'tenantId',
  'terminalId',
])
export class TerminalInstallFingerprint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;

  @Column({ name: 'fingerprint_hash', type: 'varchar', length: 128 })
  fingerprintHash!: string;

  @Column({
    name: 'first_seen_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  firstSeenAt!: Date;

  @Column({
    name: 'last_seen_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastSeenAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
