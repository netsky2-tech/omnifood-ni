import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';
import 'package:pos_app/data/services/fiscal_projection_repair_service.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view_model.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  group('FiscalBootstrapRunner Contract (Unit 2 Reliability & Ordering)', () {
    const testTenantId = 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a';
    const testRev = 1;
    const testFingerprint =
        '23317601f4471b3f678e849288ab04fbb83a5fa3c30ccfc989dcac0951281c26';
    const testBusinessName = 'Founder Pilot Cafe Q80';
    const testFiscalRegime = 'CUOTA_FIJA';
    const testAppliedAt = '2026-03-30T08:00:00.000Z';

    final testPayload = jsonEncode({
      'tenantId': testTenantId,
      'businessName': testBusinessName,
      'fiscalRegime': testFiscalRegime,
      'taxRate': 0.0,
      'pricesIncludeTax': true,
      'configVersion': {
        'revision': testRev,
        'fingerprint': testFingerprint,
      },
    });

    test('proves startup fiscal repair is completed before BusinessProfileViewModel eager construction', () async {
      // 1. Preseed fiscal snapshot in database without projections in local_configs
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: testTenantId,
          revision: testRev,
          fingerprint: testFingerprint,
          payload: testPayload,
          appliedAt: testAppliedAt,
        ),
      );

      // Verify projections are absent prior to bootstrap
      expect(
        await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion),
        isNull,
      );
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);

      final eventTimeline = <String>[];
      BusinessProfileViewModel? constructedVm;

      // 2. Run bootstrap boundary
      final bootstrapRunner = FiscalBootstrapRunner.fromDatabase(database);
      final repairResult = await bootstrapRunner.run(
        initConsumers: (result) async {
          // Event: consumer initialization / eager construction starts
          eventTimeline.add('init_consumers:status=${result.status.name}');

          // Verify that at the exact moment BusinessProfileViewModel is eagerly constructed,
          // local_configs projections have ALREADY been written by the awaited repair
          final projectedName =
              await database.localConfigDao.getConfigByKey('business_name');
          expect(projectedName?.value, testBusinessName);

          constructedVm = BusinessProfileViewModel(
            database.localConfigDao,
            null,
            null,
            database.fiscalConfigLocalDao,
          );
          await constructedVm!.loadConfig();
          eventTimeline.add('business_profile_vm_ready');
        },
      );

      // 3. Assert outcome and ordering
      expect(repairResult.isRepaired, isTrue);
      expect(repairResult.status, FiscalProjectionRepairStatus.repaired);
      expect(eventTimeline, [
        'init_consumers:status=repaired',
        'business_profile_vm_ready',
      ]);
      expect(constructedVm, isNotNull);
      expect(constructedVm!.config['business_name'], testBusinessName);
      expect(constructedVm!.config['tax_regime'], testFiscalRegime);
    });

    test('proves asynchronous repair is strictly awaited before consumer constructor runs', () async {
      // Preseed fiscal snapshot
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: testTenantId,
          revision: testRev,
          fingerprint: testFingerprint,
          payload: testPayload,
          appliedAt: testAppliedAt,
        ),
      );

      final lifecycleOrder = <String>[];

      // Wrap runner with observable delay to prove strict await semantics
      final delayCompleter = Completer<void>();
      var repairFinished = false;

      final instrumentedRunner = _InstrumentedRepairRunner(
        database,
        onRun: () async {
          lifecycleOrder.add('repair_started');
          await delayCompleter.future;
          lifecycleOrder.add('repair_finished');
          repairFinished = true;
        },
      );

      final bootstrapRunner = FiscalBootstrapRunner(repairRunner: instrumentedRunner);

      // Start bootstrap
      final bootstrapFuture = bootstrapRunner.runWithConsumers(
        initConsumers: (_) {
          // Assert that repair was finished BEFORE entering consumer factory
          expect(repairFinished, isTrue);
          lifecycleOrder.add('vm_constructed');
          return BusinessProfileViewModel(
            database.localConfigDao,
            null,
            null,
            database.fiscalConfigLocalDao,
          );
        },
      );

      // Verify that while repair is awaiting delay, vm_constructed has NOT happened
      expect(lifecycleOrder, ['repair_started']);
      expect(repairFinished, isFalse);

      // Complete repair delay
      delayCompleter.complete();
      final vm = await bootstrapFuture;

      // Assert strict sequential ordering
      expect(lifecycleOrder, [
        'repair_started',
        'repair_finished',
        'vm_constructed',
      ]);
      expect(vm, isA<BusinessProfileViewModel>());
    });

    test('fails closed on snapshot read failure: aborts bootstrap and NEVER constructs BusinessProfileViewModel', () async {
      // Close database to force snapshot scan/read error
      await database.close();

      var vmConstructed = false;
      final bootstrapRunner = FiscalBootstrapRunner.fromDatabase(database);

      expect(
        () => bootstrapRunner.run(
          initConsumers: (_) {
            vmConstructed = true;
          },
        ),
        throwsA(isA<FiscalProjectionRepairException>()),
      );

      expect(vmConstructed, isFalse,
          reason: 'Consumer must NEVER be constructed when snapshot read fails');
    });

    test('fails closed on corrupt snapshot payload: aborts bootstrap and NEVER constructs BusinessProfileViewModel', () async {
      await database.fiscalConfigLocalDao.insertOrReplace(
        const FiscalConfigLocalEntity(
          tenantId: 'corrupt-tenant',
          revision: 1,
          fingerprint: '3333333333333333333333333333333333333333333333333333333333333333',
          payload: 'corrupt-not-json-{{{',
          appliedAt: testAppliedAt,
        ),
      );

      var vmConstructed = false;
      final bootstrapRunner = FiscalBootstrapRunner.fromDatabase(database);

      expect(
        () => bootstrapRunner.run(
          initConsumers: (_) {
            vmConstructed = true;
          },
        ),
        throwsA(isA<FiscalProjectionRepairException>()),
      );

      expect(vmConstructed, isFalse,
          reason: 'Consumer must NEVER be constructed on corrupt snapshot repair error');
    });

    test('preserves legitimate empty-database behavior: proceeds and constructs BusinessProfileViewModel', () async {
      // Fresh empty database with no fiscal snapshots
      var vmConstructed = false;
      final bootstrapRunner = FiscalBootstrapRunner.fromDatabase(database);

      final result = await bootstrapRunner.run(
        initConsumers: (_) {
          vmConstructed = true;
          BusinessProfileViewModel(
            database.localConfigDao,
            null,
            null,
            database.fiscalConfigLocalDao,
          );
        },
      );

      expect(result.status, FiscalProjectionRepairStatus.noSnapshots);
      expect(result.isNoSnapshots, isTrue);
      expect(vmConstructed, isTrue,
          reason: 'Legitimate empty database must proceed to construct consumers');
    });

    test('preserves healthy projection no-op behavior: proceeds and constructs BusinessProfileViewModel', () async {
      // 1. Preseed snapshot
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: testTenantId,
          revision: testRev,
          fingerprint: testFingerprint,
          payload: testPayload,
          appliedAt: testAppliedAt,
        ),
      );

      // 2. Preseed matching local configs and projection marker (already healthy)
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: FiscalProjectionKeys.fiscalProjectionVersion,
          value: FiscalProjectionKeys.currentVersion.toString(),
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'tenant_id', value: testTenantId),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'business_name', value: testBusinessName),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'tenant_name', value: testBusinessName),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'tax_regime', value: testFiscalRegime),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: FiscalProjectionKeys.lastAppliedFiscalRevision,
          value: testRev.toString(),
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: FiscalProjectionKeys.lastAppliedFiscalFingerprint,
          value: testFingerprint,
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: FiscalProjectionKeys.pricesIncludeTax,
          value: 'true',
        ),
      );
      await database.taxConfigDao.insertTaxConfig(
        TaxConfigEntity(
          id: 'fiscal-tax-$testTenantId',
          name: testFiscalRegime,
          rate: 0.0,
          isActive: true,
          isDefault: true,
        ),
      );

      var vmConstructed = false;
      final bootstrapRunner = FiscalBootstrapRunner.fromDatabase(database);

      final result = await bootstrapRunner.run(
        initConsumers: (_) {
          vmConstructed = true;
        },
      );

      expect(result.status, FiscalProjectionRepairStatus.noOp);
      expect(result.isNoOp, isTrue);
      expect(vmConstructed, isTrue,
          reason: 'Healthy projection no-op must proceed to construct consumers');
    });
  });
}

class _InstrumentedRepairRunner extends FiscalProjectionRepairRunner {
  final Future<void> Function() _onRun;

  _InstrumentedRepairRunner(
    AppDatabase database, {
    required Future<void> Function() onRun,
  })  : _onRun = onRun,
        super(database);

  @override
  Future<FiscalProjectionRepairResult> run() async {
    await _onRun();
    return super.run();
  }
}
