/// Centralized map of internal activation/code strings to user-facing
/// Spanish copy for the POS app.
///
/// This file is the single source of truth for rendering internal codes and
/// enums (blocker codes, lifecycle statuses, check codes, evidence refs,
/// payment methods, user roles) in the UI. The backend's machine codes are
/// part of the API contract and remain untranslated in the backend: this map
/// only translates at the view layer.
///
/// Fallback convention: an unknown code passes through unchanged
/// ([localize] returns the code itself). It never crashes and never renders
/// a placeholder like "(unknown)". The regression guard
/// (`test/core/localization/label_map_test.dart`) walks every map registered
/// in [kAllLabelMaps], so a new family added to the registry is
/// automatically covered.
library;

/// Blocker codes emitted by the activation discovery/session pipeline.
///
/// Sources:
/// - `lib/data/services/activation_attempt_discovery_service.dart`
///   (discovery blockers).
/// - `lib/data/services/activation_session_service.dart`
///   ([ATTEMPT_NOT_PREPARED] refusal, verification-product blocker).
/// - `lib/ui/features/config/activation/activation_session_view_model.dart`
///   (session user / terminal priming blockers).
/// - `lib/data/services/activation_pre_offline_runner.dart`
///   (printer availability blocker).
const Map<String, String> kActivationBlockerLabels = <String, String>{
  'NO_ACTIVE_ATTEMPT': 'No hay un intento de activación en curso.',
  'TERMINAL_MISMATCH': 'La terminal registrada no corresponde a este dispositivo.',
  'TENANT_MISMATCH': 'El intento de activación pertenece a otro comercio.',
  'ACTIVE_ATTEMPT_FETCH_FAILED':
      'No se pudo consultar el intento de activación. Verifique la conexión e intente de nuevo.',
  'ACTIVE_ATTEMPT_PAYLOAD_INVALID':
      'La respuesta del servidor sobre el intento de activación no es válida.',
  'VERIFICATION_PRODUCT_MISSING':
      'El producto de verificación no está en el catálogo local. Sincronice el catálogo e intente de nuevo.',
  'ATTEMPT_NOT_PREPARED':
      'No hay un intento preparado. Complete la preparación antes de continuar.',
  'SESSION_USER_UNRESOLVED': 'No se pudo identificar al usuario autorizado de la sesión.',
  'TERMINAL_PRIMING_FAILED': 'Falló la preparación de la terminal en el servidor.',
  'PRINTER_AVAILABLE_FAILED':
      'La impresora no está lista. Revise su estado en Configuración.',
};

/// Attempt lifecycle statuses (`localStatus`) managed by the activation
/// runners.
///
/// Sources:
/// - `lib/data/services/activation_pre_offline_runner.dart`
///   (ASSIGNED, RUNNING).
/// - `lib/data/services/activation_controlled_sale_runner.dart`
///   (LOCAL_ACTIVATION_EVIDENCE_COMPLETE, NOT_FOUND).
/// - `lib/data/services/activation_reconnect_sync_runner.dart`
///   (SYNC_VERIFICATION_PENDING, EVIDENCE_ACKED, ACTIVATED,
///   ACTIVATED_WITH_WARNING, FAILED, NOT_FOUND).
const Map<String, String> kActivationAttemptStatusLabels = <String, String>{
  'ASSIGNED': 'Asignado',
  'RUNNING': 'En curso',
  'LOCAL_ACTIVATION_EVIDENCE_COMPLETE': 'Evidencia local completa',
  'SYNC_VERIFICATION_PENDING': 'Sincronización pendiente',
  'EVIDENCE_ACKED': 'Evidencia confirmada',
  'ACTIVATED': 'Activado',
  'ACTIVATED_WITH_WARNING': 'Activado con advertencia',
  'FAILED': 'Fallido',
  'NOT_FOUND': 'No encontrado',
};

/// Check statuses recorded by the activation check runners and returned by
/// the sync port.
///
/// Sources:
/// - `lib/data/models/activation/activation_check_result_local_entity.dart`
///   (PASS, FAIL, WARNING, NOT_RUN).
/// - `lib/data/ports/activation_sync_port.dart` and
///   `lib/data/adapters/activation/dio_activation_sync_port.dart`
///   (PASS_WITH_WARNING, NETWORK_ERROR).
const Map<String, String> kActivationCheckStatusLabels = <String, String>{
  'PASS': 'Aprobado',
  'FAIL': 'Fallido',
  'WARNING': 'Advertencia',
  'NOT_RUN': 'No ejecutado',
  'PASS_WITH_WARNING': 'Aprobado con advertencia',
  'NETWORK_ERROR': 'Error de red',
};

