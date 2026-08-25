import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';

void main() {
  late AppDatabase database;
  late TenantConfigService service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = TenantConfigService(database.localConfigDao);
  });

  tearDown(() async {
    service.dispose();
    await database.close();
  });

  group('TenantOperationMode Domain Model (Slice 6.1)', () {
    test('verifies codes and display names for all modes', () {
      expect(TenantOperationMode.foodparkQsr.code, 'FOODPARK_QSR');
      expect(TenantOperationMode.restaurant.code, 'RESTAURANT');
      expect(TenantOperationMode.hybrid.code, 'HYBRID');

      expect(TenantOperationMode.foodparkQsr.displayName, 'Food Park / QSR');
      expect(TenantOperationMode.restaurant.displayName, 'Restaurante / Mesas');
      expect(TenantOperationMode.hybrid.displayName, 'Híbrido (QSR + Mesas)');
    });

    test('verifies operational capability flags matrix', () {
      // FOODPARK_QSR
      expect(TenantOperationMode.foodparkQsr.isFoodParkQsr, isTrue);
      expect(TenantOperationMode.foodparkQsr.isRestaurant, isFalse);
      expect(TenantOperationMode.foodparkQsr.isHybrid, isFalse);
      expect(TenantOperationMode.foodparkQsr.supportsTables, isFalse);
      expect(TenantOperationMode.foodparkQsr.supportsBuzzerPager, isTrue);
      expect(TenantOperationMode.foodparkQsr.requiresDirectCheckout, isTrue);

      // RESTAURANT
      expect(TenantOperationMode.restaurant.isFoodParkQsr, isFalse);
      expect(TenantOperationMode.restaurant.isRestaurant, isTrue);
      expect(TenantOperationMode.restaurant.isHybrid, isFalse);
      expect(TenantOperationMode.restaurant.supportsTables, isTrue);
      expect(TenantOperationMode.restaurant.supportsBuzzerPager, isFalse);
      expect(TenantOperationMode.restaurant.requiresDirectCheckout, isFalse);

      // HYBRID
      expect(TenantOperationMode.hybrid.isFoodParkQsr, isFalse);
      expect(TenantOperationMode.hybrid.isRestaurant, isFalse);
      expect(TenantOperationMode.hybrid.isHybrid, isTrue);
      expect(TenantOperationMode.hybrid.supportsTables, isTrue);
      expect(TenantOperationMode.hybrid.supportsBuzzerPager, isTrue);
      expect(TenantOperationMode.hybrid.requiresDirectCheckout, isFalse);
    });

    test('fromString parses correctly and falls back safely on invalid values', () {
      expect(TenantOperationMode.fromString('FOODPARK_QSR'), TenantOperationMode.foodparkQsr);
      expect(TenantOperationMode.fromString('foodpark_qsr'), TenantOperationMode.foodparkQsr);
      expect(TenantOperationMode.fromString('RESTAURANT'), TenantOperationMode.restaurant);
      expect(TenantOperationMode.fromString('restaurant'), TenantOperationMode.restaurant);
      expect(TenantOperationMode.fromString('HYBRID'), TenantOperationMode.hybrid);
      expect(TenantOperationMode.fromString('hybrid'), TenantOperationMode.hybrid);

      // Fallback on null or unknown strings
      expect(TenantOperationMode.fromString(null), TenantOperationMode.foodparkQsr);
      expect(TenantOperationMode.fromString(''), TenantOperationMode.foodparkQsr);
      expect(TenantOperationMode.fromString('UNKNOWN_MODE'), TenantOperationMode.foodparkQsr);
      expect(
        TenantOperationMode.fromString('INVALID', defaultMode: TenantOperationMode.restaurant),
        TenantOperationMode.restaurant,
      );
    });
  });

  group('TenantConfig Freezed Model (Slice 6.1)', () {
    test('default constructor creates Food Park QSR tenant config', () {
      const config = TenantConfig();
      expect(config.operationMode, TenantOperationMode.foodparkQsr);
      expect(config.tenantId, isEmpty);
      expect(config.tenantName, isEmpty);
      expect(config.buzzerPagerRequired, isFalse);
      expect(config.tableServiceEnabled, isFalse);
      expect(config.autoPrintKitchenTicket, isFalse);
      expect(config.isFoodParkQsr, isTrue);
      expect(config.supportsBuzzerPager, isTrue);
      expect(config.supportsTables, isFalse);
    });

    test('json serialization roundtrip succeeds', () {
      const config = TenantConfig(
        operationMode: TenantOperationMode.hybrid,
        tenantId: 'tenant-foodpark-01',
        tenantName: 'El Rincón Pinolero',
        buzzerPagerRequired: true,
        tableServiceEnabled: true,
        autoPrintKitchenTicket: true,
      );

      final json = config.toJson();
      final reconstructed = TenantConfig.fromJson(json);

      expect(reconstructed, equals(config));
      expect(reconstructed.operationMode, TenantOperationMode.hybrid);
      expect(reconstructed.supportsTables, isTrue);
      expect(reconstructed.supportsBuzzerPager, isTrue);
    });
  });

  group('TenantConfigService Persistence & Capabilities (Slice 6.1)', () {
    test('getOperationMode defaults to FOODPARK_QSR when table is empty', () async {
      final mode = await service.getOperationMode();
      expect(mode, TenantOperationMode.foodparkQsr);
      expect(await service.isFoodParkQsr(), isTrue);
      expect(await service.isRestaurant(), isFalse);
      expect(await service.isHybrid(), isFalse);
      expect(await service.supportsTables(), isFalse);
      expect(await service.supportsBuzzerPager(), isTrue);
    });

    test('getOperationMode resolves saved database record', () async {
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'operation_mode', value: 'RESTAURANT'),
      );

      final mode = await service.getOperationMode();
      expect(mode, TenantOperationMode.restaurant);
      expect(await service.isFoodParkQsr(), isFalse);
      expect(await service.isRestaurant(), isTrue);
      expect(await service.isHybrid(), isFalse);
      expect(await service.supportsTables(), isTrue);
      expect(await service.supportsBuzzerPager(), isFalse);
    });

    test('setOperationMode updates database and notifies stream', () async {
      final emittedModes = <TenantOperationMode>[];
      final subscription = service.onOperationModeChanged.listen(emittedModes.add);

      // Set to RESTAURANT
      await service.setOperationMode(TenantOperationMode.restaurant);

      final persistedEntity = await database.localConfigDao.getConfigByKey('operation_mode');
      expect(persistedEntity?.value, 'RESTAURANT');
      expect(await service.getOperationMode(), TenantOperationMode.restaurant);

      // Set to HYBRID
      await service.setOperationMode(TenantOperationMode.hybrid);
      expect(await service.getOperationMode(), TenantOperationMode.hybrid);
      expect(await service.supportsTables(), isTrue);
      expect(await service.supportsBuzzerPager(), isTrue);

      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(emittedModes, [TenantOperationMode.restaurant, TenantOperationMode.hybrid]);

      await subscription.cancel();
    });

    test('getTenantConfig and saveTenantConfig roundtrip full aggregate', () async {
      const initialConfig = TenantConfig(
        operationMode: TenantOperationMode.hybrid,
        tenantId: 'tenant-managua-01',
        tenantName: 'Café & Bistro Managua',
        buzzerPagerRequired: true,
        tableServiceEnabled: true,
        autoPrintKitchenTicket: true,
      );

      await service.saveTenantConfig(initialConfig);

      final loadedConfig = await service.getTenantConfig();
      expect(loadedConfig.operationMode, TenantOperationMode.hybrid);
      expect(loadedConfig.tenantId, 'tenant-managua-01');
      expect(loadedConfig.tenantName, 'Café & Bistro Managua');
      expect(loadedConfig.buzzerPagerRequired, isTrue);
      expect(loadedConfig.tableServiceEnabled, isTrue);
      expect(loadedConfig.autoPrintKitchenTicket, isTrue);
      expect(loadedConfig.supportsTables, isTrue);
      expect(loadedConfig.supportsBuzzerPager, isTrue);
    });

    test('corrupted or invalid operation_mode in database falls back gracefully without crashing', () async {
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'operation_mode', value: 'CORRUPTED_VALUE_123'),
      );

      final mode = await service.getOperationMode();
      expect(mode, TenantOperationMode.foodparkQsr);
    });
  });
}
