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

  @OneToMany(() => TemplateRecipeItem, (item) => item.templateProduct, {
    cascade: true,
  })
  recipeItems: TemplateRecipeItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
