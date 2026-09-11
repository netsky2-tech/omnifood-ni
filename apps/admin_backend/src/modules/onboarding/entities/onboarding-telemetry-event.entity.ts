import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OnboardingTelemetryEventName } from '../telemetry/onboarding-telemetry.types';

@Entity({ name: 'onboarding_telemetry_events' })
@Index('idx_onboarding_telemetry_tenant_event', ['tenantId', 'eventName'])
@Index('idx_onboarding_telemetry_occurred_at', ['occurredAt'])
export class OnboardingTelemetryEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 128 })
  @Index('idx_onboarding_telemetry_tenant_id')
  tenantId!: string;

  @Column({
    name: 'event_name',
    type: 'varchar',
    length: 64,
  })
  eventName!: OnboardingTelemetryEventName;

  @Column({ name: 'session_id', type: 'varchar', length: 128, nullable: true })
  sessionId!: string | null;

  @Column({ name: 'step_id', type: 'varchar', length: 64, nullable: true })
  stepId!: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'counts_json', type: 'jsonb', nullable: true })
  countsJson!: Record<string, number> | null;

  @Column({ name: 'properties_sanitized_json', type: 'jsonb', nullable: true })
  propertiesSanitizedJson!: Record<string, any> | null;

  @Column({
    name: 'error_sanitized_code',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  errorSanitizedCode!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
