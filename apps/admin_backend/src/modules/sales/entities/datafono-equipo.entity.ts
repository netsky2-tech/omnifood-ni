import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('datafonos_equipos')
@Index(['tenantId', 'terminalIdBanco'], { unique: true })
export class DatafonoEquipo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId: string;

  @Column({ length: 100 })
  nombre: string;

  @Column({ name: 'banco_adquirente', length: 50 })
  bancoAdquirente: string; // 'BAC', 'BANPRO', 'LAFISE', 'MIPOS', 'GENERIC'

  @Column({ name: 'numero_afiliacion', length: 50 })
  numeroAfiliacion: string;

  @Column({ name: 'terminal_id_banco', length: 50 })
  terminalIdBanco: string;

  @Column({
    name: 'tipo_conexion',
    length: 30,
    default: 'AISLADO',
  })
  tipoConexion: string; // 'AISLADO', 'LOCAL_NETWORK_TCP', 'SMART_POS_AIDL', 'MOCK'

  @Column({ name: 'ip_address', nullable: true, length: 50 })
  ipAddress?: string;

  @Column({ type: 'int', nullable: true })
  port?: number;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
