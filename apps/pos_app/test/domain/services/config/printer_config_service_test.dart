import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';

import 'printer_config_service_test.mocks.dart';

@GenerateNiceMocks([MockSpec<LocalConfigDao>()])
void main() {
  late MockLocalConfigDao mockDao;
  late PrinterConfigService service;

  setUp(() {
    mockDao = MockLocalConfigDao();
    service = PrinterConfigService(mockDao);
  });

  tearDown(() {
    service.dispose();
  });

  group('PrinterConfigService Tests', () {
    test('returns default configuration when local_configs is empty', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);

      final config = await service.getPrinterConfig();

      expect(config.driverType, PrinterDriverType.sunmiV2s);
      expect(config.autoPrintInvoice, isTrue);
      expect(config.autoPrintKitchen, isFalse);
      expect(config.openDrawerOnCash, isTrue);
      expect(config.paperWidthMm, 58);
      expect(config.headerBusinessName, 'OMNIFOOD NI');
    });

    test('hydrates saved config from local_configs DAO', () async {
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey))
          .thenAnswer((_) async => LocalConfigEntity(key: 'printer_driver_type', value: 'MOCK'));
      when(mockDao.getConfigByKey(PrinterConfigService.autoPrintInvoiceKey))
          .thenAnswer((_) async => LocalConfigEntity(key: 'printer_auto_invoice', value: 'false'));
      when(mockDao.getConfigByKey(PrinterConfigService.autoPrintKitchenKey))
          .thenAnswer((_) async => LocalConfigEntity(key: 'printer_auto_kitchen', value: 'true'));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey))
          .thenAnswer((_) async => LocalConfigEntity(key: 'printer_paper_width_mm', value: '80'));
      when(mockDao.getConfigByKey(PrinterConfigService.headerBusinessNameKey))
          .thenAnswer((_) async => LocalConfigEntity(key: 'printer_header_business_name', value: 'Café Managua'));

      final config = await service.getPrinterConfig();

      expect(config.driverType, PrinterDriverType.mock);
      expect(config.autoPrintInvoice, isFalse);
      expect(config.autoPrintKitchen, isTrue);
      expect(config.paperWidthMm, 80);
      expect(config.headerBusinessName, 'Café Managua');
    });

    test('split fields: fiscalRuc reads the projected ruc key; headerRuc reads printer_header_ruc only (FR-6/D1)', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey('ruc')).thenAnswer(
          (_) async => LocalConfigEntity(key: 'ruc', value: 'J0310000055555'));
      when(mockDao.getConfigByKey(PrinterConfigService.headerRucKey)).thenAnswer(
          (_) async => LocalConfigEntity(
              key: PrinterConfigService.headerRucKey, value: 'J0310000999999'));

      final config = await service.getPrinterConfig();

      expect(config.fiscalRuc, 'J0310000055555');
      expect(config.headerRuc, 'J0310000999999');
    });

    test('header-only device: headerRuc present does NOT shadow fiscalRuc (projection wins)', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.headerRucKey)).thenAnswer(
          (_) async => LocalConfigEntity(
              key: PrinterConfigService.headerRucKey, value: 'J0310000999999'));

      final config = await service.getPrinterConfig();

      expect(config.headerRuc, 'J0310000999999');
      expect(config.fiscalRuc, isNull);
    });

    test('savePrinterConfig never writes the projected ruc key (no round-trip contamination)', () async {
      const newConfig = PrinterConfig(
        driverType: PrinterDriverType.mock,
        headerBusinessName: 'Mi Restaurante',
        headerRuc: 'J0310000999999',
        fiscalRuc: 'J0310000055555',
      );

      await service.savePrinterConfig(newConfig);

      final savedRucWrites = verify(mockDao.saveConfig(captureAny)).captured
          .whereType<LocalConfigEntity>()
          .where((e) => e.key == 'ruc');
      expect(savedRucWrites, isEmpty);
    });

    group('D-21 consolidation (#551): legacy D-17 backing pair removed', () {
      test('getPrinterConfig still reads the authorization code key', () async {
        when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
        when(mockDao.getConfigByKey('dgi_authorization_code')).thenAnswer(
            (_) async =>
                LocalConfigEntity(key: 'dgi_authorization_code', value: 'AUT-DGI-2026-9876'));

        final config = await service.getPrinterConfig();

        expect(config.dgiAuthorizationCode, 'AUT-DGI-2026-9876');
      });

      test('legacy backing keys are never read from local_configs (ignored on read)', () async {
        // D-21 consolidation: rows persisted by older builds stay in the
        // table but the consolidation decision says they are simply ignored
        // on read — no destructive migration, and getPrinterConfig must not
        // resurrect them into the config.
        when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
        when(mockDao.getConfigByKey('dgi_authorization_date')).thenAnswer(
            (_) async =>
                LocalConfigEntity(key: 'dgi_authorization_date', value: '2026-09-23'));
        when(mockDao.getConfigByKey('dgi_authorization_document')).thenAnswer(
            (_) async => LocalConfigEntity(
                key: 'dgi_authorization_document', value: 'Resolución DGI 098-2026'));

        await service.getPrinterConfig();

        verifyNever(mockDao.getConfigByKey('dgi_authorization_date'));
        verifyNever(mockDao.getConfigByKey('dgi_authorization_document'));
      });

      test('absent authorization key yields null, not empty string', () async {
        when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);

        final config = await service.getPrinterConfig();

        // An empty string would print as a blank-looking value on paper
        // (the #548 fabrication failure mode); absent means null.
        expect(config.dgiAuthorizationCode, isNull);
      });

      test(
          'savePrinterConfig never writes the authorization keys (business-profile data, fiscalRuc precedent)',
          () async {
        const newConfig = PrinterConfig(
          driverType: PrinterDriverType.mock,
          headerBusinessName: 'Mi Restaurante',
          dgiAuthorizationCode: 'AUT-DGI-2026-9876',
        );

        await service.savePrinterConfig(newConfig);

        final savedKeys = verify(mockDao.saveConfig(captureAny)).captured
            .whereType<LocalConfigEntity>()
            .map((e) => e.key)
            .toSet();
        expect(savedKeys, isNot(contains('dgi_authorization_code')));
        expect(savedKeys, isNot(contains('dgi_authorization_date')));
        expect(savedKeys, isNot(contains('dgi_authorization_document')));
      });
    });

    test('savePrinterConfig persists all values and emits on stream', () async {
      // L1-08b setup adaptation: the profile keys must already exist for
      // savePrinterConfig to keep persisting them (assertions unchanged).
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => LocalConfigEntity(
              key: PrinterConfigService.driverTypeKey, value: 'SUNMI_V2S'));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => LocalConfigEntity(
              key: PrinterConfigService.paperWidthMmKey, value: '58'));

      const newConfig = PrinterConfig(
        driverType: PrinterDriverType.mock,
        autoPrintInvoice: true,
        autoPrintKitchen: true,
        openDrawerOnCash: false,
        paperWidthMm: 58,
        headerBusinessName: 'Mi Restaurante',
        headerRuc: 'J0310000000002',
      );

      final emissions = <PrinterConfig>[];
      final sub = service.onConfigChanged.listen(emissions.add);

      await service.savePrinterConfig(newConfig);
      await pumpEventQueue();

      verify(mockDao.saveConfig(argThat(
        predicate<LocalConfigEntity>((e) => e.key == PrinterConfigService.driverTypeKey && e.value == 'MOCK'),
      ))).called(1);

      verify(mockDao.saveConfig(argThat(
        predicate<LocalConfigEntity>((e) => e.key == PrinterConfigService.headerBusinessNameKey && e.value == 'Mi Restaurante'),
      ))).called(1);

      expect(emissions.length, 1);
      expect(emissions.first.headerBusinessName, 'Mi Restaurante');

      await sub.cancel();
    });
  });

  group('PrinterConfigService — printer profile persistence (L1-08b)', () {
    LocalConfigEntity entity(String key, String value) =>
        LocalConfigEntity(key: key, value: value);

    test('confirmPrinterProfile writes exactly the driver and paper width keys and nothing else', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);

      await service.confirmPrinterProfile(
        driverType: PrinterDriverType.mock,
        paperWidthMm: 80,
      );

      final writes = verify(mockDao.saveConfig(captureAny)).captured
          .whereType<LocalConfigEntity>()
          .toList();
      expect(writes, hasLength(2));
      expect(
        writes
            .where((e) => e.key == PrinterConfigService.driverTypeKey)
            .single
            .value,
        'MOCK',
      );
      expect(
        writes
            .where((e) => e.key == PrinterConfigService.paperWidthMmKey)
            .single
            .value,
        '80',
      );
    });

    test('savePrinterConfig preserves an absent profile while persisting other settings', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);

      await service.savePrinterConfig(const PrinterConfig(
        driverType: PrinterDriverType.mock,
        autoPrintKitchen: true,
        headerBusinessName: 'Mi Restaurante',
      ));

      final keys = verify(mockDao.saveConfig(captureAny)).captured
          .whereType<LocalConfigEntity>()
          .map((e) => e.key)
          .toList();
      expect(keys, isNot(contains(PrinterConfigService.driverTypeKey)));
      expect(keys, isNot(contains(PrinterConfigService.paperWidthMmKey)));
      expect(keys, contains(PrinterConfigService.autoPrintKitchenKey));
    });

    test('savePrinterConfig keeps writing the profile keys when they already exist', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.driverTypeKey, 'MOCK'));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.paperWidthMmKey, '58'));

      await service.savePrinterConfig(const PrinterConfig(
        driverType: PrinterDriverType.iPosQ80,
        paperWidthMm: 80,
        headerBusinessName: 'Mi Restaurante',
      ));

      verify(mockDao.saveConfig(argThat(predicate<LocalConfigEntity>((e) =>
          e.key == PrinterConfigService.driverTypeKey &&
          e.value == 'IPOS_Q80')))).called(1);
      verify(mockDao.saveConfig(argThat(predicate<LocalConfigEntity>((e) =>
          e.key == PrinterConfigService.paperWidthMmKey &&
          e.value == '80')))).called(1);
    });
  });

  group('PrinterConfigService — printer profile presence (L1-08a)', () {
    LocalConfigEntity entity(String key, String value) =>
        LocalConfigEntity(key: key, value: value);

    test('is true only when both the driver key and the paper width key exist with non-blank values', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.driverTypeKey, 'IPOS_Q80'));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.paperWidthMmKey, '80'));

      expect(await service.isPrinterProfileConfigured(), isTrue);
    });

    test('is false when the driver key is absent, even with a configured paper width', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.paperWidthMmKey, '80'));

      expect(await service.isPrinterProfileConfigured(), isFalse);
    });

    test('is false when the paper width key is absent, even with a configured driver', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.driverTypeKey, 'IPOS_Q80'));

      expect(await service.isPrinterProfileConfigured(), isFalse);
    });

    test('is false when the driver key exists but is blank', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.driverTypeKey, '   '));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.paperWidthMmKey, '80'));

      expect(await service.isPrinterProfileConfigured(), isFalse);
    });

    test('is false when the paper width key exists but is blank', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.driverTypeKey, 'IPOS_Q80'));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.paperWidthMmKey, '   '));

      expect(await service.isPrinterProfileConfigured(), isFalse);
    });

    test('is read-only: the presence query never writes local_configs', () async {
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.driverTypeKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.driverTypeKey, 'IPOS_Q80'));
      when(mockDao.getConfigByKey(PrinterConfigService.paperWidthMmKey)).thenAnswer(
          (_) async => entity(PrinterConfigService.paperWidthMmKey, '80'));

      await service.isPrinterProfileConfigured();

      verifyNever(mockDao.saveConfig(any));
    });
  });
}
