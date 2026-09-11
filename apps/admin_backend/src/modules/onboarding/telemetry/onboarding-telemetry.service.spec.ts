import { BadRequestException } from '@nestjs/common';
import { OnboardingTelemetryService } from './onboarding-telemetry.service';
import {
  OnboardingTelemetryEventName,
  IngestTelemetryEventDto,
} from './onboarding-telemetry.types';
import { OnboardingTelemetryEvent } from '../entities/onboarding-telemetry-event.entity';

describe('OnboardingTelemetryService (Unit — ONB1.9E & ONB1.9F)', () => {
  let service: OnboardingTelemetryService;
  let mockTelemetryRepo: any;
  let mockSessionService: any;
  let mockChangeLogService: any;
  let savedEvents: OnboardingTelemetryEvent[];

  beforeEach(() => {
    savedEvents = [];
    mockTelemetryRepo = {
      create: jest.fn().mockImplementation((dto) => ({
        id: 'event-uuid-1234',
        createdAt: new Date(),
        ...dto,
      })),
      save: jest.fn().mockImplementation(async (entity) => {
        savedEvents.push(entity);
        return entity;
      }),
      find: jest.fn().mockImplementation(async ({ where }) => {
        return savedEvents.filter((e) => {
          if (where.tenantId && e.tenantId !== where.tenantId) return false;
          if (where.eventName && e.eventName !== where.eventName) return false;
          return true;
        });
      }),
    };

    mockSessionService = {
      getSession: jest.fn(),
      saveSession: jest.fn(),
    };

    mockChangeLogService = {
      log: jest.fn(),
    };

    service = new OnboardingTelemetryService(
      mockTelemetryRepo,
      mockSessionService,
      mockChangeLogService,
    );
  });

  describe('ONB1.9E — Product Telemetry Catalogue', () => {
    it('successfully records all canonical lifecycle events', async () => {
      const canonicalEvents = Object.values(OnboardingTelemetryEventName);
      expect(canonicalEvents.length).toBe(19);

      for (const eventName of canonicalEvents) {
        const dto: IngestTelemetryEventDto = {
          tenantId: 'tenant-test-1',
          eventName,
          sessionId: 'session-uuid-1',
          durationMs: 120,
          counts: { stepOrdinal: 1 },
          properties: { source: 'SETUP_CENTER' },
        };

        if (eventName === OnboardingTelemetryEventName.STEP_SKIPPED) {
          dto.stepId = 'BOH_INVENTORY'; // optional step
        }

        const receipt = await service.recordEvent(dto);
        expect(receipt.accepted).toBe(true);
        expect(receipt.eventName).toBe(eventName);
        expect(receipt.tenantId).toBe('tenant-test-1');
      }

      expect(savedEvents.length).toBe(19);
    });

    it('INVARIANT: Pure observability — recording telemetry NEVER touches session lifecycle or invokes saveSession', async () => {
      await service.recordEvent({
        tenantId: 'tenant-test-1',
        eventName: OnboardingTelemetryEventName.STEP_VIEWED,
        stepId: 'FISCAL_SETUP',
      });

      expect(mockSessionService.saveSession).not.toHaveBeenCalled();
    });

    it('INVARIANT: STEP_SKIPPED applies ONLY to optional/postponable steps and rejects required blockers', async () => {
      // 1. Required step -> REJECT
      await expect(
        service.recordEvent({
          tenantId: 'tenant-test-1',
          eventName: OnboardingTelemetryEventName.STEP_SKIPPED,
          stepId: 'FISCAL_SETUP', // REQUIRED
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordEvent({
          tenantId: 'tenant-test-1',
          eventName: OnboardingTelemetryEventName.STEP_SKIPPED,
          stepId: 'PRODUCT_CATALOG', // REQUIRED
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordEvent({
          tenantId: 'tenant-test-1',
          eventName: OnboardingTelemetryEventName.STEP_SKIPPED,
          stepId: 'ACTIVATION_VERIFICATION_SALE', // REQUIRED
        }),
      ).rejects.toThrow(BadRequestException);

      // 2. Optional step -> ALLOW
      const receipt = await service.recordEvent({
        tenantId: 'tenant-test-1',
        eventName: OnboardingTelemetryEventName.STEP_SKIPPED,
        stepId: 'BOH_COSTING', // OPTIONAL
      });
      expect(receipt.accepted).toBe(true);
      expect(receipt.eventName).toBe(OnboardingTelemetryEventName.STEP_SKIPPED);
    });
  });

  describe('ONB1.9F — Audit Trail vs Telemetry Separation & Zero Secrets Guardrail', () => {
    it('INVARIANT: Strict separation — Telemetry ingestion does NOT touch ChangeLog/Audit Trail', async () => {
      await service.recordEvent({
        tenantId: 'tenant-test-1',
        eventName: OnboardingTelemetryEventName.TEMPLATE_PREVIEWED,
        properties: { templateSlug: 'pulperia-standard' },
      });

      expect(mockChangeLogService.log).not.toHaveBeenCalled();
    });

    it('INVARIANT: Zero secrets — strips JWT, password, PIN, credit card, and raw CSV from properties', async () => {
      const rawCsv = 'barcode,name,price\n123,Soda,25.0\n124,Water,15.0';
      await service.recordEvent({
        tenantId: 'tenant-test-1',
        eventName: OnboardingTelemetryEventName.IMPORT_VALIDATED,
        properties: {
          user_password: 'superSecretPassword!',
          pin: '9876',
          jwt_token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.xyz',
          card: '4532015012345678',
          rawCsvContent: rawCsv,
          normalMetric: 'valid_metric',
        },
      });

      expect(savedEvents.length).toBe(1);
      const saved = savedEvents[0];
      const props = saved.propertiesSanitizedJson!;

      expect(props.user_password).toBe('[REDACTED_SECRET]');
      expect(props.pin).toBe('[REDACTED_PIN]');
      expect(props.jwt_token).toContain('[REDACTED_JWT]');
      expect(props.card).toBe('[REDACTED_CARD]');
      expect(props.rawCsvContent).toEqual({
        redacted: true,
        type: 'RAW_CSV_REDACTED',
        lineCount: 3,
        byteLength: rawCsv.length,
      });
      expect(props.normalMetric).toBe('valid_metric');
    });

    it('validates tenant boundary: throws BadRequestException if tenantId is missing or empty', async () => {
      await expect(
        service.recordEvent({
          tenantId: '   ',
          eventName: OnboardingTelemetryEventName.STEP_VIEWED,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
