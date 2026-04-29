import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { User } from './user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  action: string;

  @Column({ nullable: true })
  target_type: string;

  @Column({ nullable: true })
  target_id: string;

  @Column()
  device_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}
