import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/loyalty/customer_code.dart';
import 'package:pos_app/domain/ports/customer_identification_port.dart';

/// Fake data source that simulates customer lookup from Floor DAO.
class FakeCustomerDataSource {
  final Map<String, Customer> _byId = {};
  final Map<String, Customer> _byPhone = {};
  final Map<String, Customer> _byCode = {};
  final List<Customer> _allCustomers;

  FakeCustomerDataSource(this._allCustomers) {
    for (final c in _allCustomers) {
      _byId[c.id] = c;
      if (c.phone != null) _byPhone[c.phone!] = c;
      if (c.customerCode != null) _byCode[c.customerCode!] = c;
    }
  }

  Future<Customer?> getById(String id) async => _byId[id];
  Future<Customer?> getByPhone(String phone) async => _byPhone[phone];
  Future<Customer?> getByCode(String code) async => _byCode[code];
  Future<List<Customer>> search(String query, int limit) async {
    final q = query.toLowerCase();
    return _allCustomers
        .where((c) =>
            c.isActive &&
            (c.name.toLowerCase().contains(q) ||
                (c.taxId?.toLowerCase().contains(q) ?? false) ||
                (c.phone?.toLowerCase().contains(q) ?? false)))
        .take(limit)
        .toList();
  }
}

/// Adapter: identifies customer by scanning QR payload.
class QrIdentificationAdapter implements CustomerIdentificationPort {
  final FakeCustomerDataSource _dataSource;

  QrIdentificationAdapter(this._dataSource);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final code = CustomerCode.fromQrPayload(input);
    if (code == null) return null;

    final customer = await _dataSource.getByCode(code.value);
    if (customer == null || !customer.isActive) return null;

    return CustomerIdentificationResult(
      customer: customer,
      method: IdentificationMethod.qr,
    );
  }
}

/// Adapter: identifies customer by manual customer code entry.
class CustomerCodeIdentificationAdapter implements CustomerIdentificationPort {
  final FakeCustomerDataSource _dataSource;

  CustomerCodeIdentificationAdapter(this._dataSource);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;

    try {
      final code = CustomerCode(trimmed);
      final customer = await _dataSource.getByCode(code.value);
      if (customer == null || !customer.isActive) return null;

      return CustomerIdentificationResult(
        customer: customer,
        method: IdentificationMethod.customerCode,
      );
    } catch (_) {
      return null;
    }
  }
}

/// Adapter: identifies customer by phone number.
class PhoneIdentificationAdapter implements CustomerIdentificationPort {
  final FakeCustomerDataSource _dataSource;

  PhoneIdentificationAdapter(this._dataSource);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final phone = input.trim();
    if (phone.isEmpty) return null;

    final customer = await _dataSource.getByPhone(phone);
    if (customer == null || !customer.isActive) return null;

    return CustomerIdentificationResult(
      customer: customer,
      method: IdentificationMethod.phone,
    );
  }
}

/// Adapter: identifies customer by text search across name/taxId/phone.
class SearchIdentificationAdapter implements CustomerIdentificationPort {
  final FakeCustomerDataSource _dataSource;

  SearchIdentificationAdapter(this._dataSource);

  @override
  Future<CustomerIdentificationResult?> identify(String input) async {
    final query = input.trim();
    if (query.isEmpty) return null;

    final results = await _dataSource.search(query, 1);
    if (results.isEmpty) return null;

    return CustomerIdentificationResult(
      customer: results.first,
      method: IdentificationMethod.search,
    );
  }
}

