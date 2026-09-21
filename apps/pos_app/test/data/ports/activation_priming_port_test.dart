import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/ports/activation_priming_port.dart';

void main() {
  Map<String, dynamic> validPayload() =>
      <String, dynamic>{
        'status': 'success',
        'serverTime': '2026-09-21T10:00:00.000Z',
        'currentVersion': 7,
        'deltas': <String, dynamic>{
          'products': <Map<String, dynamic>>[
            {
              'id': 'prod-uuid-1',
              'name': 'Gallo Pinto Tradicional',
              'uom': 'PLATO',
              'stock': 10,
              'averageCost': 40,
              'sellPrice': 75,
              'isActive': true,
              'productType': 'SIMPLE',
              'createdAt': '2026-09-21T09:00:00.000Z',
              'tenantId': 'tenant-founder-01',
            },
          ],
          'catalogValues': [
            {
              'id': 'cat-1',
              'catalogType': 'UOM',
              'code': 'PLATO',
              'name': 'Plato',
              'isActive': true,
              'sortOrder': 1,
            },
          ],
          'fiscalConfig': {
            'tenantId': 'tenant-founder-01',
            'businessName': 'Fonda La Patrona',
            'fiscalRegime': 'RIM',
            'configVersion': {
              'revision': 3,
              'fingerprint': 'fiscal-fp-sha256-abc',
            },
            'taxRate': 15,
            'pricesIncludeTax': true,
            'ruc': 'J0310000123456',
            'commercialFxSpread': 0.07,
          },
        },
      };

  group('TerminalPrimingPayload.fromJson', () {
    test('parses a full valid priming payload', () {
      final payload = TerminalPrimingPayload.fromJson(validPayload());

      expect(payload.status, equals('success'));
      expect(payload.serverTime, equals('2026-09-21T10:00:00.000Z'));
      expect(payload.currentVersion, equals(7));
      expect(payload.products, hasLength(1));
      expect(payload.products.first['id'], equals('prod-uuid-1'));
      expect(payload.catalogValues, hasLength(1));
      expect(payload.catalogValues.first['id'], equals('cat-1'));
      expect(payload.fiscalEnvelope, isNotNull);
      expect(payload.fiscalEnvelope!['businessName'], equals('Fonda La Patrona'));
    });

    test('falls back to the top-level fiscalConfig when deltas omits it', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['fiscalConfig'] = null;
      raw['fiscalConfig'] = {
        'tenantId': 'tenant-founder-01',
        'businessName': 'Fonda La Patrona',
        'fiscalRegime': 'RIM',
        'configVersion': {'revision': 3, 'fingerprint': 'fiscal-fp-abc123'},
        'taxRate': 15,
        'pricesIncludeTax': true,
      };

      final payload = TerminalPrimingPayload.fromJson(raw);

      expect(payload.fiscalEnvelope, isNotNull);
      expect(payload.fiscalEnvelope!['tenantId'], equals('tenant-founder-01'));
    });

    test('reports a null fiscal envelope when neither location carries one', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['fiscalConfig'] = null;

      final payload = TerminalPrimingPayload.fromJson(raw);

      expect(payload.fiscalEnvelope, isNull);
    });

    test('throws a named failure when the deltas object is missing', () {
      final raw = validPayload()..remove('deltas');

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_MISSING',
          ),
        ),
      );
    });

    test('throws a named failure when products or catalogValues are absent', () {
      final rawMissingProducts = validPayload();
      (rawMissingProducts['deltas'] as Map<String, dynamic>)
          .remove('products');

      expect(
        () => TerminalPrimingPayload.fromJson(rawMissingProducts),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_PARTIAL',
          ),
        ),
      );

      final rawMissingCatalog = validPayload();
      (rawMissingCatalog['deltas'] as Map<String, dynamic>)
          .remove('catalogValues');

      expect(
        () => TerminalPrimingPayload.fromJson(rawMissingCatalog),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_PARTIAL',
          ),
        ),
      );
    });

    test('throws a named failure when a product entry lacks identity fields', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['products'] = [
        {'name': 'No id here'},
      ];

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_PRODUCT_ENTRY_MALFORMED',
          ),
        ),
      );
    });

    test('throws a named failure when a catalog entry lacks identity fields', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['catalogValues'] = [
        {'id': 'cat-1', 'catalogType': 'UOM'},
      ];

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_CATALOG_ENTRY_MALFORMED',
          ),
        ),
      );
    });

    test('throws a named failure when currentVersion is missing', () {
      final raw = validPayload()..remove('currentVersion');

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_CURRENT_VERSION_MISSING',
          ),
        ),
      );
    });

    test('throws a named failure when the fiscal envelope is not an object', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['fiscalConfig'] = 'not-a-map';

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_FISCAL_ENVELOPE_MALFORMED',
          ),
        ),
      );
    });
  });
}
