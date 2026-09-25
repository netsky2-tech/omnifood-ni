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
    });

    test('backend verdict statuses reuse the check status labels', () {
      expect(localize('PASS_WITH_WARNING', kActivationBackendVerdictLabels),
          'Aprobado con advertencia');
      expect(localize('NETWORK_ERROR', kActivationBackendVerdictLabels),
          'Error de red');
    });
  });
}
