import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('shrinkages')
export class Shrinkage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  shrinkage_type: string;

  @Column({ nullable: true })
  reason: string;

  // R20: what the person recording the shrinkage actually wrote — why the goods
  // were lost or damaged. NOT NULL in the schema because the service already
  // requires it (requireMermaObservation) before recording anything; before
  // this column existed the value was validated and then discarded.
  @Column({ nullable: false })
  observation: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
