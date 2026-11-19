import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Opaque, revocable tenant-scoped install token for the POS Install Kit
 * (issue #958). Only the SHA-256 hex digest (`tokenHash`) and an 8-character
 * display prefix (`tokenPrefix`) are persisted; plaintext tokens are returned
 * once on creation and never stored.
 */
@Entity({ name: 'install_tokens' })
@Index('idx_install_tokens_tenant_created_at', ['tenantId', 'createdAt'])
export class InstallToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'token_prefix', type: 'varchar', length: 12 })
  tokenPrefix!: string;

  @Column({ name: 'label', type: 'varchar', length: 80, nullable: true })
  label!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'use_count', type: 'integer', default: 0 })
  useCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
