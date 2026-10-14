import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

/**
 * R19 (S11/S12) — the persisted header of a physical count session.
 *
 * Until this table existed the cloud kept only the ACCOUNTING effect of a
 * count (the variance movement), never the document itself: who counted,
 * when, and against which warehouse/cutoff. Without the persisted document
 * the system cannot produce the signed year-end lists the Reglamento (Decreto
 * 01-2013, art. 33) requires — `R-05` "listas originales firmadas y fechadas
 * en cada hoja por las personas que hicieron el recuento físico" — nor the
 * records kept at the Administration's disposal (`R-06`).
 *
 * `id` is the id the POS document carries (dto `CountSessionDocumentDto.id`)
 * and is the same string the variance movement stores as `source_document_id`
 * (`sourceDocumentId = sessionId`, S13) — the same idempotency key, one
 * document, one ledger effect. `varchar`, not uuid, mirrors the DTO contract
 * (`IsString`) and the precedent of inventory_purchase_documents, whose
 * client-minted ids are likewise the primary key.
 *
 * The header MUTATES (status moves through its lifecycle), so the RLS
 * classification is the full `direct:SIUD`; the append-only entries live in
 * count_session_entries.
 */
@Entity('count_sessions')
export class CountSession {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'warehouse_id', type: 'varchar' })
  warehouse_id: string;

  @Column({ name: 'warehouse_name', type: 'varchar' })
  warehouse_name: string;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ name: 'cutoff_at', type: 'timestamptz' })
  cutoff_at: Date;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  posted_at: Date | null;

  // The movement ids this session already produced, as sent by the POS, so a
  // reprint can show what the count became without joining the ledger.
  @Column({ name: 'movement_references', type: 'jsonb', nullable: true })
  movement_references: string[] | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
