import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { OnboardingTelemetryEvent } from '../entities/onboarding-telemetry-event.entity';
import { OnboardingSessionService } from '../services/onboarding-session.service';
import { ChangeLogService } from '../../audit/change-log.service';
import {
  IngestTelemetryEventDto,
  TelemetryIngestReceipt,
  OnboardingTelemetryEventName,
  OnboardingStepCategory,
  ONBOARDING_STEP_DEFINITIONS,
} from './onboarding-telemetry.types';
import { ZeroSecretsSanitizer } from './zero-secrets-sanitizer';

@Injectable()
export class OnboardingTelemetryService {
  private readonly logger = new Logger(OnboardingTelemetryService.name);

  constructor(
    @InjectRepository(OnboardingTelemetryEvent)
    private readonly telemetryRepo: Repository<OnboardingTelemetryEvent>,
    private readonly sessionService: OnboardingSessionService,
    private readonly changeLogService: ChangeLogService,
  ) {}

  /**
   * Records a canonical product telemetry event.
   *
   * Normative Invariants:
   * 1. Observability Only: Telemetry NEVER mutates OnboardingSession lifecycle or state.
   * 2. Audit Trail Separation: Telemetry is strictly decoupled from ChangeLog / AuditLog.
   * 3. Zero Secrets Guardrail: Strips JWT, passwords, PIN/TOTP, credit cards, raw CSV, and masks PII.
   * 4. STEP_SKIPPED Constraint: Only optional/postponable steps can be skipped.
   */
  async recordEvent(
    dto: IngestTelemetryEventDto,
  ): Promise<TelemetryIngestReceipt> {
    const trimmedTenant = dto.tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('INVALID_TENANT: tenantId is required');
    }

    if (
      !dto.eventName ||
      !Object.values(OnboardingTelemetryEventName).includes(dto.eventName)
    ) {
      throw new BadRequestException(
        `INVALID_EVENT: Unknown telemetry event '${dto.eventName}'`,
      );
    }

    // Guardrail: STEP_SKIPPED is only allowed for optional/postponable steps
    if (dto.eventName === OnboardingTelemetryEventName.STEP_SKIPPED) {
      const stepId = dto.stepId?.trim();
      if (!stepId) {
        throw new BadRequestException(
          'MISSING_STEP_ID: stepId is required for STEP_SKIPPED events',
        );
      }

      const stepDef = ONBOARDING_STEP_DEFINITIONS[stepId];
      if (stepDef && stepDef.category === OnboardingStepCategory.REQUIRED) {
        throw new BadRequestException(
          `STEP_NOT_SKIPPABLE: Cannot skip required onboarding step: ${stepId}`,
        );
      }
    }

    // Guardrail: Zero Secrets sanitization on properties
    const sanitizedProps = dto.properties
      ? ZeroSecretsSanitizer.sanitize(dto.properties)
      : null;

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const entity = this.telemetryRepo.create({
      tenantId: trimmedTenant,
      eventName: dto.eventName,
      sessionId: dto.sessionId?.trim() || null,
      stepId: dto.stepId?.trim() || null,
      durationMs: dto.durationMs !== undefined ? dto.durationMs : null,
      countsJson: dto.counts || null,
      propertiesSanitizedJson: sanitizedProps,
      errorSanitizedCode: dto.errorSanitizedCode?.trim() || null,
      occurredAt,
    });

    const saved = await this.telemetryRepo.save(entity);

    this.logger.debug(
      `Recorded telemetry event '${dto.eventName}' for tenant '${trimmedTenant}' (id: ${saved.id})`,
    );

    return {
      eventId: saved.id,
      eventName: saved.eventName,
      tenantId: saved.tenantId,
      accepted: true,
      sanitized: true,
      occurredAt: saved.occurredAt.toISOString(),
    };
  }

  async getEventsByTenant(
    tenantId: string,
    eventName?: OnboardingTelemetryEventName,
  ): Promise<OnboardingTelemetryEvent[]> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) return [];

    const where: FindOptionsWhere<OnboardingTelemetryEvent> = {
      tenantId: trimmedTenant,
    };
    if (eventName) {
      where.eventName = eventName;
    }

    return this.telemetryRepo.find({
      where,
      order: { occurredAt: 'ASC' },
    });
  }
}
