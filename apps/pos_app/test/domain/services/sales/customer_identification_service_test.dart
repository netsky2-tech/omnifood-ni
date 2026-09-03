import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/loyalty/customer_code.dart';
import 'package:pos_app/domain/ports/customer_identification_port.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';

/// In-memory customer store for integration testing.
class InMemoryCustomerStore {
  final Map<String, Customer> _byCode = {};
  final Map<String, Customer> _byPhone = {};
  final List<Customer> _all = [];

  void add(Customer customer) {
    _all.add(customer);
    if (customer.customerCode != null) {
      _byCode[customer.customerCode!] = customer;
    }
    if (customer.phone != null) {
      _byPhone[customer.phone!] = customer;
    }
  }

  Customer? findByCode(String code) => _byCode[code];
  Customer? findByPhone(String phone) => _byPhone[phone];
  List<Customer> search(String query) {
    final q = query.toLowerCase();
    return _all
        .where((c) =>
            c.isActive &&
            (c.name.toLowerCase().contains(q) ||
                (c.taxId?.toLowerCase().contains(q) ?? false) ||
                (c.phone?.toLowerCase().contains(q) ?? false)))
        .toList();
  }
}

/// Real adapters using InMemoryCustomerStore (simulates Floor DAO).
class TestQrAdapter implements CustomerIdentificationPort {
  final InMemoryCustomerStore _store;
  TestQrAdapter(this._store);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final code = CustomerCode.fromQrPayload(input);
    if (code == null) return null;
    final customer = _store.findByCode(code.value);
    if (customer == null || !customer.isActive) return null;
    return CustomerIdentificationResult(
        customer: customer, method: IdentificationMethod.qr);
  }
}

class TestCustomerCodeAdapter implements CustomerIdentificationPort {
  final InMemoryCustomerStore _store;
  TestCustomerCodeAdapter(this._store);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;
    try {
      final code = CustomerCode(trimmed);
      final customer = _store.findByCode(code.value);
      if (customer == null || !customer.isActive) return null;
      return CustomerIdentificationResult(
          customer: customer, method: IdentificationMethod.customerCode);
    } catch (_) {
      return null;
    }
  }
}

class TestPhoneAdapter implements CustomerIdentificationPort {
  final InMemoryCustomerStore _store;
  TestPhoneAdapter(this._store);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final phone = input.trim();
    if (phone.isEmpty) return null;
    final customer = _store.findByPhone(phone);
    if (customer == null || !customer.isActive) return null;
    return CustomerIdentificationResult(
        customer: customer, method: IdentificationMethod.phone);
  }
}

class TestSearchAdapter implements CustomerIdentificationPort {
  final InMemoryCustomerStore _store;
  TestSearchAdapter(this._store);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final query = input.trim();
    if (query.isEmpty) return null;
    final results = _store.search(query);
    if (results.isEmpty) return null;
    return CustomerIdentificationResult(
        customer: results.first, method: IdentificationMethod.search);
  }
}

void main() {
  late InMemoryCustomerStore store;
  late CustomerIdentificationService service;

  setUp(() {
    store = InMemoryCustomerStore();
    store.add(const Customer(
      id: 'c1',
      name: 'Carlos Pérez',
      phone: '88881234',
      taxId: '0010203040001',
      customerCode: 'ABC123XYZ789',
      isActive: true,
    ));
    store.add(const Customer(
      id: 'c2',
      name: 'Ana López',
      phone: '88885678',
      taxId: '0010203040002',
      customerCode: 'DEF456TXYZ321',
      isActive: true,
    ));

    service = CustomerIdentificationService([
      TestQrAdapter(store),
      TestCustomerCodeAdapter(store),
      TestPhoneAdapter(store),
      TestSearchAdapter(store),
    ]);
  });

  group('CustomerIdentificationService — Integración', () {
    test('identifica por QR en el primer intento', () async {
      final result = await service.identify('NHL1:ABC123XYZ789');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.qr);
    });

    test('identifica por código manual cuando QR falla', () async {
      // Input that's not a valid QR payload but is a valid customer code
      final result = await service.identify('ABC123XYZ789');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.customerCode);
    });

    test('identifica por teléfono cuando QR y código fallan', () async {
      final result = await service.identify('88885678');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c2');
      expect(result.method, IdentificationMethod.phone);
    });

    test('identifica por búsqueda como último recurso', () async {
      final result = await service.identify('Carlos');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.search);
    });

    test('retorna null cuando ningún adaptador encuentra el customer', () async {
      expect(await service.identify('NOEXISTE'), isNull);
    });

    test('retorna null para input vacío', () async {
      expect(await service.identify(''), isNull);
      expect(await service.identify('   '), isNull);
    });

    test('usa adaptador específico con identifyWith', () async {
      // Use the same adapter that the service already has
      final result = await service.identifyWith(
        TestQrAdapter(store),
        'NHL1:DEF456TXYZ321',
      );
      expect(result, isNotNull);
      expect(result!.customer.id, 'c2');
      expect(result.method, IdentificationMethod.qr);
    });

    test('fallback completo: QR → code → phone → search', () async {
      // Input that doesn't match any adapter
      final result = await service.identify('ZZZZZZZZ');
      // Should fall through all adapters
      expect(result, isNull);
    });
  });

  group('CustomerIdentificationService — Fallback chain real', () {
    test('prioriza QR sobre código cuando ambos coinciden', () async {
      // QR payload contains the code, so QR adapter should match first
      final result = await service.identify('NHL1:ABC123XYZ789');
      expect(result!.method, IdentificationMethod.qr);
    });

    test('cae a búsqueda cuando teléfono no tiene match exacto', () async {
      // Partial phone number → won't match getByPhone, but will match search
      final result = await service.identify('8888');
      expect(result, isNotNull);
      expect(result!.method, IdentificationMethod.search);
    });
  });
}
