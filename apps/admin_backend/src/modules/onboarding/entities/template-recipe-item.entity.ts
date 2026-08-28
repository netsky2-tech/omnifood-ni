import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TemplateProduct } from './template-product.entity';

@Entity('template_recipe_items')
export class TemplateRecipeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  template_product_id: string;

  @ManyToOne(() => TemplateProduct, (p) => p.recipeItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_product_id' })
  templateProduct: TemplateProduct;

  @Column({ type: 'varchar' })
  template_insumo_name: string;

  @Column('decimal', { precision: 14, scale: 4 })
  gross_quantity: number;

  @Column('decimal', { precision: 14, scale: 4, default: 0 })
  technical_shrink_pct: number;

  @Column({ type: 'varchar' })
  component_uom: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
