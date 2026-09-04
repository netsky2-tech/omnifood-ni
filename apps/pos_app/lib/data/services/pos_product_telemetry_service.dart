import 'pos_zero_secrets_sanitizer.dart';

enum PosTelemetryEventName {
  ONBOARDING_STARTED,
  SESSION_RESUMED,
  STEP_VIEWED,
  STEP_COMPLETED_OBSERVED,
  STEP_SKIPPED,
  TEMPLATE_PREVIEWED,
  TEMPLATE_APPLY_RESULT,
  IMPORT_STARTED,
  IMPORT_VALIDATED,
  IMPORT_COMMIT_RESULT,
  IMPORT_FAILED,
  SALE_READY_REACHED,
  ACTIVATION_STARTED,
  ACTIVATION_CHECK_FAILED,
  ACTIVATION_WARNING,
  ACTIVATION_RESULT,
  FIRST_SUCCESSFUL_SALE,
  FIRST_CUSTOMER_SALE,
  BOH_READINESS_CHANGED,
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
      eventName: eventName.name,
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
