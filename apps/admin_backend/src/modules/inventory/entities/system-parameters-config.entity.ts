import {
  Entity,
  ViewEntity,
  ViewColumn,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('sys_parametros_config')
@Index(
  'uq_sys_parametros_config_tenant_key_version',
  ['tenant_id', 'paramKey', 'version'],
  { unique: true },
)
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

  @Column({
    name: 'effective_from',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
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

/**
 * Read model mapping the database view created by migration
 * 1784000000000-CreateSystemParametersConfig (its DDL is owned by the
 * migration, hence synchronize: false). The view resolves the governing
 * configuration version per (tenant_id, param_key) with DISTINCT ON and
 * version DESC, and its security_invoker = true keeps reads under the
 * caller's RLS context.
 *
 * Readers MUST use this view instead of filtering the table by isActive:
 * once supersession became append-only (issue #377), every historical row
 * keeps is_active = true, so the table alone cannot resolve a single
 * governing version per key.
 */
@ViewEntity({ name: 'v_sys_parametros_config_active', synchronize: false })
export class SystemParametersConfigActiveView {
  @ViewColumn()
  id: string;

  @ViewColumn({ name: 'tenant_id' })
  tenant_id: string;

  @ViewColumn({ name: 'param_key' })
  paramKey: string;

  @ViewColumn({ name: 'param_value' })
  paramValue: Record<string, unknown> | number | string | boolean;

  @ViewColumn()
  version: number;

  @ViewColumn({ name: 'effective_from' })
  effectiveFrom: Date;

  @ViewColumn({ name: 'effective_to' })
  effectiveTo: Date | null;

  @ViewColumn({ name: 'is_active' })
  isActive: boolean;

  @ViewColumn({ name: 'created_by' })
  createdBy: string | null;

  @ViewColumn({ name: 'created_at' })
  createdAt: Date;
}
