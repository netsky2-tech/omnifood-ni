import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  /**
   * Stable provisioning identifier (issue #556 slice 11, OD-03): normalized
   * from `name` at creation through src/modules/tenant/tenant-slug.ts and
   * backfilled by AddTenantSlug1809350000000. Global uniqueness comes from
   * the migration's uq_tenants_slug index, not an entity decorator. The slug
   * is server-resolved pre-auth CONTEXT, never authority, and is NOT updated
   * when the display name changes.
   */
  @Column({ type: 'varchar' })
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  ruc: string | null;

  /**
   * Company identity parity P1 (odd/tasks/identidad-empresa-paridad.md):
   * nullable contact/identity columns the fiscal setup persists and the
   * fiscal config snapshot delivers to terminals. Nullable BY DESIGN (S3 —
   * absence discipline): a value never configured stays NULL and is declared
   * downstream, never defaulted to ''.
   */
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
