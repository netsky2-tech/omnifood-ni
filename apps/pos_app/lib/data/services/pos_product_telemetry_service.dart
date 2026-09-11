import 'pos_zero_secrets_sanitizer.dart';

enum PosTelemetryEventName {
  onboardingStarted('ONBOARDING_STARTED'),
  sessionResumed('SESSION_RESUMED'),
  stepViewed('STEP_VIEWED'),
  stepCompletedObserved('STEP_COMPLETED_OBSERVED'),
  stepSkipped('STEP_SKIPPED'),
  templatePreviewed('TEMPLATE_PREVIEWED'),
  templateApplyResult('TEMPLATE_APPLY_RESULT'),
  importStarted('IMPORT_STARTED'),
  importValidated('IMPORT_VALIDATED'),
  importCommitResult('IMPORT_COMMIT_RESULT'),
  importFailed('IMPORT_FAILED'),
  saleReadyReached('SALE_READY_REACHED'),
  activationStarted('ACTIVATION_STARTED'),
  activationCheckFailed('ACTIVATION_CHECK_FAILED'),
  activationWarning('ACTIVATION_WARNING'),
  activationResult('ACTIVATION_RESULT'),
  firstSuccessfulSale('FIRST_SUCCESSFUL_SALE'),
  firstCustomerSale('FIRST_CUSTOMER_SALE'),
  bohReadinessChanged('BOH_READINESS_CHANGED');

  final String wireName;
  const PosTelemetryEventName(this.wireName);
}

class PosTelemetryEvent {
  final String eventName;
  final String tenantId;
  final String? terminalId;
  final String? ticketId;
  final DateTime occurredAt;
  final Map<String, dynamic>? properties;

  const PosTelemetryEvent({
    required this.eventName,
    required this.tenantId,
    this.terminalId,
    this.ticketId,
    required this.occurredAt,
    this.properties,
  });
}

class PosProductTelemetryService {
  final List<PosTelemetryEvent> _emittedEvents = [];

  List<PosTelemetryEvent> get emittedEvents => List.unmodifiable(_emittedEvents);

  void clearEmittedEvents() {
    _emittedEvents.clear();
  }

  /// Records a canonical telemetry event.
  ///
  /// Invariants:
  /// 1. Pure Observability: Does not block or alter transactions or attempts.
  /// 2. Zero Secrets Guardrail: Properties are strictly sanitized via PosZeroSecretsSanitizer.
  Future<PosTelemetryEvent> recordEvent({
    required PosTelemetryEventName eventName,
    required String tenantId,
    String? terminalId,
    String? ticketId,
    DateTime? occurredAt,
    Map<String, dynamic>? properties,
  }) async {
    final sanitizedProps = properties != null
        ? PosZeroSecretsSanitizer.sanitize(properties) as Map<String, dynamic>
        : null;

    final event = PosTelemetryEvent(
      eventName: eventName.wireName,
      tenantId: tenantId.trim(),
      terminalId: terminalId?.trim(),
      ticketId: ticketId?.trim(),
      occurredAt: occurredAt ?? DateTime.now(),
      properties: sanitizedProps,
    );

    _emittedEvents.add(event);
    return event;
  }
}
