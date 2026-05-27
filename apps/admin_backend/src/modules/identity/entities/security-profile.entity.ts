import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { TotpSecretTransformer } from '../security/totp-secret.transformer';

@Entity('security_profiles')
export class SecurityProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  user_id: string;

  @OneToOne(() => User, (user) => user.security_profile)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true, select: false })
  pin_hash: string | null;

  @Column({ nullable: true, select: false, transformer: TotpSecretTransformer })
  totp_secret_seed: string | null;

  @Column({ default: false })
  is_totp_enabled: boolean;

  @Column({ default: true })
  is_pin_enabled: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
