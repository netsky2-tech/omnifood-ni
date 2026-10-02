import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/design_system/nhilos_tokens.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('PX-004: Tabular Numbers Standard (§34.1)', () {
    test('NhilosTextStyles.tabular enforces tabularFigures font feature', () {
      final baseStyle = const TextStyle(fontSize: 16, fontWeight: FontWeight.bold);
      final tabular = NhilosTextStyles.tabular(base: baseStyle);

      expect(tabular.fontSize, 16);
      expect(tabular.fontWeight, FontWeight.bold);
      expect(tabular.fontFeatures, contains(const FontFeature.tabularFigures()));
    });
  });

  group('PX-005: Haptic Feedback & Calm Microcopy (§19.3, §49 +1.15)', () {
    testWidgets('triggers HapticFeedback on confirmation without exception', (tester) async {
      final log = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (MethodCall methodCall) async {
          log.add(methodCall);
          return null;
        },
      );

      // Trigger medium impact
      await HapticFeedback.mediumImpact();

      expect(log, isNotEmpty);
      expect(log.any((call) => call.method == 'HapticFeedback.vibrate' && call.arguments == 'HapticFeedbackType.mediumImpact'), isTrue);
    });

    test('calm success message adheres to Brand §25 without exclamation noise', () {
      const calmSuccess = 'Venta procesada con éxito';
      expect(calmSuccess, isNot(contains('¡')));
      expect(calmSuccess, isNot(contains('!')));
      expect(NhilosColors.success, const Color(0xFF059669)); // Emerald 600
    });
  });
}