/// Check codes emitted by the activation check runners.
///
/// Sources:
/// - `lib/data/services/activation_pre_offline_runner.dart`
///   (TERMINAL_LINKED, REQUIRED_CONFIG_LOCAL, AUTHORIZED_USER_LOCAL,
///   PRINTER_AVAILABLE, TEST_PRINT, SQLITE_DURABILITY).
/// - `lib/data/services/activation_controlled_sale_runner.dart`
///   (OFFLINE_SALE_PAID, SALE_RECEIPT_PATH, OUTBOX_DURABLE).
/// - `lib/data/services/activation_reconnect_sync_runner.dart`
///   (POST_RECONNECT_SYNC).
const Map<String, String> kActivationCheckCodeLabels = <String, String>{
  'TERMINAL_LINKED': 'Terminal vinculada',
  'REQUIRED_CONFIG_LOCAL': 'Configuración requerida',
  'AUTHORIZED_USER_LOCAL': 'Usuario autorizado',
  'PRINTER_AVAILABLE': 'Impresora disponible',
  'TEST_PRINT': 'Impresión de prueba',
  'SQLITE_DURABILITY': 'Durabilidad de la base de datos',
  'OFFLINE_SALE_PAID': 'Venta fuera de línea pagada',
  'SALE_RECEIPT_PATH': 'Ticket de la venta',
  'OUTBOX_DURABLE': 'Evidencia guardada localmente',
  'POST_RECONNECT_SYNC': 'Sincronización al reconectar',
};

/// Evidence refs attached to activation check results.
///
/// Sources:
/// - `lib/data/services/activation_pre_offline_runner.dart`
///   (ROUNDTRIP_OK, PRINT_COMMAND_ACCEPTED, PRINT_TEST_FAILED).
/// - `lib/data/services/activation_controlled_sale_runner.dart`
///   (RECEIPT_PRINTED_OK, RECEIPT_PRINT_FAILED,
///   RECEIPT_BLOCKED_UNRESOLVED_TAX_REGIME, OUTBOX_CONSOLIDATED).
/// - `lib/data/services/activation_reconnect_sync_runner.dart`
///   (ALL_ACTIVATION_ENVELOPES_ACKED).
const Map<String, String> kActivationEvidenceRefLabels = <String, String>{
  'ROUNDTRIP_OK': 'Lectura y escritura verificadas',
  'PRINT_COMMAND_ACCEPTED': 'Comando de impresión aceptado',
  'PRINT_TEST_FAILED': 'Falló la impresión de prueba',
  'RECEIPT_PRINTED_OK': 'Ticket impreso correctamente',
  'RECEIPT_PRINT_FAILED': 'No se pudo imprimir el ticket',
  'RECEIPT_BLOCKED_UNRESOLVED_TAX_REGIME':
      'Impresión bloqueada: régimen de impuestos sin resolver',
  'OUTBOX_CONSOLIDATED': 'Evidencia consolidada para sincronizar',
  'ALL_ACTIVATION_ENVELOPES_ACKED': 'Evidencia confirmada por el servidor',
};

/// Payment method labels ([PaymentMethod] enum `name` values).
///
/// Source: `lib/domain/models/sales/payment.dart`.
const Map<String, String> kPaymentMethodLabels = <String, String>{
  'cash': 'Efectivo',
  'card': 'Tarjeta',
  'qr': 'Código QR',
  'points': 'Puntos',
};

/// User role labels ([UserRole] enum `name` values).
///
/// Source: `lib/domain/models/user.dart`.
const Map<String, String> kUserRoleLabels = <String, String>{
  'owner': 'Dueño',
  'manager': 'Gerente',
  'cashier': 'Cajero',
  'waiter': 'Mesero',
};

/// Backend finalize verdict statuses (`backendFinalizeResult.status`).
///
/// Source: `lib/data/ports/activation_sync_port.dart` — the verdict statuses
/// (PASS, PASS_WITH_WARNING, FAIL, NETWORK_ERROR) are exactly the check
/// statuses, so this family reuses [kActivationCheckStatusLabels] rather than
/// duplicating the copy.
const Map<String, String> kActivationBackendVerdictLabels =
    kActivationCheckStatusLabels;

/// Registry of every exported label family. The regression guard walks this
/// map, so any family added here is automatically covered by the test.
const Map<String, Map<String, String>> kAllLabelMaps = <String,
    Map<String, String>>{
  'kActivationBlockerLabels': kActivationBlockerLabels,
  'kActivationAttemptStatusLabels': kActivationAttemptStatusLabels,
  'kActivationCheckStatusLabels': kActivationCheckStatusLabels,
  'kActivationCheckCodeLabels': kActivationCheckCodeLabels,
  'kActivationEvidenceRefLabels': kActivationEvidenceRefLabels,
  'kPaymentMethodLabels': kPaymentMethodLabels,
  'kUserRoleLabels': kUserRoleLabels,
  'kActivationBackendVerdictLabels': kActivationBackendVerdictLabels,
};

/// Returns the Spanish label for [code] from [labels], or [code] itself when
/// unknown. Never throws and never renders a placeholder: unknown codes pass
/// through unchanged so new backend codes stay visible instead of crashing.
String localize(String code, Map<String, String> labels) =>
    labels[code] ?? code;
