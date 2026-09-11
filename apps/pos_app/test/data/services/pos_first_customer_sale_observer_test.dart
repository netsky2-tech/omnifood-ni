import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/first_successful_sale_claim_entity.dart';
import 'package:pos_app/data/services/pos_first_customer_sale_observer.dart';
import 'package:pos_app/data/services/pos_product_telemetry_service.dart';

void main() {
  group('PosFirstCustomerSaleObserver (Unit — ONB1.9G)', () {
    late AppDatabase database;
    late PosProductTelemetryService telemetryService;
    late PosFirstCustomerSaleObserver observer;

    const tenantId = 'tenant-customer-sale-test';
    const terminalId = 'terminal-founder-01';
    const verificationTicketId = 'ticket-activation-verification-001';
    const attemptId = 'attempt-uuid-001';

    setUp(() async {
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      telemetryService = PosProductTelemetryService();
      observer = PosFirstCustomerSaleObserver(database, telemetryService);

      // Seed historical activation verification sale claim (TTFSS)
      await database.firstSuccessfulSaleClaimDao.insertClaim(
        const FirstSuccessfulSaleClaimEntity(
          tenantId: tenantId,
          terminalId: terminalId,
          ticketId: verificationTicketId,
          activationAttemptId: attemptId,
          deviceOccurredAt: '2026-09-04T12:00:00.000Z',
          anchoredOccurredAt: '2026-09-04T12:00:00.000Z',
          clockConfidence: 'ANCHORED',
          serverTimeAnchorId: 'anchor-001',
          posBuild: '1.0.0+1',
          outboxEventId: 'outbox-ttfss-001',
          createdAtLocal: '2026-09-04T12:00:00.000Z',
        ),
      );
    });

    tearDown(() async {
      await database.close();
    });

    test('INVARIANT: observes first customer commercial sale and preserves historical TTFSS claim', () async {
      final customerSaleTime = DateTime.parse('2026-09-04T14:30:00.000Z');
      const commercialTicketId = 'ticket-commercial-walkin-001';

      final result = await observer.observeCustomerSale(
        tenantId: tenantId,
        terminalId: terminalId,
        ticketId: commercialTicketId,
        occurredAt: customerSaleTime,
      );

      expect(result.isFirstCustomerSale, isTrue);
      expect(result.observation, isNotNull);
      expect(result.observation!.ticketId, equals(commercialTicketId));
      expect(result.observation!.occurredAt, equals('2026-09-04T14:30:00.000Z'));
      expect(result.historicalTtfssTicketId, equals(verificationTicketId));

      // CRUCIAL INVARIANT: Check that first_successful_sale_claims is 100% untouched
      final claimInDb = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claimInDb, isNotNull);
      expect(claimInDb!.ticketId, equals(verificationTicketId)); // Still verification ticket!
      expect(claimInDb.activationAttemptId, equals(attemptId));
      expect(claimInDb.deviceOccurredAt, equals('2026-09-04T12:00:00.000Z'));

      // Check durable observation in SQLite
      final persistedObs = await database.firstCustomerSaleObservationDao.getObservationByTenantId(tenantId);
      expect(persistedObs, isNotNull);
      expect(persistedObs!.ticketId, equals(commercialTicketId));

      // Check outbox envelope created
      final envelope = await database.activationOutboxDao.getEnvelopeByIdempotencyKey(
        tenantId,
        'onboarding:first-customer-sale:$tenantId',
      );
      expect(envelope, isNotNull);
      expect(envelope!.eventType, equals('FIRST_CUSTOMER_SALE_OBSERVED'));
      expect(envelope.syncStatus, equals('PENDING'));

      // Check telemetry event emitted
      expect(telemetryService.emittedEvents.length, equals(1));
      final event = telemetryService.emittedEvents.first;
      expect(event.eventName, equals('FIRST_CUSTOMER_SALE'));
      expect(event.properties!['ticketId'], equals(commercialTicketId));
      expect(event.properties!['historicalTtfssPreserved'], isTrue);
    });

    test('INVARIANT: Write-once — subsequent commercial customer sales do NOT overwrite observation or TTFSS', () async {
      // First commercial sale
      await observer.observeCustomerSale(
        tenantId: tenantId,
        terminalId: terminalId,
        ticketId: 'ticket-commercial-walkin-001',
        occurredAt: DateTime.parse('2026-09-04T14:30:00.000Z'),
      );

      // Second commercial sale
      final result2 = await observer.observeCustomerSale(
        tenantId: tenantId,
        terminalId: terminalId,
        ticketId: 'ticket-commercial-walkin-002',
        occurredAt: DateTime.parse('2026-09-04T16:00:00.000Z'),
      );

      expect(result2.isFirstCustomerSale, isFalse);
      expect(result2.observation!.ticketId, equals('ticket-commercial-walkin-001'));

      final currentObs = await database.firstCustomerSaleObservationDao.getObservationByTenantId(tenantId);
      expect(currentObs!.ticketId, equals('ticket-commercial-walkin-001'));

      final claimInDb = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claimInDb!.ticketId, equals(verificationTicketId));
    });
  });
}
