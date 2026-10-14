import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Insumo } from './insumo.entity';

/**
 * S9 (L33) — the client's own market price for an insumo, with its date.
 *
 * R-01 (Ley 822 art. 44) values inventory at the lower of acquisition cost or
 * MARKET PRICE. This table is what makes the second half of that rule possible:
 * until it existed, the system only knew its own costs, so any "market value"
 * comparison was an approximation by necessity.
 *
 * These rows are the CLIENT's datum, not a system derivation: `source_note`
 * records where the price came from, and the date is the client's own. That is
 * exactly why a writedown that resolves its reference here does NOT have to
 * declare a fallback — the declaration exists for the case where this table has
 * nothing to say for the period.
 *
 * A series and not two columns on `insumos`: the reference is "the most recent
 * price NOT LATER than the closing date", so history is what makes a past
 * period explainable after a newer price arrives.
 */
@Entity('insumo_market_prices')
export class InsumoMarketPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  insumo_id: string;

  @ManyToOne(() => Insumo)
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo;

  @Column('decimal', { precision: 14, scale: 4, name: 'market_price_nio' })
  market_price_nio: number;

  // A calendar day, never an instant: the column is a PostgreSQL `date` and
  // this IS the date the reference gets resolved against, so a 1-day shift
  // would silently select the wrong price for a period. See
  // src/core/database/calendar-day.ts before changing this back to `Date`.
  @Column({ type: 'date', name: 'effective_date' })
  effective_date: string;

  @Column({ nullable: true, name: 'source_note' })
  source_note: string | null;

  @Column({ nullable: true, name: 'created_by_user_id' })
  created_by_user_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
