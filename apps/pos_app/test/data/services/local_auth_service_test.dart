import 'package:flutter_test/flutter_test.dart';
import 'package:otp/otp.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

void main() {
  late LocalAuthService localAuthService;

  setUp(() {
    localAuthService = LocalAuthService();
  });

  group('LocalAuthService - PIN Validation', () {
    test('should return true when PIN matches the hash', () {
      const pin = '1234';
      final hash = localAuthService.hashPin(pin);

      final result = localAuthService.verifyPin(pin, hash);

      expect(result, isTrue);
    });

    test('should return false when PIN does not match the hash', () {
      const pin = '1234';
      const wrongPin = '4321';
      final hash = localAuthService.hashPin(pin);

      final result = localAuthService.verifyPin(wrongPin, hash);

      expect(result, isFalse);
    });

    test('should return false when hash is invalid', () {
      const pin = '1234';
      const invalidHash = 'not-a-hash';

      final result = localAuthService.verifyPin(pin, invalidHash);

      expect(result, isFalse);
    });
  });

  group('LocalAuthService - TOTP Validation', () {
    test('should validate current TOTP code', () {
      const secretSeed = 'JBSWY3DPEHPK3PXP';
      final now = DateTime.now().millisecondsSinceEpoch;
      final code = OTP.generateTOTPCodeString(
        secretSeed,
        now,
        algorithm: Algorithm.SHA1,
        isGoogle: true,
      );

      final result = localAuthService.verifyTotp(code, secretSeed);

      expect(result, isTrue);
    });

    test('should accept TOTP code with surrounding whitespace', () {
      const secretSeed = 'JBSWY3DPEHPK3PXP';
      final now = DateTime.now().millisecondsSinceEpoch;
      final code = OTP.generateTOTPCodeString(
        secretSeed,
        now,
        algorithm: Algorithm.SHA1,
        isGoogle: true,
      );

      final result = localAuthService.verifyTotp('  $code  ', secretSeed);

      expect(result, isTrue);
    });

    test('should reject malformed TOTP code', () {
      const secretSeed = 'JBSWY3DPEHPK3PXP';

      final result = localAuthService.verifyTotp('12AB', secretSeed);

      expect(result, isFalse);
    });
  });
}
