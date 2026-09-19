import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Lifecycle transition, terminal-status, and no-delete guards live in the
// migration triggers; `EXPIRED` is derived from `expires_at` and never stored.
@Entity({ name: 'human_auth_recovery_tokens' })
@Index('uq_human_auth_recovery_tokens_hmac', ['tenantId', 'secretHmac'], {
  unique: true,
})
@Index('idx_human_auth_recovery_tokens_tenant_terminal', [
  'tenantId',
  'terminalId',
])
@Index('idx_human_auth_recovery_tokens_expiry', ['status', 'expiresAt'])
export class HumanAuthRecoveryToken {
  @PrimaryGeneratedColumn('uuid', { name: 'token_id' })
  tokenId!: string;
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
  @Column({ name: 'terminal_id', type: 'varchar', length: 128 })
  terminalId!: string;
  @Column({ name: 'secret_hmac', type: 'varchar', length: 64 })
  secretHmac!: string;
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ISSUED' })
  status!: string;
  @Column({ name: 'issued_by_user_id', type: 'uuid' })
  issuedByUserId!: string;
  @Column({ name: 'issuance_reason', type: 'varchar', length: 255 })
  issuanceReason!: string;
  @Column({
    name: 'issued_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  issuedAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
  @Column({ name: 'revoked_by_user_id', type: 'uuid', nullable: true })
  revokedByUserId!: string | null;
  @Column({
    name: 'revocation_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  revocationReason!: string | null;
  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt!: Date | null;
  @Column({ name: 'redemption_credential_id', type: 'uuid', nullable: true })
  redemptionCredentialId!: string | null;
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  idempotencyKey!: string | null;
  @Column({
    name: 'redemption_request_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  redemptionRequestHash!: string | null;
}
