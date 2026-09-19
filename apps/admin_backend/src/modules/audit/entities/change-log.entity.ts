import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('change_log')
@Index('IDX_change_log_tenant_target', [
  'tenant_id',
  'target_type',
  'target_id',
])
@Index('IDX_change_log_tenant_created', ['tenant_id', 'created_at'])
export class ChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  user_id: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 64 })
  target_type: string;

  @Column({ type: 'uuid' })
  target_id: string;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_email: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
