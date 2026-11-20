import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/hardware_fingerprint_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const validUpperHex =
      'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';
  const validLowerHex =
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  group('HardwareFingerprintService', () {
    const channel = MethodChannel(HardwareFingerprintService.channelName);

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });

    test('reads valid 64-char SHA-256 hex from platform channel and normalizes '
        'to lowercase', () async {
      String? invokedMethod;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (MethodCall call) async {
        invokedMethod = call.method;
        return '  $validUpperHex  ';
      });

      final service = HardwareFingerprintService(channel: channel);
      final result = await service.getHardwareFingerprint();

      expect(invokedMethod, HardwareFingerprintService.methodName);
      expect(result, validLowerHex);
    });

    test('returns null safely on MissingPluginException', () async {
      final service = HardwareFingerprintService(
        provider: () async => throw MissingPluginException('not implemented'),
      );

      expect(await service.getHardwareFingerprint(), isNull);
    });

    test('returns null safely on PlatformException', () async {
      final service = HardwareFingerprintService(
        provider: () async => throw PlatformException(code: 'UNAVAILABLE'),
      );

      expect(await service.getHardwareFingerprint(), isNull);
    });

    test('rejects invalid or non-64-char-hex payloads (including raw ANDROID_ID)',
        () async {
      final invalidValues = <String?>[
        null,
        '',
        '   ',
        '9774d56d682e549c', // 16-char raw ANDROID_ID must never be accepted
        'a' * 63,
        'a' * 65,
        'g' * 64,
        'not-a-hex-hash',
      ];

      for (final raw in invalidValues) {
        final service = HardwareFingerprintService(provider: () async => raw);
        expect(
          await service.getHardwareFingerprint(),
          isNull,
          reason: 'Expected "$raw" to be rejected',
        );
      }
    });
  });
}
