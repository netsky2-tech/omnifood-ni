import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/design_system/nhilos_tokens.dart';

void main() {
  group('NhilosColors — Standard §42.1 Paleta Cromática Unificada', () {
    test('verifies exact primary brand and background tokens', () {
      expect(NhilosColors.background, const Color(0xFFF8FAFC)); // Slate 50
      expect(NhilosColors.surface, const Color(0xFFFFFFFF));
      expect(NhilosColors.border, const Color(0xFFE2E8F0)); // Slate 200
      expect(NhilosColors.borderStrong, const Color(0xFFCBD5E1)); // Slate 300
      expect(NhilosColors.textPrimary, const Color(0xFF0F172A)); // Slate 900
      expect(NhilosColors.textSecondary, const Color(0xFF64748B)); // Slate 500
      expect(NhilosColors.brandPrimary, const Color(0xFF1E3A40)); // Deep Teal
      expect(NhilosColors.brandNavy, const Color(0xFF0F292E)); // Navy
    });

    test('verifies status tokens (Emerald 600, Red 600, Amber 600)', () {
      expect(NhilosColors.success, const Color(0xFF059669));
      expect(NhilosColors.danger, const Color(0xFFDC2626));
      expect(NhilosColors.warning, const Color(0xFFD97706));
    });

    test('prohibits legacy brown (#795548) and indigo (#3949AB)', () {
      const brown = Color(0xFF795548);
      const indigo = Color(0xFF3949AB);

      expect(NhilosColors.brandPrimary, isNot(equals(brown)));
      expect(NhilosColors.brandPrimary, isNot(equals(indigo)));
      expect(NhilosColors.border, isNot(equals(brown)));
      expect(NhilosColors.danger, isNot(equals(brown)));
    });
  });

  group('NhilosRadii — Standard §42.7 Radios Estandarizados', () {
    test('verifies 12dp for cards/modals, 8dp for buttons/chips, 4dp for badges', () {
      expect(NhilosRadii.card, 12.0);
      expect(NhilosRadii.modal, 12.0);
      expect(NhilosRadii.button, 8.0);
      expect(NhilosRadii.chip, 8.0);
      expect(NhilosRadii.badge, 4.0);
    });
  });

  group('NhilosTextStyles — Standard §34.1 Números Tabulares Obligatorios', () {
    test('tabular helper adds tabular figures font feature', () {
      final style = NhilosTextStyles.tabular();
      expect(
        style.fontFeatures,
        contains(const FontFeature.tabularFigures()),
      );
    });
  });
}
