import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IndustryTemplate } from './industry-template.entity';
import {
  NEGATIVE_STOCK_POLICY,
  NegativeStockPolicy,
} from '../../inventory/entities/insumo.entity';

@Entity('template_insumos')
export class TemplateInsumo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  template_id: string;

  @ManyToOne(() => IndustryTemplate, (t) => t.templateInsumos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: IndustryTemplate;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  purchase_uom: string;

  @Column({ type: 'varchar' })
  consumption_uom: string;

  @Column('decimal', { precision: 12, scale: 4, default: 1 })
  conversion_factor: number;

  @Column('decimal', { precision: 14, scale: 4, nullable: true })
  par_level: number | null;

  @Column('decimal', { precision: 14, scale: 4, nullable: true })
  min_stock: number | null;

  @Column({ type: 'boolean', default: false })
  is_perishable: boolean;

  @Column({
    type: 'varchar',
    default: NEGATIVE_STOCK_POLICY.RESTRICT,
  })
  negative_stock_policy: NegativeStockPolicy;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
