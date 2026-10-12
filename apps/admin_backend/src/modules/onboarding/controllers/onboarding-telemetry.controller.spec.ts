import { OnboardingTelemetryController } from './onboarding-telemetry.controller';
import { OnboardingTelemetryService } from '../telemetry/onboarding-telemetry.service';
import { OnboardingTelemetryEventName } from '../telemetry/onboarding-telemetry.types';
import { UnauthorizedException } from '@nestjs/common';

describe('OnboardingTelemetryController (Unit)', () => {
  let controller: OnboardingTelemetryController;
  let service: jest.Mocked<OnboardingTelemetryService>;

  beforeEach(() => {
    service = {
      recordEvent: jest.fn(),
      getEventsByTenant: jest.fn(),
    } as unknown as jest.Mocked<OnboardingTelemetryService>;

    controller = new OnboardingTelemetryController(service);
  });

  it('records event extracting tenant from auth context', async () => {
    (service.recordEvent as jest.Mock).mockResolvedValue({
      eventId: 'evt-123',
      eventName: OnboardingTelemetryEventName.STEP_VIEWED,
      tenantId: 'tenant-abc',
      accepted: true,
      sanitized: true,
      occurredAt: '2026-09-04T14:00:00.000Z',
    });

    const req = {
      user: {
        tenantId: 'tenant-abc',
        userId: 'user-1',
      },
    } as any;

    const result = await controller.recordEvent(
      req,
      {
        eventName: OnboardingTelemetryEventName.STEP_VIEWED,
        stepId: 'BOH_INVENTORY',
      },
      'tenant-abc',
    );

    expect(result.accepted).toBe(true);
    expect(service.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-abc',
        eventName: OnboardingTelemetryEventName.STEP_VIEWED,
        stepId: 'BOH_INVENTORY',
      }),
    );
  });

  it('rejects if tenant context is missing', async () => {
    const req = { user: {} } as any;

    await expect(
      controller.recordEvent(
        req,
        {
          eventName: OnboardingTelemetryEventName.STEP_VIEWED,
        },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('fetches events scoped by tenantId', async () => {
    (service.getEventsByTenant as jest.Mock).mockResolvedValue([]);

    const req = {
      user: {
        tenantId: 'tenant-xyz',
      },
    } as any;

    await controller.getEvents(req, 'tenant-xyz', OnboardingTelemetryEventName.BOH_READINESS_CHANGED);

    expect(service.getEventsByTenant).toHaveBeenCalledWith(
      'tenant-xyz',
      OnboardingTelemetryEventName.BOH_READINESS_CHANGED,
    );
  });
});
