import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { User } from './user.entity';

@Entity('audit_logs')
@Index(
  'uq_audit_stream_sequence_active',
  ['tenant_id', 'device_id', 'user_id', 'sequence_no'],
  {
    unique: true,
    where: `forensic_status = 'ACTIVE'`,
  },
)
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

  @Column()
  sequence_no: number;

  @Column()
  prev_hash: string;

  @Column()
  entry_hash: string;

  @Column({ nullable: true })
  metodo_autorizacion: string;

  @Column({ nullable: true })
  usuario_autorizador_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ default: 'ACTIVE' })
  forensic_status: string;
}
