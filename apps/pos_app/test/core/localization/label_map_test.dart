import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/localization/label_map.dart';

/// Regression guard for the centralized label map.
///
/// Walks every family registered in [kAllLabelMaps], so a newly added family
/// is automatically guarded: adding a raw SCREAMING_CASE code as a "label"
/// value, or a blank key/value, fails here instead of leaking to the UI.
void main() {
  group('Label map - regression guard (every family in kAllLabelMaps)', () {
    final screamingCase = RegExp(r'^[A-Z][A-Z_]+$');

    test('registry is non-empty and every entry is a label family', () {
      expect(kAllLabelMaps, isNotEmpty);
      for (final entry in kAllLabelMaps.entries) {
        expect(entry.value, isA<Map<String, String>>(),
            reason: '${entry.key} must be a Map<String, String>');
      }
    });

    test('every key is non-empty and non-blank', () {
      for (final family in kAllLabelMaps.entries) {
        for (final key in family.value.keys) {
          expect(key.trim().isNotEmpty, isTrue,
              reason: '${family.key} has a blank key: "$key"');
        }
      }
    });

    test('every value is non-empty and trimmed', () {
      for (final family in kAllLabelMaps.entries) {
        for (final entry in family.value.entries) {
          expect(entry.value.trim().isNotEmpty, isTrue,
              reason:
                  '${family.key}[${entry.key}] has an empty or blank value');
          expect(entry.value, entry.value.trim(),
              reason:
                  '${family.key}[${entry.key}] value is not trimmed: "${entry.value}"');
        }
      }
    });

    test('no raw SCREAMING_CASE code leaks as a label value', () {
      for (final family in kAllLabelMaps.entries) {
        for (final entry in family.value.entries) {
          expect(screamingCase.hasMatch(entry.value), isFalse,
              reason:
                  '${family.key}[${entry.key}] looks like an untranslated '
                  'raw code: "${entry.value}"');
        }
      }
    });

    test('registry entries alias the exported family maps unchanged', () {
      expect(kAllLabelMaps['kActivationBlockerLabels'],
          same(kActivationBlockerLabels));
      expect(kAllLabelMaps['kActivationAttemptStatusLabels'],
          same(kActivationAttemptStatusLabels));
      expect(kAllLabelMaps['kActivationCheckStatusLabels'],
          same(kActivationCheckStatusLabels));
      expect(kAllLabelMaps['kActivationCheckCodeLabels'],
          same(kActivationCheckCodeLabels));
      expect(kAllLabelMaps['kActivationEvidenceRefLabels'],
          same(kActivationEvidenceRefLabels));
      expect(kAllLabelMaps['kPaymentMethodLabels'], same(kPaymentMethodLabels));
      expect(kAllLabelMaps['kUserRoleLabels'], same(kUserRoleLabels));
      expect(kAllLabelMaps['kVoidReasonLabels'], same(kVoidReasonLabels));
      expect(kAllLabelMaps['kReprintReasonLabels'], same(kReprintReasonLabels));
      expect(kAllLabelMaps['kCountSessionStatusLabels'],
          same(kCountSessionStatusLabels));
      expect(kAllLabelMaps['kForensicSeverityLabels'],
          same(kForensicSeverityLabels));
      expect(kAllLabelMaps['kForensicAlertTypeLabels'],
          same(kForensicAlertTypeLabels));
      expect(kAllLabelMaps['kForensicAlertStatusLabels'],
          same(kForensicAlertStatusLabels));
      expect(kAllLabelMaps['kForensicMovementTypeLabels'],
          same(kForensicMovementTypeLabels));
      expect(kAllLabelMaps['kSyncErrorLabels'], same(kSyncErrorLabels));
      expect(kAllLabelMaps['kActivationBackendVerdictLabels'],
          same(kActivationBackendVerdictLabels));
    });
  });

  group('Label map - localize fallback convention', () {
    test('unknown code returns the code unchanged (pass-through)', () {
      expect(localize('TOTALLY_UNKNOWN_CODE', kActivationBlockerLabels),
          'TOTALLY_UNKNOWN_CODE');
      expect(localize('', kPaymentMethodLabels), '');
      expect(localize('not_in_map', kUserRoleLabels), 'not_in_map');
    });

    test('known code returns the mapped Spanish label', () {
      expect(localize('NO_ACTIVE_ATTEMPT', kActivationBlockerLabels),
          'No hay un intento de activación en curso.');
      expect(localize('PASS', kActivationCheckStatusLabels), 'Aprobado');
      expect(localize('cash', kPaymentMethodLabels), 'Efectivo');
      expect(localize('waiter', kUserRoleLabels), 'Mesero');
      expect(localize('RECEIPT_PRINTED_OK', kActivationEvidenceRefLabels),
          'Ticket impreso correctamente');
      expect(localize('ERROR_DE_CAPTURA', kVoidReasonLabels),
          'Error de captura');
      expect(localize('TICKET_DUPLICADO', kVoidReasonLabels),
          'Ticket duplicado');
      expect(localize('PAPEL_ATASCADO', kReprintReasonLabels),
          'Papel atascado');
      expect(localize('CLIENTE_PERDIO_TICKET', kReprintReasonLabels),
          'El cliente perdió su ticket');
      expect(localize('open', kCountSessionStatusLabels), 'Abierta');
      expect(localize('approval_pending', kCountSessionStatusLabels),
          'Pendiente de aprobación');
      expect(localize('posted', kCountSessionStatusLabels), 'Aplicada');
      expect(localize('critical', kForensicSeverityLabels), 'Crítica');
      expect(localize('high', kForensicSeverityLabels), 'Alta');
      expect(localize('LOW_STOCK', kForensicAlertTypeLabels), 'Stock bajo');
      expect(localize('MANUAL_STOCK_ALTERATION', kForensicAlertTypeLabels),
          'Alteración manual de stock');
      expect(localize('AUDIT_BACKEND_TERMINAL_REJECTION',
          kForensicAlertTypeLabels), 'Rechazo del backend de auditoría');
      expect(localize('acknowledged', kForensicAlertStatusLabels),
          'Reconocida');
      expect(localize('superseded', kForensicAlertStatusLabels),
          'Reemplazada');
      expect(localize('LOW_STOCK_THRESHOLD', kForensicMovementTypeLabels),
          'Umbral de stock bajo');
      expect(localize('MANUAL_STOCK_ALTERATION', kForensicMovementTypeLabels),
          'Alteración manual de stock');
      // Sync error codes (issue #587 item 22): exact discrete values emitted
      // by SyncService.triggerManualSync / domainErrors composition.
      expect(localize('DEVICE_REVOKED', kSyncErrorLabels),
          'Dispositivo revocado por el servidor. Requiere reactivación.');
      expect(
          localize(
              'AUTH_BLOCKED: Reautenticación requerida con el servidor nube (HTTP 401/403)',
              kSyncErrorLabels),
          'Reautenticación requerida con el servidor nube (HTTP 401/403)');
      expect(localize('AuditLogs', kSyncErrorLabels), 'Registros de auditoría');
      expect(localize('Sales', kSyncErrorLabels), 'Ventas');
      expect(localize('Fulfillment', kSyncErrorLabels),
          'Preparación de pedidos');
    });

    test('sync error composition and exception dumps pass through unchanged', () {
      // Composed summaries (auth message joined with domain tokens) and
      // arbitrary e.toString() dumps have no single-code key: they render
      // verbatim per the localize fallback convention (D2/D6).
      expect(
        localize(
            'AUTH_BLOCKED: Reautenticación requerida con el servidor nube (HTTP 401/403); Sales',
            kSyncErrorLabels),
        'AUTH_BLOCKED: Reautenticación requerida con el servidor nube (HTTP 401/403); Sales',
      );
      expect(localize('AuditLogs; Sales', kSyncErrorLabels),
          'AuditLogs; Sales');
      expect(localize('Exception: network dropped', kSyncErrorLabels),
          'Exception: network dropped');
    });

    test('count session statuses are exhaustive against CountSessionStatus', () {
      // All lifecycle statuses defined by the CountSessionStatus vocabulary
      // (lib/domain/models/inventory/count_session_document.dart).
      expect(
        kCountSessionStatusLabels.keys.toList(),
        [
          'draft',
          'open',
          'counting',
          'recount',
          'approval_pending',
          'approved',
          'posted',
          'closed',
        ],
      );
    });

    test('void and reprint reason families are separate maps sharing OTRO', () {
      // D-15/#525 and D-13/#547 controlled lists: exhaustive codes from
      // VoidReasonCodes.all and ReprintReasonCodes.all.
      expect(kVoidReasonLabels.keys.toList(),
          ['ERROR_DE_CAPTURA', 'CLIENTE_DESISTE', 'TICKET_DUPLICADO', 'OTRO']);
      expect(kReprintReasonLabels.keys.toList(),
          ['PAPEL_ATASCADO', 'CLIENTE_PERDIO_TICKET', 'VERIFICACION', 'OTRO']);
      expect(identical(kVoidReasonLabels, kReprintReasonLabels), isFalse);
    });

    test('backend verdict statuses reuse the check status labels', () {
      expect(localize('PASS_WITH_WARNING', kActivationBackendVerdictLabels),
          'Aprobado con advertencia');
      expect(localize('NETWORK_ERROR', kActivationBackendVerdictLabels),
          'Error de red');
    });
  });
}
