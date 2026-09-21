import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/ports/activation_priming_port.dart';
import 'package:pos_app/data/services/activation_priming_service.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Fake priming port handing the service a pre-built payload (or a thrown
/// failure), so the service's application logic is exercised against the real
/// in-memory SQLite database through the real DAOs.
class _FakePrimingPort extends ActivationPrimingPort {
  TerminalPrimingPayload? payload;
  Object? thrown;

  @override
  Future<TerminalPrimingPayload> fetchPrimingPayload() async {
    final error = thrown;
    if (error != null) throw error;
    return payload!;
  }
}

void main() {
  late AppDatabase database;
  late _FakePrimingPort primingPort;
  late ActivationPrimingService service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Map<String, dynamic> fiscalEnvelope({
    int revision = 3,
    String fingerprint = 'fiscal-fp-sha256-abc',
  }) =>
      {
        'tenantId': 'tenant-founder-01',
        'businessName': 'Fonda La Patrona',
        'fiscalRegime': 'RIM',
        'configVersion': {
          'revision': revision,
          'fingerprint': fingerprint,
        },
        'taxRate': 15,
        'pricesIncludeTax': true,
        'ruc': 'J0310000123456',
        'commercialFxSpread': 0.07,
      };

  TerminalPrimingPayload payload({
    List<Map<String, dynamic>>? products,
    List<Map<String, dynamic>>? catalogValues,
    Map<String, dynamic>? fiscalConfig,
    bool includeFiscalConfig = true,
  }) =>
      TerminalPrimingPayload.fromJson(
        <String, dynamic>{
          'status': 'success',
          'serverTime': '2026-09-21T10:00:00.000Z',
          'currentVersion': 7,
          'deltas': <String, dynamic>{
            'products': products ??
              [
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
            'catalogValues': catalogValues ??
                <Map<String, dynamic>>[
                  {
                    'id': 'cat-1',
                    'catalogType': 'UOM',
                    'code': 'PLATO',
                    'name': 'Plato',
                    'isActive': true,
                    'sortOrder': 1,
                  },
                ],
            'fiscalConfig': includeFiscalConfig
                ? (fiscalConfig ?? fiscalEnvelope())
                : null,
          },
        },
      );

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    primingPort = _FakePrimingPort();
    service = ActivationPrimingService(
      database: database,
      primingPort: primingPort,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('L1-10b — ActivationPrimingService.primeTerminal', () {
    test(
        'applies products and catalog values and the fiscal projection through the real DAOs',
        () async {
      primingPort.payload = payload();

      final result = await service.primeTerminal();

      expect(result.appliedProducts, equals(1));
      expect(result.appliedCatalogValues, equals(1));
      expect(result.fiscalEnvelopePresent, isTrue);
      expect(result.fiscalOutcome, isNotNull);
      expect(result.fiscalOutcome!.status, FiscalInboxStatus.applied);

      final product =
          await database.productDao.findProductById('prod-uuid-1');
      expect(product, isNotNull);
      expect(product!.name, equals('Gallo Pinto Tradicional'));
      expect(product.uom, equals('PLATO'));
      expect(product.sellPrice, equals(75.0));
      expect(product.tenantId, equals('tenant-founder-01'));

      final catalogValue =
          await database.catalogValueDao.findByTypeAndCode('UOM', 'PLATO');
      expect(catalogValue, isNotNull);
      expect(catalogValue!.id, equals('cat-1'));
      expect(catalogValue.name, equals('Plato'));

      final fiscal =
          await database.fiscalConfigLocalDao.getByTenantId('tenant-founder-01');
      expect(fiscal, isNotNull);
      expect(fiscal!.revision, equals(3));
      expect(fiscal.fingerprint, equals('fiscal-fp-sha256-abc'));
    });

    test(
        'applied product fingerprint matches the pinned activation fingerprint',
        () async {
      primingPort.payload = payload();

      await service.primeTerminal();

      final product =
          await database.productDao.findProductById('prod-uuid-1');
      expect(product, isNotNull);
      // Pinned with computeProductFingerprint — the exact code
      // REQUIRED_CONFIG_LOCAL uses to compare against the attempt's pin.
      // Any drift in the priming field mapping breaks this assertion loudly
      // instead of leaving a silently unactivatable terminal.
      expect(
        ActivationRequiredConfigAdapter.computeProductFingerprint(
          product!,
          tenantId: 'tenant-founder-01',
        ),
        equals('1569fe3cd0389f8f5713e9cc49fe49d13f78ca7f46776f58189d5e77a047596e'),
      );
    });

    test(
        'NEVER writes last_inbound_sync_version and records priming under a distinct key',
        () async {
      primingPort.payload = payload();

      await service.primeTerminal();

      final inboundCursor =
          await database.localConfigDao.getConfigByKey('last_inbound_sync_version');
      expect(inboundCursor, isNull,
          reason:
              'Priming delivers only a subset of delta types; advancing the '
              'inbound sync cursor would make the later full device sync skip '
              'users, recipes and insumos.');

      final primingMarker = await database.localConfigDao
          .getConfigByKey(ActivationPrimingService.primingVersionKey);
      expect(primingMarker, isNotNull);
      expect(primingMarker!.value, equals('7'));
    });

    test(
        'propagates the named payload failure and applies nothing on a malformed payload',
        () async {
      primingPort.thrown = const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_DELTAS_MISSING',
        'Priming payload is missing the deltas object',
      );

      await expectLater(
        service.primeTerminal(),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_MISSING',
          ),
        ),
      );

      final product =
          await database.productDao.findProductById('prod-uuid-1');
      expect(product, isNull);
      final fiscal =
          await database.fiscalConfigLocalDao.getByTenantId('tenant-founder-01');
      expect(fiscal, isNull);
      final primingMarker = await database.localConfigDao
          .getConfigByKey(ActivationPrimingService.primingVersionKey);
      expect(primingMarker, isNull);
    });

    test('completes without error and reports no fiscal envelope when absent',
        () async {
      primingPort.payload = payload(includeFiscalConfig: false);

      final result = await service.primeTerminal();

      expect(result.fiscalEnvelopePresent, isFalse);
      expect(result.fiscalOutcome, isNull);
      final fiscal =
          await database.fiscalConfigLocalDao.getByTenantId('tenant-founder-01');
      expect(fiscal, isNull);
    });

    test('surfaces the named fiscal integrity conflict instead of half-applying',
        () async {
      // A same-revision/different-fingerprint conflict is a named, fail-closed
      // error from FiscalInboxHandler — priming must not swallow it. The
      // conflict is detected against the canonical local fiscal snapshot row.
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: 'tenant-founder-01',
          revision: 3,
          fingerprint: 'fiscal-fp-local-0001',
          payload: jsonEncode(
            fiscalEnvelope(fingerprint: 'fiscal-fp-local-0001'),
          ),
          appliedAt: '2026-09-21T08:00:00.000Z',
        ),
      );
      primingPort.payload = payload(
        fiscalConfig: fiscalEnvelope(fingerprint: 'fiscal-fp-tampered-00'),
      );

      await expectLater(
        service.primeTerminal(),
        throwsA(isA<FiscalIntegrityConflictException>()),
      );
    });

    test(
        're-priming preserves fields the priming payload does not carry, like the inbound projection',
        () async {
      primingPort.payload = payload();
      await service.primeTerminal();

      // Simulate a field only another path wrote (e.g. device sync), then
      // re-prime: the faithful mapping falls back to the stored value.
      final stored =
          await database.productDao.findProductById('prod-uuid-1');
      await database.productDao.insertProducts([
        _copyWithSku(stored!, 'SKU-KEPT'),
      ]);

      primingPort.payload = payload();
      await service.primeTerminal();

      final reprimed =
          await database.productDao.findProductById('prod-uuid-1');
      expect(reprimed!.sku, equals('SKU-KEPT'));
    });
  });
}

ProductEntity _copyWithSku(ProductEntity source, String sku) {
  return ProductEntity(
    id: source.id,
    name: source.name,
    uom: source.uom,
    stock: source.stock,
    averageCost: source.averageCost,
    sellPrice: source.sellPrice,
    isActive: source.isActive,
    sku: sku,
    barcode: source.barcode,
    category: source.category,
    isPrepared: source.isPrepared,
    productType: source.productType,
    mappingVersionId: source.mappingVersionId,
    insumoId: source.insumoId,
    createdAt: source.createdAt,
    inventoryPolicy: source.inventoryPolicy,
    directStockInsumoId: source.directStockInsumoId,
    taxRate: source.taxRate,
    isTaxExempt: source.isTaxExempt,
    tenantId: source.tenantId,
  );
}
