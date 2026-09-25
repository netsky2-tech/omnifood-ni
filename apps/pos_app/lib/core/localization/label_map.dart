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
/// - `lib/data/ports/activation_priming_port.dart` and
///   `lib/data/adapters/activation/dio_activation_priming_port.dart`
///   (terminal priming payload blockers, surfaced verbatim as the view
///   model's `blockerCode`).
/// - `lib/data/ports/activation_priming_port.dart` (priming payload
///   validation codes surfaced as bare blocker codes).
/// - `lib/data/adapters/activation/dio_activation_priming_port.dart`
///   (TERMINAL_PRIMING_PAYLOAD_MALFORMED).
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
  'TERMINAL_PRIMING_PAYLOAD_MALFORMED':
      'La respuesta de preparación de la terminal no es utilizable. Verifique la conexión e intente de nuevo.',
  'PRINTER_AVAILABLE_FAILED':
      'La impresora no está lista. Revise su estado en Configuración.',
  'TERMINAL_PRIMING_STATUS_MISSING':
      'El servidor no reportó el estado de preparación de la terminal.',
  'TERMINAL_PRIMING_SERVER_TIME_MISSING':
      'El servidor no reportó su hora de referencia.',
  'TERMINAL_PRIMING_CURRENT_VERSION_MISSING':
      'El servidor no reportó la versión actual de datos.',
  'TERMINAL_PRIMING_DELTAS_MISSING':
      'El servidor no envió los cambios de datos pendientes.',
  'TERMINAL_PRIMING_DELTAS_PARTIAL':
      'La descarga de datos iniciales llegó incompleta. Sincronice e intente de nuevo.',
  'TERMINAL_PRIMING_PRODUCT_ENTRY_MALFORMED':
      'Un producto descargado tiene datos inválidos.',
  'TERMINAL_PRIMING_CATALOG_ENTRY_MALFORMED':
      'Una entrada del catálogo descargado es inválida.',
  'TERMINAL_PRIMING_FISCAL_ENVELOPE_MALFORMED':
      'La configuración fiscal descargada es inválida.',
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
  'RECEIPT_SKIPPED_BY_USER_CONFIG': 'Impresión omitida por configuración del usuario',
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

/// Void reason codes (D-15/#525 AC-6/AC-7, controlled list).
///
/// Source: `lib/domain/usecases/sales/void_decision.dart` —
/// [VoidReasonCodes] (`VoidReasonCodes.all`, exhaustive).
const Map<String, String> kVoidReasonLabels = <String, String>{
  'ERROR_DE_CAPTURA': 'Error de captura',
  'CLIENTE_DESISTE': 'Cliente desiste',
  'TICKET_DUPLICADO': 'Ticket duplicado',
  'OTRO': 'Otro',
};

/// Reprint reason codes (D-13/#547, controlled list).
///
/// Source: `lib/domain/usecases/sales/void_decision.dart` —
/// [ReprintReasonCodes] (`ReprintReasonCodes.all`, exhaustive).
/// Kept separate from [kVoidReasonLabels]: `OTRO` exists in both families
/// but the controlled lists are independent domains.
const Map<String, String> kReprintReasonLabels = <String, String>{
  'PAPEL_ATASCADO': 'Papel atascado',
  'CLIENTE_PERDIO_TICKET': 'El cliente perdió su ticket',
  'VERIFICACION': 'Verificación',
  'OTRO': 'Otro',
};

/// Count session lifecycle statuses (`CountSessionDocument.status`).
///
/// Source: `lib/domain/models/inventory/count_session_document.dart` —
/// [CountSessionStatus] constants, exhaustive (draft, open, counting,
/// recount, approval_pending, approved, posted, closed). The copy follows
/// the app's own vocabulary: posting a session is rendered as "Aplicar
/// ajustes" / "Aplicado:" in the count views, hence "Aplicada" for `posted`.
const Map<String, String> kCountSessionStatusLabels = <String, String>{
  'draft': 'Borrador',
  'open': 'Abierta',
  'counting': 'En conteo',
  'recount': 'Reconteo',
  'approval_pending': 'Pendiente de aprobación',
  'approved': 'Aprobada',
  'posted': 'Aplicada',
  'closed': 'Cerrada',
};

/// Forensic alert severities (`ForensicAlert.severity`).
///
/// Source: alert emitters — `lib/presentation/services/alert_service_impl.dart`
/// and `lib/ui/features/inventory/items/insumo_view_model.dart`
/// (`critical`, `high`), `lib/data/repositories/audit_repository_impl.dart`
/// (`critical`). Values are lowercase; no `warning`/`info` emitter exists in
/// the app today. Cloud-projected alerts (sync_service ST-05) may carry other
/// severities, which pass through unchanged per the [localize] convention.
const Map<String, String> kForensicSeverityLabels = <String, String>{
  'critical': 'Crítica',
  'high': 'Alta',
};

