import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('sys_parametros_config')
@Index('uq_sys_parametros_config_tenant_key_version', ['tenant_id', 'paramKey', 'version'], { unique: true })
export class SystemParametersConfig {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'param_key' })
  paramKey: string;

  @Column({ name: 'param_value', type: 'jsonb' })
  paramValue: Record<string, unknown> | number | string | boolean;

  @Column({ default: 1 })
  version: number;

  @Column({ name: 'effective_from', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true })
  effectiveTo: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