void main() {
  final carlos = Customer(
    id: 'c1',
    name: 'Carlos Pérez',
    phone: '88881234',
    taxId: '0010203040001',
    customerCode: 'ABC123XYZ789',
    isActive: true,
  );
  final ana = Customer(
    id: 'c2',
    name: 'Ana López',
    phone: '88885678',
    taxId: '0010203040002',
    customerCode: 'DEF456TXYZ321',
    isActive: true,
  );
  final inactivo = Customer(
    id: 'c3',
    name: 'Inactivo',
    phone: '99990000',
    customerCode: 'INAC12345678',
    isActive: false,
  );

  final dataSource = FakeCustomerDataSource([carlos, ana, inactivo]);

  group('QrIdentificationAdapter — Triangulación', () {
    late QrIdentificationAdapter adapter;

    setUp(() {
      adapter = QrIdentificationAdapter(dataSource);
    });

    test('identifica customer por QR payload válido NHL1:{code}', () async {
      final result = await adapter.identify('NHL1:ABC123XYZ789');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.qr);
    });

    test('retorna null para QR payload con prefix inválido', () async {
      expect(await adapter.identify('INVALID:ABC123XYZ789'), isNull);
    });

    test('retorna null para QR payload sin customer asociado', () async {
      expect(await adapter.identify('NHL1:ZZZZZZZZZZZZ'), isNull);
    });

    test('retorna null para customer inactivo', () async {
      expect(await adapter.identify('NHL1:INAC12345678'), isNull);
    });

    test('retorna null para input vacío', () async {
      expect(await adapter.identify(''), isNull);
    });
  });

  group('CustomerCodeIdentificationAdapter — Triangulación', () {
    late CustomerCodeIdentificationAdapter adapter;

    setUp(() {
      adapter = CustomerCodeIdentificationAdapter(dataSource);
    });

    test('identifica customer por código manual válido', () async {
      final result = await adapter.identify('ABC123XYZ789');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.customerCode);
    });

    test('normaliza código a mayúsculas', () async {
      final result = await adapter.identify('abc123xyz789');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
    });

    test('retorna null para código inexistente', () async {
      expect(await adapter.identify('ZZZZZZZZ'), isNull);
    });

    test('retorna null para código con caracteres ILOU inválidos', () async {
      expect(await adapter.identify('ILOU'), isNull);
    });

    test('retorna null para input vacío', () async {
      expect(await adapter.identify(''), isNull);
    });

    test('retorna null para whitespace solo', () async {
      expect(await adapter.identify('   '), isNull);
    });
  });

  group('PhoneIdentificationAdapter — Triangulación', () {
    late PhoneIdentificationAdapter adapter;

    setUp(() {
      adapter = PhoneIdentificationAdapter(dataSource);
    });

    test('identifica customer por teléfono existente', () async {
      final result = await adapter.identify('88881234');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.phone);
    });

    test('retorna null para teléfono inexistente', () async {
      expect(await adapter.identify('00000000'), isNull);
    });

    test('retorna null para customer inactivo', () async {
      expect(await adapter.identify('99990000'), isNull);
    });

    test('retorna null para input vacío', () async {
      expect(await adapter.identify(''), isNull);
    });

    test('trimea whitespace del teléfono', () async {
      final result = await adapter.identify('  88881234  ');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
    });
  });

  group('SearchIdentificationAdapter — Triangulación', () {
    late SearchIdentificationAdapter adapter;

    setUp(() {
      adapter = SearchIdentificationAdapter(dataSource);
    });

    test('encuentra customer por nombre', () async {
      final result = await adapter.identify('Carlos');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c1');
      expect(result.method, IdentificationMethod.search);
    });

    test('encuentra customer por taxId', () async {
      final result = await adapter.identify('0010203040002');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c2');
    });

    test('encuentra customer por teléfono via search', () async {
      final result = await adapter.identify('88885678');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c2');
    });

    test('retorna null para query sin resultados', () async {
      expect(await adapter.identify('XYZNOEXISTE'), isNull);
    });

    test('retorna null para input vacío', () async {
      expect(await adapter.identify(''), isNull);
    });

    test('no retorna customers inactivos', () async {
      expect(await adapter.identify('Inactivo'), isNull);
    });

    test('retorna primer resultado por relevancia', () async {
      final result = await adapter.identify('Ana');
      expect(result, isNotNull);
      expect(result!.customer.id, 'c2');
    });
  });

  group('Port polymorphism — todos los adaptadores son intercambiables', () {
    test('se pueden guardar en una lista como CustomerIdentificationPort', () {
      final List<CustomerIdentificationPort> adapters = [
        QrIdentificationAdapter(dataSource),
        CustomerCodeIdentificationAdapter(dataSource),
        PhoneIdentificationAdapter(dataSource),
        SearchIdentificationAdapter(dataSource),
      ];

      expect(adapters.length, 4);
      for (final adapter in adapters) {
        expect(adapter, isA<CustomerIdentificationPort>());
      }
    });

    test('el mismo input puede ser intentado por múltiples adaptadores', () async {
      final adapters = <CustomerIdentificationPort>[
        QrIdentificationAdapter(dataSource),
        CustomerCodeIdentificationAdapter(dataSource),
        PhoneIdentificationAdapter(dataSource),
        SearchIdentificationAdapter(dataSource),
      ];

      // Try QR first, then fallback to others
      CustomerIdentificationResult? result;
      for (final adapter in adapters) {
        result = await adapter.identify('NHL1:ABC123XYZ789');
        if (result != null) break;
      }

      expect(result, isNotNull);
      expect(result!.method, IdentificationMethod.qr);
    });
  });
}
