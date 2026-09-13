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
  late FiscalProjectionRepairRunner runner;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    runner = FiscalProjectionRepairRunner(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('FiscalProjectionRepairRunner (Unit 2 Offline Startup Backfill)', () {
    const q80TenantId = 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a';
    const q80Rev = 1;
    const q80Fingerprint =
        '23317601f4471b3f678e849288ab04fbb83a5fa3c30ccfc989dcac0951281c26';
    const q80BusinessName = 'Founder Pilot Q80 1789164022241-e9530ebc';
    const q80FiscalRegime = 'CUOTA_FIJA';
    const q80AppliedAt = '2026-03-30T08:00:00.000Z';

    final q80Payload = jsonEncode({
      'tenantId': q80TenantId,
      'businessName': q80BusinessName,
      'fiscalRegime': q80FiscalRegime,
      'taxRate': 0.0,
      'pricesIncludeTax': true,
      'configVersion': {
        'revision': q80Rev,
        'fingerprint': q80Fingerprint,
      },
      // absent / null RUC
    });

    test('Q80-B: offline startup backfill rebuilds projections without envelope/network and BusinessProfile reads primary config', () async {
      // 1. Preseed fiscal_config_local with Q80 snapshot
      final preseededSnapshot = FiscalConfigLocalEntity(
        tenantId: q80TenantId,
        revision: q80Rev,
        fingerprint: q80Fingerprint,
        payload: q80Payload,
        appliedAt: q80AppliedAt,
      );
      await database.fiscalConfigLocalDao.insertOrReplace(preseededSnapshot);

      // 2. Preseed local_configs with ONLY last_applied markers (no tenant_id, no business_name, no projection marker)
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'last_applied_fiscal_revision',
          value: q80Rev.toString(),
          description: 'Last applied revision',
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'last_applied_fiscal_fingerprint',
          value: q80Fingerprint,
          description: 'Last applied fingerprint',
        ),
      );

      // Verify pre-repair state: projection marker absent or 0, business_name absent, tenant_id absent
      expect(
        await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion),
        isNull,
      );
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tenant_id'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tax_regime'), isNull);
      expect(await database.localConfigDao.getConfigByKey('ruc'), isNull);

      // 3. Invoke startup repair with no network / no incoming envelope
      final firstResult = await runner.runStartupRepair();

      // Assert outcome is repaired
      expect(firstResult.status, FiscalProjectionRepairStatus.repaired);
      expect(firstResult.isRepaired, isTrue);
      expect(firstResult.tenantId, q80TenantId);
      expect(firstResult.revision, q80Rev);

      // Assert local_configs projections
      final bnConfig = await database.localConfigDao.getConfigByKey('business_name');
      expect(bnConfig?.value, q80BusinessName);

      final tenantConfig = await database.localConfigDao.getConfigByKey('tenant_id');
      expect(tenantConfig?.value, q80TenantId);

      final regimeConfig = await database.localConfigDao.getConfigByKey('tax_regime');
      expect(regimeConfig?.value, q80FiscalRegime);

      // Legacy alias tenant_name
      final tnConfig = await database.localConfigDao.getConfigByKey('tenant_name');
      expect(tnConfig?.value, q80BusinessName);

      // RUC optional semantics: absent/null in payload -> absent in local_configs
      final rucConfig = await database.localConfigDao.getConfigByKey('ruc');
      expect(rucConfig, isNull);

      // CURRENT projection marker
      final versionConfig = await database.localConfigDao
          .getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion);
      expect(
        versionConfig?.value,
        FiscalProjectionKeys.currentVersion.toString(),
      );

      // Snapshot in fiscal_config_local unchanged
      final storedSnapshot =
          await database.fiscalConfigLocalDao.getByTenantId(q80TenantId);
      expect(storedSnapshot, isNotNull);
      expect(storedSnapshot!.revision, q80Rev);
      expect(storedSnapshot.fingerprint, q80Fingerprint);
      expect(storedSnapshot.appliedAt, q80AppliedAt);

      // 4. BusinessProfileViewModel loads expected name from PRIMARY local_configs path
      final printedLogs = <String>[];
      await runZoned(
        () async {
          final viewModel = BusinessProfileViewModel(
            database.localConfigDao,
            null,
            null,
            database.fiscalConfigLocalDao,
          );
          await viewModel.loadConfig();

          expect(viewModel.config['business_name'], q80BusinessName);
          expect(viewModel.config['tax_regime'], q80FiscalRegime);
        },
        zoneSpecification: ZoneSpecification(
          print: (self, parent, zone, line) {
            printedLogs.add(line);
            parent.print(zone, line);
          },
        ),
      );

      // BusinessProfileViewModel must read primary config, NOT invoke fiscal fallback
      expect(
        printedLogs.any((l) => l.contains('PRIMARY_CONFIG_FOUND: true')),
        isTrue,
      );
      expect(
        printedLogs.any((l) => l.contains('PRIMARY_BUSINESS_NAME_PRESENT: true')),
        isTrue,
      );
      expect(
        printedLogs.any((l) => l.contains('FISCAL_FALLBACK_TRIGGERED: false')),
        isTrue,
      );
      expect(
        printedLogs.any((l) => l.contains('VIEW_MODEL_BUSINESS_NAME_PRESENT: true')),
        isTrue,
      );

      // 5. Immediate second run is true no-op
      final secondResult = await runner.runStartupRepair();
      expect(secondResult.status, FiscalProjectionRepairStatus.noOp);
      expect(secondResult.isNoOp, isTrue);

      // AppliedAt still unchanged
      final snapshotAfterSecond =
          await database.fiscalConfigLocalDao.getByTenantId(q80TenantId);
      expect(snapshotAfterSecond!.appliedAt, q80AppliedAt);
    });

    test('eliminates circular lookup: derives tenant from snapshot entity when local_configs tenant_id is missing', () async {
      final snapshot = FiscalConfigLocalEntity(
        tenantId: 'tenant-no-initial-binding',
        revision: 2,
        fingerprint: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        payload: jsonEncode({
          'tenantId': 'tenant-no-initial-binding',
          'businessName': 'Autonomous Cafe',
          'fiscalRegime': 'REGIMEN_GENERAL',
          'taxRate': 0.15,
          'pricesIncludeTax': true,
          'ruc': 'J0319999999999',
          'configVersion': {
            'revision': 2,
            'fingerprint':
                'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          },
        }),
        appliedAt: '2026-03-30T09:00:00.000Z',
      );
      await database.fiscalConfigLocalDao.insertOrReplace(snapshot);

      // local_configs has no tenant_id config
      expect(await database.localConfigDao.getConfigByKey('tenant_id'), isNull);

      final result = await runner.runStartupRepair();
      expect(result.status, FiscalProjectionRepairStatus.repaired);
      expect(result.tenantId, 'tenant-no-initial-binding');

      final tenantInConfig = await database.localConfigDao.getConfigByKey('tenant_id');
      expect(tenantInConfig?.value, 'tenant-no-initial-binding');
      final rucInConfig = await database.localConfigDao.getConfigByKey('ruc');
      expect(rucInConfig?.value, 'J0319999999999');
    });

    test('empty database returns noSnapshots status and writes nothing', () async {
      final result = await runner.runStartupRepair();
      expect(result.status, FiscalProjectionRepairStatus.noSnapshots);
      expect(result.isNoSnapshots, isTrue);
      expect(result.tenantId, isNull);

      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tenant_id'), isNull);
      expect(
        await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion),
        isNull,
      );
    });

    test('multiple snapshots without active tenant binding returns ambiguous and leaves legacy keys untouched', () async {
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: 'tenant-a',
          revision: 1,
          fingerprint: '1111111111111111111111111111111111111111111111111111111111111111',
          payload: jsonEncode({
            'tenantId': 'tenant-a',
            'businessName': 'Cafe A',
            'fiscalRegime': 'CUOTA_FIJA',
            'taxRate': 0.0,
            'pricesIncludeTax': true,
            'configVersion': {
              'revision': 1,
              'fingerprint':
                  '1111111111111111111111111111111111111111111111111111111111111111',
            },
          }),
          appliedAt: '2026-03-30T08:00:00.000Z',
        ),
      );
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: 'tenant-b',
          revision: 1,
          fingerprint: '2222222222222222222222222222222222222222222222222222222222222222',
          payload: jsonEncode({
            'tenantId': 'tenant-b',
            'businessName': 'Cafe B',
            'fiscalRegime': 'CUOTA_FIJA',
            'taxRate': 0.0,
            'pricesIncludeTax': true,
            'configVersion': {
              'revision': 1,
              'fingerprint':
                  '2222222222222222222222222222222222222222222222222222222222222222',
            },
          }),
          appliedAt: '2026-03-30T08:00:00.000Z',
        ),
      );

      // No active tenant_id binding in local_configs
      final result = await runner.runStartupRepair();
      expect(result.status, FiscalProjectionRepairStatus.ambiguous);
      expect(result.isAmbiguous, isTrue);

      // Global legacy keys must NOT be written nondeterministically
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tenant_id'), isNull);
    });

    test('multiple snapshots with valid active tenant binding repairs only the active tenant snapshot', () async {
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: 'tenant-active',
          revision: 1,
          fingerprint: '1111111111111111111111111111111111111111111111111111111111111111',
          payload: jsonEncode({
            'tenantId': 'tenant-active',
            'businessName': 'Active Cafe',
            'fiscalRegime': 'CUOTA_FIJA',
            'taxRate': 0.0,
            'pricesIncludeTax': true,
            'configVersion': {
              'revision': 1,
              'fingerprint':
                  '1111111111111111111111111111111111111111111111111111111111111111',
            },
          }),
          appliedAt: '2026-03-30T08:00:00.000Z',
        ),
      );
      await database.fiscalConfigLocalDao.insertOrReplace(
        FiscalConfigLocalEntity(
          tenantId: 'tenant-inactive',
          revision: 1,
          fingerprint: '2222222222222222222222222222222222222222222222222222222222222222',
          payload: jsonEncode({
            'tenantId': 'tenant-inactive',
            'businessName': 'Inactive Cafe',
            'fiscalRegime': 'CUOTA_FIJA',
            'taxRate': 0.0,
            'pricesIncludeTax': true,
            'configVersion': {
              'revision': 1,
              'fingerprint':
                  '2222222222222222222222222222222222222222222222222222222222222222',
            },
          }),
          appliedAt: '2026-03-30T08:00:00.000Z',
        ),
      );

      // Active tenant binding pre-exists in local_configs
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'tenant_id',
          value: 'tenant-active',
        ),
      );

      final result = await runner.runStartupRepair();
      expect(result.status, FiscalProjectionRepairStatus.repaired);
      expect(result.tenantId, 'tenant-active');

      final bnConfig = await database.localConfigDao.getConfigByKey('business_name');
      expect(bnConfig?.value, 'Active Cafe');
    });

    test('corrupt JSON payload logs sanitized warning and rethrows FormatException', () async {
      await database.fiscalConfigLocalDao.insertOrReplace(
        const FiscalConfigLocalEntity(
          tenantId: 'corrupt-tenant',
          revision: 1,
          fingerprint: '3333333333333333333333333333333333333333333333333333333333333333',
          payload: 'not-valid-json-{{{',
          appliedAt: '2026-03-30T08:00:00.000Z',
        ),
      );

      expect(
        () => runner.runStartupRepair(),
        throwsA(isA<FormatException>()),
      );
    });

    test('snapshot read failure returns failed status and never converts to noOp', () async {
      await database.close();

      final result = await runner.runStartupRepair();
      expect(result.status, FiscalProjectionRepairStatus.failed);
      expect(result.isFailed, isTrue);
      expect(result.isNoOp, isFalse);
      expect(result.message, contains('Failed to read fiscal snapshots'));
      expect(result.error, isNotNull);
    });

    group('Startup tenant safety & fail-closed ambiguous states (Finding B)', () {
      test('single snapshot does not overwrite different nonblank local tenant_id and fails closed/ambiguous', () async {
        // Pre-seed local_configs with active tenant B
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'tenant_id', value: 'tenant-b'),
        );

        // Pre-seed exactly one snapshot in DB, but for tenant A
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: 'tenant-a',
            revision: 1,
            fingerprint: '1111111111111111111111111111111111111111111111111111111111111111',
            payload: jsonEncode({
              'tenantId': 'tenant-a',
              'businessName': 'Cafe A',
              'fiscalRegime': 'CUOTA_FIJA',
              'taxRate': 0.0,
              'pricesIncludeTax': true,
              'configVersion': {
                'revision': 1,
                'fingerprint': '1111111111111111111111111111111111111111111111111111111111111111',
              },
            }),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        final result = await runner.runStartupRepair();
        expect(result.status, FiscalProjectionRepairStatus.ambiguous);
        expect(result.isAmbiguous, isTrue);

        // Tenant A projections must NOT overwrite local config
        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        final activeTenant = await database.localConfigDao.getConfigByKey('tenant_id');
        expect(activeTenant?.value, 'tenant-b');

        // FiscalBootstrapRunner must fail closed before consumers on ambiguous status
        final bootstrapRunner = FiscalBootstrapRunner.fromDatabase(database);
        expect(
          () => bootstrapRunner.run(),
          throwsA(isA<FiscalProjectionRepairException>()),
        );
      });
    });

    group('Snapshot integrity & Non-object JSON (Finding C)', () {
      const snapTenant = 'tenant-integrity-test';
      const fp = '4444444444444444444444444444444444444444444444444444444444444444';

      test('valid JSON non-object payload throws FormatException and fails closed', () async {
        await database.fiscalConfigLocalDao.insertOrReplace(
          const FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: '[1, 2, 3]', // Valid JSON array, but not a JSON object
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>().having(
              (e) => e.message,
              'message',
              contains('not a JSON object'),
            ),
          ),
        );
      });

      test('mismatched tenantId in snapshot payload throws FormatException', () async {
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode({
              'tenantId': 'different-tenant-in-payload',
              'businessName': 'Mismatch Cafe',
              'fiscalRegime': 'CUOTA_FIJA',
              'taxRate': 0.0,
              'pricesIncludeTax': true,
              'configVersion': {'revision': 1, 'fingerprint': fp},
            }),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>().having(
              (e) => e.message,
              'message',
              contains('tenantId does not match canonical entity'),
            ),
          ),
        );
      });

      test('mismatched revision in snapshot payload throws FormatException', () async {
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 2,
            fingerprint: fp,
            payload: jsonEncode({
              'tenantId': snapTenant,
              'businessName': 'Mismatch Cafe',
              'fiscalRegime': 'CUOTA_FIJA',
              'taxRate': 0.0,
              'pricesIncludeTax': true,
              'configVersion': {'revision': 1, 'fingerprint': fp}, // payload says rev 1, entity says rev 2
            }),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>().having(
              (e) => e.message,
              'message',
              contains('revision does not match canonical entity'),
            ),
          ),
        );
      });

      test('mismatched fingerprint in snapshot payload throws FormatException without raw fingerprint in message', () async {
        const payloadFp = '9999999999999999999999999999999999999999999999999999999999999999';
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode({
              'tenantId': snapTenant,
              'businessName': 'Mismatch Cafe',
              'fiscalRegime': 'CUOTA_FIJA',
              'taxRate': 0.0,
              'pricesIncludeTax': true,
              'configVersion': {'revision': 1, 'fingerprint': payloadFp},
            }),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('fingerprint does not match canonical entity'))
                .having((e) => e.message, 'message', isNot(contains(payloadFp)))
                .having((e) => e.message, 'message', isNot(contains(fp))),
          ),
        );
      });
    });

    group('Whitespace trim alignment & repair loop prevention (Finding E)', () {
      test('whitespace in businessName or fiscalRegime is trimmed and does not cause repair loops', () async {
        const wsTenant = 'tenant-whitespace-1';
        const wsFp = '5555555555555555555555555555555555555555555555555555555555555555';

        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: wsTenant,
            revision: 1,
            fingerprint: wsFp,
            payload: jsonEncode({
              'tenantId': wsTenant,
              'businessName': '   Pizzeria Central   ',
              'fiscalRegime': '   CUOTA_FIJA   ',
              'taxRate': 0.0,
              'pricesIncludeTax': true,
              'configVersion': {'revision': 1, 'fingerprint': wsFp},
            }),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        // First run: repairs projections
        final firstRun = await runner.runStartupRepair();
        expect(firstRun.status, FiscalProjectionRepairStatus.repaired);

        final bn = await database.localConfigDao.getConfigByKey('business_name');
        expect(bn?.value, 'Pizzeria Central');

        // Second run: must be noOp (NO endless repair loop caused by whitespace comparison differences)
        final secondRun = await runner.runStartupRepair();
        expect(secondRun.status, FiscalProjectionRepairStatus.noOp);
        expect(secondRun.isNoOp, isTrue);
      });
    });

    group('Stored canonical snapshot repair validation (Safe Contract & Fail-Closed)', () {
      const snapTenant = 'tenant-repair-contract';
      const fp = '7777777777777777777777777777777777777777777777777777777777777777';

      Map<String, dynamic> validBasePayload({int revision = 1}) => {
        'tenantId': snapTenant,
        'businessName': 'Repair Validation Cafe',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {'revision': revision, 'fingerprint': fp},
      };

      test('stored snapshot with negative revision fails closed with FormatException and no mutation', () async {
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: -1,
            fingerprint: fp,
            payload: jsonEncode(validBasePayload(revision: -1)),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('revision cannot be negative')),
          ),
        );

        // No mutation of local_configs
        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.localConfigDao.getConfigByKey('tenant_id'), isNull);
        expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion), isNull);

        // Canonical snapshot remains untouched
        final stored = await database.fiscalConfigLocalDao.getByTenantId(snapTenant);
        expect(stored, isNotNull);
        expect(stored!.revision, -1);
      });

      test('stored snapshot with malformed taxRate (string or negative) fails closed with FormatException and no mutation', () async {
        // 1. String taxRate
        final payloadBadString = validBasePayload()..['taxRate'] = 'fifteen_percent';
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadBadString),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('taxRate must be a non-negative number')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.taxConfigDao.getAllTaxConfigs(), isEmpty);

        // 2. Negative taxRate
        final payloadNegative = validBasePayload()..['taxRate'] = -0.15;
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadNegative),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('taxRate must be a non-negative number')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.taxConfigDao.getAllTaxConfigs(), isEmpty);
      });

      test('stored snapshot missing taxRate fails closed with FormatException and no mutation', () async {
        final payloadMissingTax = validBasePayload()..remove('taxRate');
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadMissingTax),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('missing or null taxRate')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.taxConfigDao.getAllTaxConfigs(), isEmpty);
      });

      test('stored snapshot missing pricesIncludeTax fails closed with FormatException and no mutation', () async {
        final payloadMissingPit = validBasePayload()..remove('pricesIncludeTax');
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadMissingPit),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('missing or null pricesIncludeTax')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.pricesIncludeTax), isNull);
      });

      test('stored snapshot with malformed pricesIncludeTax (non-boolean) fails closed with FormatException and no mutation', () async {
        final payloadBadBool = validBasePayload()..['pricesIncludeTax'] = 'true';
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadBadBool),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('pricesIncludeTax must be a boolean')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion), isNull);
      });

      test('stored snapshot with malformed commercialFxSpread (string or negative) fails closed with FormatException and no mutation', () async {
        // 1. String commercialFxSpread
        final payloadBadString = validBasePayload()..['commercialFxSpread'] = 'invalid_rate';
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadBadString),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('commercialFxSpread must be a non-negative number')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.commercialExchangeRate), isNull);

        // 2. Negative commercialFxSpread
        final payloadNegative = validBasePayload()..['commercialFxSpread'] = -1.25;
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: snapTenant,
            revision: 1,
            fingerprint: fp,
            payload: jsonEncode(payloadNegative),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        expect(
          () => runner.runStartupRepair(),
          throwsA(
            isA<FormatException>()
                .having((e) => e.message, 'message', contains('commercialFxSpread must be a non-negative number')),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
        expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.commercialExchangeRate), isNull);
      });

      test('isProjectionComplete safely rejects malformed fields without throwing unchecked cast errors', () async {
        final handler = FiscalInboxHandler(database);

        // Malformed taxRate: string or negative
        final badTax = validBasePayload()..['taxRate'] = 'not_a_num';
        expect(await handler.isProjectionComplete(badTax, snapTenant), isFalse);

        final negTax = validBasePayload()..['taxRate'] = -0.5;
        expect(await handler.isProjectionComplete(negTax, snapTenant), isFalse);

        // Malformed commercialFxSpread: string or negative
        final badFx = validBasePayload()..['commercialFxSpread'] = 'bad_fx';
        expect(await handler.isProjectionComplete(badFx, snapTenant), isFalse);

        final negFx = validBasePayload()..['commercialFxSpread'] = -2.0;
        expect(await handler.isProjectionComplete(negFx, snapTenant), isFalse);

        // Malformed pricesIncludeTax: non-boolean
        final badBool = validBasePayload()..['pricesIncludeTax'] = 123;
        expect(await handler.isProjectionComplete(badBool, snapTenant), isFalse);
      });

      test('seeds otherwise-complete projection with typed tax isDefault=false, proves repair is required and sets it true, then second startup/replay is no-op', () async {
        final handler = FiscalInboxHandler(database);
        const testTenant = 'tenant-repair-tax-default';
        const testFp = '8888888888888888888888888888888888888888888888888888888888888888';
        final testPayload = {
          'tenantId': testTenant,
          'businessName': 'Default Tax Cafe',
          'fiscalRegime': 'REGIMEN_GENERAL',
          'taxRate': 0.15,
          'pricesIncludeTax': true,
          'configVersion': {'revision': 1, 'fingerprint': testFp},
        };

        // 1. Seed snapshot in fiscal_config_local
        await database.fiscalConfigLocalDao.insertOrReplace(
          FiscalConfigLocalEntity(
            tenantId: testTenant,
            revision: 1,
            fingerprint: testFp,
            payload: jsonEncode(testPayload),
            appliedAt: '2026-03-30T08:00:00.000Z',
          ),
        );

        // 2. Seed all local_configs so that all other projection fields match perfectly
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.fiscalProjectionVersion,
            value: FiscalProjectionKeys.currentVersion.toString(),
            description: 'Fiscal projection version marker',
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.lastAppliedFiscalRevision,
            value: '1',
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.lastAppliedFiscalFingerprint,
            value: testFp,
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.tenantId,
            value: testTenant,
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.businessName,
            value: 'Default Tax Cafe',
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.tenantName,
            value: 'Default Tax Cafe',
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.taxRegime,
            value: 'REGIMEN_GENERAL',
          ),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.pricesIncludeTax,
            value: 'true',
          ),
        );

        // 3. Seed typed tax config matching rate, name, isActive, BUT isDefault=false
        await database.taxConfigDao.insertTaxConfig(
          TaxConfigEntity(
            id: 'fiscal-tax-$testTenant',
            name: 'REGIMEN_GENERAL',
            rate: 0.15,
            isActive: true,
            isDefault: false,
          ),
        );

        // Verify isProjectionComplete detects incomplete projection due to isDefault=false
        expect(await handler.isProjectionComplete(testPayload, testTenant), isFalse);

        // Startup repair run: must detect incomplete projection and repair it
        final firstRun = await runner.runStartupRepair();
        expect(firstRun.status, FiscalProjectionRepairStatus.repaired);
        expect(firstRun.isRepaired, isTrue);

        // Verify typed tax config row in SQLite was updated to isDefault=true
        final taxes = await database.taxConfigDao.getAllTaxConfigs();
        final repairedTax = taxes.firstWhere((t) => t.id == 'fiscal-tax-$testTenant');
        expect(repairedTax.isDefault, isTrue);
        expect(repairedTax.isActive, isTrue);
        expect(repairedTax.rate, 0.15);
        expect(repairedTax.name, 'REGIMEN_GENERAL');

        // Completeness check must now be true
        expect(await handler.isProjectionComplete(testPayload, testTenant), isTrue);

        // Second startup run: must be noOp
        final secondRun = await runner.runStartupRepair();
        expect(secondRun.status, FiscalProjectionRepairStatus.noOp);
        expect(secondRun.isNoOp, isTrue);

        // Second replay via inbox handler: must be noOp
        final replayOutcome = await handler.handleFiscalEnvelope(testPayload);
        expect(replayOutcome.status, FiscalInboxStatus.idempotentNoOp);
        expect(replayOutcome.isIdempotent, isTrue);
      });
    });
  });
}
