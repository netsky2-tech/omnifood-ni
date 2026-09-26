import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DeviceLinkingCodeStatus {
  ACTIVE = 'ACTIVE',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

/**
 * A single-use, short-expiry pre-auth device linking code (issue #556
 * stage 3, founder design).
 *
 * The dashboard generates the code (human-auth, tenant-bound, plaintext
 * returned exactly once); the POS exchanges it pre-login for the tenant
 * binding (tenantId + persisted slug). Only the bcrypt hash is stored: the
 * plaintext is never persisted, exactly like device renewal secrets.
 *
 * Isolation: the table is `direct` tenant RLS (FORCE, per-command policies,
 * uuid tenant_id). The pre-auth claim path reads its bounded candidate set
 * through the reviewed transaction-local claim branch documented in migration
 * 1809360000000 (founder approval 2026-09-24) — the slug stays pre-auth
 * context, never authority.
 */
@Entity({ name: 'device_linking_codes' })
@Index('idx_device_linking_codes_tenant_status', ['tenantId', 'status'])
@Index('idx_device_linking_codes_expires_at', ['expiresAt'])
export class DeviceLinkingCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 255 })
  codeHash!: string;

  @Column({
    type: 'varchar',
    length: 64,
    default: DeviceLinkingCodeStatus.ACTIVE,
  })
  status!: DeviceLinkingCodeStatus;

  @Column({ name: 'device_id', type: 'varchar', length: 128, nullable: true })
  deviceId!: string | null;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 128 })
  createdByUserId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
