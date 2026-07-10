import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('production_batch_history')
@Index(
  'uq_production_batch_history_document',
  ['tenant_id', 'production_document_id'],
  {
    unique: true,
  },
)
export class ProductionBatchHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @Column()
  production_document_id: string;

  @Column()
  recipe_version_id: string;

  @Column()
  produced_insumo_id: string;

  @Column()
  produced_batch_number: string;

  @Column({ type: 'date' })
  produced_expiration_date: Date;

  @Column('decimal', { precision: 14, scale: 4 })
  planned_quantity: number;

  @Column('decimal', { precision: 14, scale: 4 })
  actual_quantity: number;

  @Column()
  outcome: string;

  @Column({ nullable: true })
  failure_reason: string | null;

  @Column()
  terminal_id: string;

  @Column('bigint')
  source_sequence: string;

  @Column()
  idempotency_key: string;

  @Column()
  payload_hash: string;

  @Column('decimal', { precision: 14, scale: 4 })
  total_consumed_cost_nio: number;

  @Column('decimal', { precision: 14, scale: 4 })
  produced_unit_cost_nio: number;

  @Column('text', { array: true, default: '{}' })
  movement_references: string[];

  @Column({ type: 'timestamp' })
  operation_date: Date;

  @CreateDateColumn()
  created_at: Date;
}