/// Forensic alert types (`ForensicAlert.alertType`).
///
/// Sources (every local emitter, exhaustive):
/// - `lib/presentation/services/alert_service_impl.dart` (LOW_STOCK).
/// - `lib/ui/features/inventory/items/insumo_view_model.dart`
///   (MANUAL_STOCK_ALTERATION, LOW_STOCK).
/// - `lib/data/repositories/audit_repository_impl.dart`
///   (AUDIT_STREAM_DUPLICATE_SEQUENCE, AUDIT_V3_POISON,
///   AUDIT_BACKEND_TERMINAL_REJECTION).
/// COUNT_VARIANCE is a projected cloud alert type (one-way sync projection,
/// ST-05) also used as the app's test fixture vocabulary. Unknown cloud
/// alert types pass through unchanged per the [localize] convention.
const Map<String, String> kForensicAlertTypeLabels = <String, String>{
  'LOW_STOCK': 'Stock bajo',
  'MANUAL_STOCK_ALTERATION': 'Alteración manual de stock',
  'AUDIT_STREAM_DUPLICATE_SEQUENCE': 'Secuencia duplicada en auditoría',
  'AUDIT_V3_POISON': 'Payload de auditoría ilegible',
  'AUDIT_BACKEND_TERMINAL_REJECTION': 'Rechazo del backend de auditoría',
  'COUNT_VARIANCE': 'Variación de conteo',
};

/// Forensic alert lifecycle statuses (`ForensicAlert.status`).
///
/// Source: `lib/domain/models/inventory/forensic_alert.dart` (`active`
/// default), `lib/presentation/services/alert_service_impl.dart`
/// (`acknowledged`, `resolved` transitions) and
/// `lib/ui/features/inventory/alerts/forensic_alert_view_model.dart`
/// (`superseded`). Copy mirrors the view model's `statusFor`, which already
/// renders localized statuses in the alert card chip.
const Map<String, String> kForensicAlertStatusLabels = <String, String>{
  'active': 'Activa',
  'acknowledged': 'Reconocida',
  'resolved': 'Resuelta',
  'superseded': 'Reemplazada',
};

/// Movement type codes carried in forensic alert metadata
/// (`metadata['movementType']`).
///
/// Source: `lib/presentation/services/alert_service_impl.dart` and
/// `lib/ui/features/inventory/items/insumo_view_model.dart`
/// (LOW_STOCK_THRESHOLD, MANUAL_STOCK_ALTERATION), exhaustive. These are
/// alert-specific codes, NOT [MovementType] names: the kardex renders its
/// movement types as Spanish free text from the view model, so this family
/// is intentionally separate from any kardex movement labels.
const Map<String, String> kForensicMovementTypeLabels = <String, String>{
  'LOW_STOCK_THRESHOLD': 'Umbral de stock bajo',
  'MANUAL_STOCK_ALTERATION': 'Alteración manual de stock',
};

/// Sync error detail strings surfaced verbatim by the cloud sync badge's
/// "Detalle de Error" box (`SyncService.lastSyncError`).
///
/// Source: `lib/data/services/sync_service.dart` — `triggerManualSync` error
/// composition. Only the exact discrete values that leak non-Spanish machine
/// tokens are mapped:
/// - `DEVICE_REVOKED`: auth message when `_syncBlockedReason` is
///   `DEVICE_REVOKED` (revoked sync credential).
/// - `AUTH_BLOCKED: …`: auth message when the sync credential is blocked
///   (HTTP 401/403). The exact literal is keyed so the `AUTH_BLOCKED:` code
///   prefix is dropped; the Spanish tail is preserved from the source. If
///   the source literal drifts, the map entry becomes inert (pass-through),
///   never wrong.
/// - `AuditLogs`, `Sales`, `Fulfillment`: English domain tokens added to
///   `domainErrors`. The other domain tokens (`Recetas`, `Compras`,
///   `Producción`, `Conteos físicos`, `Kardex`, `Movimientos de stock`,
///   `Catálogo`) are already Spanish and intentionally unmapped.
///
/// Composition semantics: `lastSyncError` may join several tokens with
/// `; ` (e.g. `AUTH_BLOCKED: …; Sales`) or carry an arbitrary exception
/// dump (`catch (e) { _lastSyncError = e.toString(); }`). Those composed /
/// free-text values do not match any key and pass through unchanged per the
/// [localize] convention — the detail box is diagnostic, so the raw detail
/// stays visible (D2/D6).
const Map<String, String> kSyncErrorLabels = <String, String>{
  'DEVICE_REVOKED': 'Dispositivo revocado por el servidor. Requiere reactivación.',
  'AUTH_BLOCKED: Reautenticación requerida con el servidor nube (HTTP 401/403)':
      'Reautenticación requerida con el servidor nube (HTTP 401/403)',
  'AuditLogs': 'Registros de auditoría',
  'Sales': 'Ventas',
  'Fulfillment': 'Preparación de pedidos',
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
  'kCountSessionStatusLabels': kCountSessionStatusLabels,
  'kForensicSeverityLabels': kForensicSeverityLabels,
  'kForensicAlertTypeLabels': kForensicAlertTypeLabels,
  'kForensicAlertStatusLabels': kForensicAlertStatusLabels,
  'kForensicMovementTypeLabels': kForensicMovementTypeLabels,
  'kVoidReasonLabels': kVoidReasonLabels,
  'kReprintReasonLabels': kReprintReasonLabels,
  'kSyncErrorLabels': kSyncErrorLabels,
  'kActivationBackendVerdictLabels': kActivationBackendVerdictLabels,
};

/// Returns the Spanish label for [code] from [labels], or [code] itself when
/// unknown. Never throws and never renders a placeholder: unknown codes pass
/// through unchanged so new backend codes stay visible instead of crashing.
String localize(String code, Map<String, String> labels) =>
    labels[code] ?? code;
