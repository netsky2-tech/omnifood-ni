import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/loyalty/customer_code.dart';

void main() {
  group('CustomerIdentificationPort — Contract', () {
    test('IdentificationMethod enum covers all required adapters', () {
      expect(IdentificationMethod.values, containsAll([
        IdentificationMethod.qr,
        IdentificationMethod.customerCode,
        IdentificationMethod.phone,
        IdentificationMethod.search,
      ]));
      expect(IdentificationMethod.values.length, 4);
    });

    test('CustomerIdentificationResult preserves customer and method', () {
      const customer = Customer(id: 'c1', name: 'Carlos');
      const result = CustomerIdentificationResult(
        customer: customer,
        method: IdentificationMethod.qr,
      );

      expect(result.customer, customer);
      expect(result.method, IdentificationMethod.qr);
    });

    test('CustomerIdentificationResult equality by customer + method', () {
      const c1 = Customer(id: 'c1', name: 'Carlos');
      const c2 = Customer(id: 'c2', name: 'Ana');
      const r1 = CustomerIdentificationResult(customer: c1, method: IdentificationMethod.qr);
      const r2 = CustomerIdentificationResult(customer: c1, method: IdentificationMethod.qr);
      const r3 = CustomerIdentificationResult(customer: c1, method: IdentificationMethod.phone);
      const r4 = CustomerIdentificationResult(customer: c2, method: IdentificationMethod.qr);

      expect(r1, equals(r2));
      expect(r1, isNot(equals(r3)));
      expect(r1, isNot(equals(r4)));
    });
  });

  group('CustomerCode — QR payload decoding', () {
    test('fromQrPayload decodes valid NHL1: prefix', () {
      final code = CustomerCode.generate();
      final payload = code.qrPayload;

      final decoded = CustomerCode.fromQrPayload(payload);
      expect(decoded, isNotNull);
      expect(decoded, equals(code));
    });

    test('fromQrPayload returns null for invalid prefix', () {
      expect(CustomerCode.fromQrPayload('INVALID:code'), isNull);
      expect(CustomerCode.fromQrPayload(''), isNull);
      expect(CustomerCode.fromQrPayload('NHL1:'), isNull);
    });

    test('fromQrPayload returns null for invalid Crockford chars', () {
      expect(CustomerCode.fromQrPayload('NHL1:ILOU'), isNull);
    });

    test('CustomerCode normalizes to uppercase', () {
      final code = CustomerCode('abc123');
      expect(code.value, 'ABC123');
    });

    test('CustomerCode rejects empty string', () {
      expect(() => CustomerCode(''), throwsArgumentError);
    });

    test('CustomerCode rejects invalid Crockford characters', () {
      expect(() => CustomerCode('ILOU'), throwsArgumentError);
    });

    test('CustomerCode.generate produces correct length', () {
      final code = CustomerCode.generate(length: 16);
      expect(code.value.length, 16);
    });

    test('CustomerCode equality by value', () {
      final c1 = CustomerCode('ABC123');
      final c2 = CustomerCode('ABC123');
      final c3 = CustomerCode('DEF456');

      expect(c1, equals(c2));
      expect(c1, isNot(equals(c3)));
    });

    test('CustomerCode qrPayload format is NHL1:{code}', () {
      final code = CustomerCode('XYZ789');
      expect(code.qrPayload, 'NHL1:XYZ789');
    });
  });
}
