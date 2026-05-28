import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_integrity_alerts')
@Index(
  'uq_audit_integrity_alert_signature',
  ['tenant_id', 'device_id', 'user_id', 'signature'],
  {
    unique: true,
  },
)
export class AuditIntegrityAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @Column()
  device_id: string;

  @Column()
  user_id: string;

  @Column({ type: 'integer' })
  gap_start: number;

  @Column({ type: 'integer' })
  gap_end: number;

  @Column()
  signature: string;

  @Column({ type: 'timestamptz' })
  first_detected_at: Date;

  @Column({ type: 'timestamptz' })
  last_seen_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
