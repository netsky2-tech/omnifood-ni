import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tenant_topology_revisions')
@Index('uq_tenant_topology_revisions_revision', ['tenant_id', 'revision'], {
  unique: true,
})
export class TenantTopologyRevision {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenant_id: string;
  @Column({ type: 'integer' }) contract_version: number;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'jsonb' }) topology: Record<string, unknown>;
  @Column() hash: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
