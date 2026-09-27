import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { IndustryTemplate } from './industry-template.entity';
import { TemplateRecipeItem } from './template-recipe-item.entity';
import { ProductType } from '../../inventory/entities/product.entity';

@Entity('template_products')
export class TemplateProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  template_id: string;

  @ManyToOne(() => IndustryTemplate, (t) => t.templateProducts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: IndustryTemplate;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', default: 'General' })
  category: string;

  @Column({ type: 'varchar', default: 'UN' })
  uom: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  suggested_price: number;

  @Column({ type: 'boolean', default: false })
  is_perishable: boolean;

  /**
   * #523 T1: declared product type for the template row.
   *
   * Nullable ON PURPOSE — both in TypeScript and in the physical column
   * (migration 1809500000000 adds a nullable varchar with NO default):
   * "absent" must stay distinguishable from "explicitly SIMPLE". Rows whose
   * type was never declared (legacy rows before the backfill, or rows
   * inserted by synchronize-built schemas) resolve at apply time from the
   * row's own shape and never crash; a row that explicitly declares SIMPLE
   * while carrying recipe items is a genuine contradiction that
   * applyTemplate surfaces instead of silently downgrading.
   */
  @Column({ type: 'varchar', nullable: true })
  product_type?: ProductType;

  @OneToMany(() => TemplateRecipeItem, (item) => item.templateProduct, {
    cascade: true,
  })
  recipeItems: TemplateRecipeItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
