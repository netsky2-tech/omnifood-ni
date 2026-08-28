import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TemplateInsumo } from './template-insumo.entity';
import { TemplateProduct } from './template-product.entity';

@Entity('industry_templates')
export class IndustryTemplate {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', default: 'briefcase' })
  icon: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => TemplateInsumo, (insumo) => insumo.template, {
    cascade: true,
  })
  templateInsumos: TemplateInsumo[];

  @OneToMany(() => TemplateProduct, (product) => product.template, {
    cascade: true,
  })
  templateProducts: TemplateProduct[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
