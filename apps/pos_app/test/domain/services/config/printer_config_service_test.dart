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

    test('savePrinterConfig persists all values and emits on stream', () async {
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
}
