import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SecurityProfile } from './security-profile.entity';
import { UserRole } from '../security/user-role.enum';

/**
 * Canonical UserRole values live in the framework-free leaf
 * (../security/user-role.enum.ts). Re-exported here so existing imports from
 * the entity keep working while TypeORM uses it for enum column metadata.
 */
export { UserRole };

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  name: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ select: false, nullable: true })
  password_hash: string;

  @OneToOne(() => SecurityProfile, (profile) => profile.user)
  security_profile: SecurityProfile;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ default: true })
  is_active: boolean;

  @Column({ select: false, nullable: true })
  hashed_refresh_token: string;

  @Column({ default: 1, select: false })
  security_version: number;

  @Column({ type: 'uuid', nullable: true, select: false })
  refresh_token_family_id: string | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  refresh_token_revoked_at: Date | null;

  // Durable per-user PIN-attempt reset generation (migration 1809030000000;
  // design §11.2 decisions 14/20). Deliberately NOT the OHAC BIGINT_STRING
  // transformer: that Int64 guard belongs to the human-authorization evidence
  // tables, and core identity columns follow this module's plain bigint
  // convention. The non-negative CHECK (ck_users_attempt_reset_generation_non_negative)
  // stays migration-owned; entity decorators cannot declare named constraints.
  @Column({ type: 'bigint', default: 0 })
  attempt_reset_generation: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
