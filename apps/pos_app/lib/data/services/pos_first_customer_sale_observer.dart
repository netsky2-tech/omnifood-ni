import 'dart:convert';
import 'package:uuid/uuid.dart';
import '../database/app_database.dart';
import '../models/activation/first_customer_sale_observation_entity.dart';
import '../models/activation/activation_outbox_envelope_entity.dart';
import 'pos_product_telemetry_service.dart';

class ObserveCustomerSaleResult {
  final bool isFirstCustomerSale;
  final FirstCustomerSaleObservationEntity? observation;
  final String? historicalTtfssTicketId;

  const ObserveCustomerSaleResult({
    required this.isFirstCustomerSale,
    this.observation,
    this.historicalTtfssTicketId,
  });
}

class PosFirstCustomerSaleObserver {
  final AppDatabase _database;
  final PosProductTelemetryService _telemetryService;
  static const _uuid = Uuid();

  PosFirstCustomerSaleObserver(
    this._database,
    this._telemetryService,
  );

  /// Observes a commercial customer checkout sale.
  ///
  /// Normative Invariants (ONB1.9G):
  /// 1. If firstSuccessfulSaleAt was a controlled technical sale during Activation (Hito M6),
  ///    records in a decoupled manner the timestamp of the first commercial ticket emitted to a final customer.
  /// 2. Invariant: The subsequent first customer sale NEVER modifies the historical TTFSS claim (first_successful_sale_claims).
  /// 3. Write-once: Multiple subsequent commercial customer sales do not overwrite or duplicate the initial observation.
  Future<ObserveCustomerSaleResult> observeCustomerSale({
    required String tenantId,
    required String terminalId,
    required String ticketId,
    required DateTime occurredAt,
  }) async {
    final trimmedTenantId = tenantId.trim();
    final trimmedTicketId = ticketId.trim();

    // 1. Check historical TTFSS claim
    final historicalClaim = await _database.firstSuccessfulSaleClaimDao.getClaimByTenantId(trimmedTenantId);

    // 2. Check if First Customer Sale was already observed
    final existingObservation = await _database.firstCustomerSaleObservationDao.getObservationByTenantId(trimmedTenantId);
    if (existingObservation != null) {
      return ObserveCustomerSaleResult(
        isFirstCustomerSale: false,
        observation: existingObservation,
        historicalTtfssTicketId: historicalClaim?.ticketId,
      );
    }

    // 3. Record new First Customer Sale Observation atomically
    final nowIso = DateTime.now().toIso8601String();
    final outboxEventId = _uuid.v4();
    final observation = FirstCustomerSaleObservationEntity(
      tenantId: trimmedTenantId,
      terminalId: terminalId.trim(),
      ticketId: trimmedTicketId,
      occurredAt: occurredAt.toIso8601String(),
      outboxEventId: outboxEventId,
      createdAtLocal: nowIso,
    );

    await _database.firstCustomerSaleObservationDao.insertObservation(observation);

    // 4. Verify durable persistence
    final persisted = await _database.firstCustomerSaleObservationDao.getObservationByTenantId(trimmedTenantId);
    if (persisted == null || persisted.ticketId != trimmedTicketId) {
      return ObserveCustomerSaleResult(
        isFirstCustomerSale: false,
        observation: persisted,
        historicalTtfssTicketId: historicalClaim?.ticketId,
      );
    }

    // 5. Queue outbox envelope for cloud sync
    final idempotencyKey = 'onboarding:first-customer-sale:$trimmedTenantId';
    final existingEnvelope = await _database.activationOutboxDao.getEnvelopeByIdempotencyKey(
      trimmedTenantId,
      idempotencyKey,
    );

    if (existingEnvelope == null) {
      final payload = {
        'tenantId': trimmedTenantId,
        'terminalId': terminalId.trim(),
        'ticketId': trimmedTicketId,
        'occurredAt': occurredAt.toIso8601String(),
        'historicalTtfssTicketId': historicalClaim?.ticketId,
        'historicalTtfssPreserved': true,
      };

      await _database.activationOutboxDao.insertEnvelope(
        ActivationOutboxEnvelopeEntity(
          id: _uuid.v4(),
          tenantId: trimmedTenantId,
          activationAttemptId: historicalClaim?.activationAttemptId ?? 'COMMERCIAL_OPERATIONAL',
          eventType: 'FIRST_CUSTOMER_SALE_OBSERVED',
          idempotencyKey: idempotencyKey,
          payloadJson: jsonEncode(payload),
          payloadHash: 'hash-$outboxEventId',
          syncStatus: 'PENDING',
          createdAt: nowIso,
        ),
      );
    }

    // 6. Emit telemetry event
    await _telemetryService.recordEvent(
      eventName: PosTelemetryEventName.firstCustomerSale,
      tenantId: trimmedTenantId,
      terminalId: terminalId.trim(),
      ticketId: trimmedTicketId,
      occurredAt: occurredAt,
      properties: {
        'ticketId': trimmedTicketId,
        'historicalTtfssTicketId': historicalClaim?.ticketId,
        'historicalTtfssPreserved': true,
      },
    );

    return ObserveCustomerSaleResult(
      isFirstCustomerSale: true,
      observation: persisted,
      historicalTtfssTicketId: historicalClaim?.ticketId,
    );
  }
}
