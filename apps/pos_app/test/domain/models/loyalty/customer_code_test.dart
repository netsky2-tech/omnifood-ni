import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/customer_code.dart';

void main() {
  group('CustomerCode — Value Object', () {
    group('normalization', () {
      test('normaliza a uppercase', () {
        final code = CustomerCode('abc123def');
        expect(code.value, equals('ABC123DEF'));
      });

      test('preserva caracteres Crockford Base32 válidos', () {
        final code = CustomerCode('A1B2C3D4E5');
        expect(code.value, equals('A1B2C3D4E5'));
      });

      test('rechaza string vacío', () {
        expect(() => CustomerCode(''), throwsArgumentError);
      });

      test('rechaza string con solo espacios', () {
        expect(() => CustomerCode('   '), throwsArgumentError);
      });

      test('rechaza caracteres fuera de Crockford Base32', () {
        // O -> mapped to 0, I -> mapped to 1, L -> mapped to 1 (transcription)
        // U is excluded entirely from Crockford Base32
        expect(() => CustomerCode('U123'), throwsArgumentError);
        expect(() => CustomerCode('Z1!3'), throwsArgumentError);
        expect(() => CustomerCode('ABC@'), throwsArgumentError);
      });
    });

    group('QR payload', () {
      test('genera payload NHL1:{code}', () {
        final code = CustomerCode('ABC123');
        expect(code.qrPayload, equals('NHL1:ABC123'));
      });

      test('decodifica payload NHL1 válido', () {
        final result = CustomerCode.fromQrPayload('NHL1:ABC123');
        expect(result, isNotNull);
        expect(result!.value, equals('ABC123'));
      });

      test('decodifica payload con minúsculas', () {
        final result = CustomerCode.fromQrPayload('NHL1:abc123');
        expect(result, isNotNull);
        expect(result!.value, equals('ABC123'));
      });

      test('retorna null para payload NHL1 inválido', () {
        expect(CustomerCode.fromQrPayload('INVALID'), isNull);
        expect(CustomerCode.fromQrPayload('NHL2:ABC'), isNull);
        expect(CustomerCode.fromQrPayload(''), isNull);
        expect(CustomerCode.fromQrPayload('NHL1:'), isNull);
      });
    });

    group('equality', () {
      test('mismo valor son iguales', () {
        expect(CustomerCode('ABC123'), equals(CustomerCode('ABC123')));
      });

      test('diferente valor no son iguales', () {
        expect(CustomerCode('ABC123'), isNot(equals(CustomerCode('XYZ789'))));
      });

      test('case insensitive después de normalización', () {
        expect(CustomerCode('abc123'), equals(CustomerCode('ABC123')));
      });
    });

    group('PII safety', () {
      test('no contiene phone, taxId, email en el código', () {
        final code = CustomerCode.generate();
        // Crockford Base32: 0-9, A-H, J-K, M-N, P-T, V-W, X-Z (no I, L, O, U)
        expect(code.value, isNot(contains(RegExp(r'[U]'))));
        // El código es opaco, no secuencial
        expect(code.value.length, greaterThanOrEqualTo(16));
      });
    });

    group('generación offline', () {
      test('genera código de al menos 16 caracteres', () {
        final code = CustomerCode.generate();
        expect(code.value.length, greaterThanOrEqualTo(16));
      });

      test('genera códigos únicos en sucesión', () {
        final codes = List.generate(100, (_) => CustomerCode.generate());
        final uniqueCodes = codes.map((c) => c.value).toSet();
        expect(uniqueCodes.length, equals(100));
      });
    });
  });
}
