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

  // Issue #512 T3 slice 7: the DB column is uuid
  // (1794000000000-CreateChangeLogTable.ts:11) and change_log is becoming
  // tenant-RLS protected, so the annotation must state the real type: the
  // schema build gate fails an entity whose tenant_id type disagrees with a
  // uuid built-schema column.
  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  /**
   * Logical actor ('SYSTEM', 'SYSTEM_RECONCILER', a terminal id) when no
   * human performed the change. Exactly one of user_id / actor_ref is set:
   * enforced by the change_log_actor_exactly_one CHECK (migration
   * 1809170000000-ExplicitChangeLogActor, issue #412).
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  actor_ref: string | null;

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
