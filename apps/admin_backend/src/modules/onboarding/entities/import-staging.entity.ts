import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum ImportStagingStatus {
  PENDIENTE = 'PENDIENTE',
  VALIDO = 'VALIDO',
  ERROR = 'ERROR',
  COMMITTED = 'COMMITTED',
}

@Entity('staging_importacion_productos')
@Index('idx_staging_importacion_tenant_token', [
  'tenant_id',
  'token_sesion_importacion',
])
export class ImportStaging {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid' })
  token_sesion_importacion: string;

  // Raw fields captured directly from source file/payload
  @Column({ type: 'varchar', nullable: true })
  raw_nombre: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_sku: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_precio_venta: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_costo_insumo: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_categoria: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_porcentaje_iva: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_uom: string | null;

  @Column({ type: 'varchar', nullable: true })
  raw_stock_inicial: string | null;

  // Parsed and typed fields for atomic commit
  @Column({ type: 'varchar', nullable: true })
  parsed_nombre: string | null;

  @Column({ type: 'varchar', nullable: true })
  parsed_sku: string | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  parsed_precio_venta: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  parsed_costo_insumo: number | null;

  @Column({ type: 'varchar', nullable: true })
  parsed_categoria: string | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  parsed_porcentaje_iva: number | null;

  @Column({ type: 'varchar', nullable: true })
  parsed_uom: string | null;

  @Column('decimal', { precision: 12, scale: 4, nullable: true })
  parsed_stock_inicial: number | null;

  // Validation State
  @Column({
    type: 'varchar',
    default: ImportStagingStatus.PENDIENTE,
  })
  estado_fila: ImportStagingStatus;

  @Column({ type: 'text', nullable: true })
  mensaje_error_detalle: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
