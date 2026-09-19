import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Maps the `forensic_alerts` table created by
 * 1766000000000-BohInventoryLedgerFoundation. The table carries a uuid
 * `tenant_id` since unit C.3's rebind (1809130000000); the schema build
 * harness's entity assertion requires an entity declaring that column uuid.
 * `forensic-alert.service.ts` writes this table with raw SQL and injects no
 * repository for it, so no `forFeature` registration exists or is needed.
 * The existing `idx_forensic_alerts_tenant_created_at` index is declared in
 * the schema and is deliberately not re-declared here.
 */
@Entity('forensic_alerts')
export class ForensicAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column()
  alert_type: string;

  @Column()
  severity: string;

  @Column({ nullable: true })
  actor_role: string | null;

  @Column()
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
