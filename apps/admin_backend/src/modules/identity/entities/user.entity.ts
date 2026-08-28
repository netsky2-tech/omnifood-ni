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

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
}

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
