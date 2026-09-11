import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/pos_product_telemetry_service.dart';

void main() {
  group('PosProductTelemetryService', () {
    test('preserves exact wire names for all canonical telemetry events', () {
      final expectedWireNames = {
        PosTelemetryEventName.onboardingStarted: 'ONBOARDING_STARTED',
        PosTelemetryEventName.sessionResumed: 'SESSION_RESUMED',
        PosTelemetryEventName.stepViewed: 'STEP_VIEWED',
        PosTelemetryEventName.stepCompletedObserved: 'STEP_COMPLETED_OBSERVED',
        PosTelemetryEventName.stepSkipped: 'STEP_SKIPPED',
        PosTelemetryEventName.templatePreviewed: 'TEMPLATE_PREVIEWED',
        PosTelemetryEventName.templateApplyResult: 'TEMPLATE_APPLY_RESULT',
        PosTelemetryEventName.importStarted: 'IMPORT_STARTED',
        PosTelemetryEventName.importValidated: 'IMPORT_VALIDATED',
        PosTelemetryEventName.importCommitResult: 'IMPORT_COMMIT_RESULT',
        PosTelemetryEventName.importFailed: 'IMPORT_FAILED',
        PosTelemetryEventName.saleReadyReached: 'SALE_READY_REACHED',
        PosTelemetryEventName.activationStarted: 'ACTIVATION_STARTED',
        PosTelemetryEventName.activationCheckFailed: 'ACTIVATION_CHECK_FAILED',
        PosTelemetryEventName.activationWarning: 'ACTIVATION_WARNING',
        PosTelemetryEventName.activationResult: 'ACTIVATION_RESULT',
        PosTelemetryEventName.firstSuccessfulSale: 'FIRST_SUCCESSFUL_SALE',
        PosTelemetryEventName.firstCustomerSale: 'FIRST_CUSTOMER_SALE',
        PosTelemetryEventName.bohReadinessChanged: 'BOH_READINESS_CHANGED',
      };

      expect(PosTelemetryEventName.values.length, equals(19));
      for (final entry in expectedWireNames.entries) {
        expect(entry.key.wireName, equals(entry.value));
      }
    });

    test(
      'recordEvent records event with wire name as eventName and sanitizes properties',
      () async {
        final service = PosProductTelemetryService();
        final event = await service.recordEvent(
          eventName: PosTelemetryEventName.firstCustomerSale,
          tenantId: 'tenant-123',
          terminalId: 'term-456',
          ticketId: 'tick-789',
          properties: {'ticketId': 'tick-789', 'pin_code': '1234'},
        );

        expect(event.eventName, equals('FIRST_CUSTOMER_SALE'));
        expect(event.tenantId, equals('tenant-123'));
        expect(event.terminalId, equals('term-456'));
        expect(event.ticketId, equals('tick-789'));
        expect(event.properties?['ticketId'], equals('tick-789'));
        expect(event.properties?['pin_code'], equals('[REDACTED_PIN]'));
        expect(service.emittedEvents.length, equals(1));

        service.clearEmittedEvents();
        expect(service.emittedEvents, isEmpty);
      },
    );
  });
}
