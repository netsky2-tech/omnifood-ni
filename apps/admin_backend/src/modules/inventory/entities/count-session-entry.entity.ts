import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CountSession } from './count-session.entity';

/**
 * R19 (S12) — one row per COUNTED ENTRY: the evidence of the act of counting.
 *
 * These rows are APPEND-ONLY. Evidence is not corrected in place; a recount
 * ADDS another row. That is why the RLS classification is `direct:SI` (no
 * update, no delete policy) while the mutating header carries `direct:SIUD`.
 *
 * Three line fields are FROZEN on the row on purpose (S12) — do not normalise
 * them away into a join:
 *   - `insumo_name` and `uom`, because the signed sheet must reprint
 *     IDENTICAL years later even after the insumo is renamed; the paper is a
 *     record of what the sheet said at count time, same principle as the
 *     frozen cost of the kardex.
 *   - `theoretical_quantity`, because the variance the person saw on the
 *     floor is a fact about that moment, not about today's stock.
 *
 * `actor_label`, `counted_at` and `is_disputed` are the legal core of R-05:
 * who made the count, when, and who flagged a discrepancy. Before this table
 * they were validated by the DTO and then thrown away.
 *
 * `line_id` + `line_index` + `entry_index` is the identity of the counted
 * entry inside the document (a line may carry up to 20 entries), and the
 * unique constraint on that tuple is the per-row guard behind the session
 * idempotency (S13).
 */
@Entity('count_session_entries')
export class CountSessionEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'session_id', type: 'varchar' })
  session_id: string;

  @ManyToOne(() => CountSession)
  @JoinColumn({ name: 'session_id' })
  session: CountSession;

  @Column({ name: 'insumo_id', type: 'uuid' })
  insumo_id: string;

  /** FROZEN (S12): the name as the signed sheet printed it. */
  @Column({ name: 'insumo_name', type: 'varchar' })
  insumo_name: string;

  /** FROZEN (S12): the uom as the signed sheet printed it. */
  @Column({ type: 'varchar' })
  uom: string;

  /** FROZEN (S12): the theoretical quantity the counter saw. */
  @Column({
    name: 'theoretical_quantity',
    type: 'decimal',
    precision: 14,
    scale: 4,
  })
  theoretical_quantity: number;

  @Column({ name: 'line_id', type: 'varchar' })
  line_id: string;

  @Column({ name: 'line_index', type: 'integer' })
  line_index: number;

  @Column({ name: 'entry_index', type: 'integer' })
  entry_index: number;

  @Column({
    name: 'counted_quantity',
    type: 'decimal',
    precision: 14,
    scale: 4,
  })
  counted_quantity: number;

  @Column({ name: 'counted_at', type: 'timestamptz', nullable: true })
  counted_at: Date | null;

  @Column({ name: 'actor_label', type: 'varchar', nullable: true })
  actor_label: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ name: 'is_disputed', type: 'boolean' })
  is_disputed: boolean;

  @Column({ name: 'is_approved', type: 'boolean' })
  is_approved: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
