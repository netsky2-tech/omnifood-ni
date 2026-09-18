import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';

// One mutable publication marker per tenant, keyed by tenant_id:
// design §11.2 decision 16. Like the terminal ack floor, CAS monotonicity
// (no revision regression) and tenant re-identification guards live in the
// migration's BEFORE UPDATE trigger; this entity deliberately does not
// re-declare them.
@Entity({ name: 'human_auth_tenant_publication_state' })
export class HumanAuthTenantPublicationState {
  @PrimaryColumn({ name: 'tenant_id', type: 'varchar', length: 128 })
  tenantId!: string;
  @Column({ name: 'dirty', type: 'boolean', default: true })
  dirty!: boolean;
  @Column({
    name: 'revision',
    type: 'bigint',
    default: 1,
    transformer: BIGINT_STRING,
  })
  revision!: string;
  @Column({
    name: 'marked_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  markedAt!: Date;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;
}
