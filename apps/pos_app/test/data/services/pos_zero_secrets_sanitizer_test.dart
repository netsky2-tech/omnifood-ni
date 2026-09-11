import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/pos_zero_secrets_sanitizer.dart';

void main() {
  group('PosZeroSecretsSanitizer (ONB1.9F Security Guardrail)', () {
    test('redacts JWT tokens from values and strings', () {
      const fakeJwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      final payload = {
        'action': 'LOGIN_ATTEMPT',
        'authHeader': 'Bearer $fakeJwt',
        'directToken': fakeJwt,
      };

      final sanitized = PosZeroSecretsSanitizer.sanitize(payload) as Map<String, dynamic>;
      expect(sanitized['authHeader'], isNot(contains(fakeJwt)));
      expect(sanitized['authHeader'], contains('[REDACTED_JWT]'));
      expect(sanitized['directToken'], equals('[REDACTED_JWT]'));
    });

    test('redacts password, pin, totp and secret field names', () {
      final payload = {
        'username': 'carlos',
        'user_password': 'superSecretPassword123!',
        'pin_code': '1234',
        'totp': '987654',
        'apiKey': 'sk-live-abcdef123456',
      };

      final sanitized = PosZeroSecretsSanitizer.sanitize(payload) as Map<String, dynamic>;
      expect(sanitized['username'], equals('carlos'));
      expect(sanitized['user_password'], equals('[REDACTED_SECRET]'));
      expect(sanitized['pin_code'], equals('[REDACTED_PIN]'));
      expect(sanitized['totp'], equals('[REDACTED_PIN]'));
      expect(sanitized['apiKey'], equals('[REDACTED_SECRET]'));
    });

    test('redacts credit card numbers (PAN)', () {
      final payload = {
        'card': '4532015012345678',
        'text': 'Customer paid with card 5425233430109903 in cashier 1',
      };

      final sanitized = PosZeroSecretsSanitizer.sanitize(payload) as Map<String, dynamic>;
      expect(sanitized['card'], equals('[REDACTED_CARD]'));
      expect(sanitized['text'], contains('[REDACTED_CARD]'));
      expect(sanitized['text'], isNot(contains('5425233430109903')));
    });

    test('strips full raw CSV and replaces with metadata summary', () {
      const rawCsv =
          'barcode,name,sell_price,category\n7430001,Gaseosa 500ml,35.0,Bebidas\n7430002,Agua 600ml,20.0,Bebidas\n7430003,Snack,15.0,Snacks';

      final payload = {
        'filename': 'catalog.csv',
        'raw_csv': rawCsv,
      };

      final sanitized = PosZeroSecretsSanitizer.sanitize(payload) as Map<String, dynamic>;
      expect(sanitized['filename'], equals('catalog.csv'));
      expect(sanitized['raw_csv'], isNot(contains('Gaseosa 500ml')));
      expect(sanitized['raw_csv'], isA<Map<String, dynamic>>());
      final csvSummary = sanitized['raw_csv'] as Map<String, dynamic>;
      expect(csvSummary['redacted'], isTrue);
      expect(csvSummary['type'], equals('RAW_CSV_REDACTED'));
      expect(csvSummary['lineCount'], equals(4));
    });

    test('masks unnecessary PII such as plain text emails', () {
      final payload = {
        'contact': 'owner@pulperia-juana.com',
        'note': 'Report sent to accountant@empresa.ni yesterday',
      };

      final sanitized = PosZeroSecretsSanitizer.sanitize(payload) as Map<String, dynamic>;
      expect(sanitized['contact'], equals('o***r@pulperia-juana.com'));
      expect(sanitized['note'], contains('a***t@empresa.ni'));
      expect(sanitized['note'], isNot(contains('accountant@empresa.ni')));
    });

    test('triangulation: preserves legitimate numeric metrics, counts and boolean flags', () {
      final safePayload = {
        'stepId': 'ACTIVATION_CONTROLLED_SALE',
        'durationMs': 320,
        'counts': {'itemsCount': 2, 'paymentsCount': 1},
        'isSuccess': true,
      };

      final sanitized = PosZeroSecretsSanitizer.sanitize(safePayload) as Map<String, dynamic>;
      expect(sanitized, equals(safePayload));
    });
  });
}
