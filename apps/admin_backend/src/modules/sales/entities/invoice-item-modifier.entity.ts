import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InvoiceItem } from './invoice-item.entity';

@Entity('invoice_item_modifiers')
export class InvoiceItemModifier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_item_id' })
  invoiceItemId: string;

  @ManyToOne(() => InvoiceItem, (item) => item.modifiers)
  @JoinColumn({ name: 'invoice_item_id' })
  item: InvoiceItem;

  @Column()
  name: string;

  @Column('decimal', { precision: 12, scale: 2, name: 'extra_price' })
  extraPrice: number;

  // SOHO P3 (modifier quantity): how many units of this option the line
  // includes. NOT NULL with DEFAULT 1 — the factual default, not an
  // invented one: the cloud only ever accepted name and extra_price, so
  // every pre-migration row came from a single-unit modifier, which is
  // exactly what the POS's local default writes
  // (invoice_item_modifier_entity.dart:30).
  @Column('int', { default: 1 })
  quantity: number;

  // --- R28: the IDENTITY of the option and its INVENTORY effect ----------
  // The line used to carry only the modifier's NAME (free text), so neither
  // the cloud nor the audit could tell WHICH option was sold, and a
  // deviation from the recipe was invisible. These columns are the
  // DEVIATION RECORD of the line: which option, what it did to the stock
  // and with which quantity. All NULL for a line whose option is
  // price-only (and for every line written by a terminal that predates
  // R28), so nothing existing changes.

  /** The backend's option id. NULL for legacy lines. */
  @Column({ name: 'option_id', type: 'uuid', nullable: true })
  optionId: string | null;

  /** The group the option belongs to. NULL for legacy lines. */
  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  /** NONE / ADD / REMOVE / SWAP / SCALE. NULL for a price-only line. */
  @Column({ name: 'inventory_effect', type: 'varchar', length: 16, nullable: true })
  inventoryEffect: string | null;

  /** The insumo the effect acts ON: added (ADD) or substituted in (SWAP). */
  @Column({ name: 'effect_insumo_id', type: 'uuid', nullable: true })
  effectInsumoId: string | null;

  /** The insumo of the recipe component the effect affects. */
  @Column({ name: 'effect_target_insumo_id', type: 'uuid', nullable: true })
  effectTargetInsumoId: string | null;

  /** The quantity to apply per sold unit. NULL = inherited from the recipe. */
  @Column('decimal', {
    precision: 14,
    scale: 4,
    name: 'effect_quantity',
    nullable: true,
  })
  effectQuantity: number | null;

  /** The multiplier of a SCALE. */
  @Column('decimal', {
    precision: 10,
    scale: 4,
    name: 'effect_factor',
    nullable: true,
  })
  effectFactor: number | null;
}
