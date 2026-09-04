import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';

void main() {
  late AppDatabase database;
  late FiscalInboxHandler handler;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    handler = FiscalInboxHandler(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('FiscalInboxHandler (Real SQLite Persistence & Idempotency)', () {
    const tenantId = 'tenant-inbox-1';
    final sampleEnvelope = {
      'tenantId': tenantId,
      'businessName': 'Cafetín Central',
      'ruc': 'J0310000000001',
      'fiscalRegime': 'CUOTA_FIJA',
      'taxRate': 0.0,
      'pricesIncludeTax': true,
      'commercialFxSpread': 0.5,
      'configVersion': {
        'revision': 1,
        'fingerprint':
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      'generatedAt': '2026-03-30T10:00:00.000Z',
    };

    test('applies fiscal envelope to SQLite and updates markers and tax config', () async {
      final outcome = await handler.handleFiscalEnvelope(sampleEnvelope);

      expect(outcome.status, FiscalInboxStatus.applied);
      expect(outcome.revision, 1);
      expect(outcome.fingerprint,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      // Verify row in fiscal_config_local
      final local = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(local, isNotNull);
      expect(local!.revision, 1);
      expect(local.fingerprint,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      // Verify local_configs markers
      final revMarker = await database.localConfigDao
          .getConfigByKey('last_applied_fiscal_revision');
      expect(revMarker?.value, '1');

      final fpMarker = await database.localConfigDao
          .getConfigByKey('last_applied_fiscal_fingerprint');
      expect(fpMarker?.value,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      // Verify tax config projection
      final taxes = await database.taxConfigDao.getActiveTaxConfigs();
      expect(taxes, isNotEmpty);
      expect(taxes.first.rate, 0.0);
    });

    test('idempotency: identical duplicate envelope is a no-op without mutation', () async {
      final outcome1 = await handler.handleFiscalEnvelope(sampleEnvelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      final localBefore =
          await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      final appliedAtBefore = localBefore!.appliedAt;

      // Send exact duplicate
      final outcome2 = await handler.handleFiscalEnvelope(sampleEnvelope);
      expect(outcome2.status, FiscalInboxStatus.idempotentNoOp);
      expect(outcome2.isIdempotent, isTrue);

      final localAfter =
          await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(localAfter!.appliedAt, appliedAtBefore); // Not mutated!
    });

    test('integrity conflict: same revision with altered fingerprint throws and blocks write', () async {
      await handler.handleFiscalEnvelope(sampleEnvelope);

      final tamperedEnvelope = {
        ...sampleEnvelope,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      };

      expect(
        () => handler.handleFiscalEnvelope(tamperedEnvelope),
        throwsA(isA<FiscalIntegrityConflictException>()),
      );

      // Verify DB was NOT corrupted
      final local = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(local!.fingerprint,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    test('anti-downgrade: lower revision is rejected with StaleFiscalRevisionException', () async {
      // First apply revision 2
      final rev2Envelope = {
        ...sampleEnvelope,
        'configVersion': {
          'revision': 2,
          'fingerprint':
              '2222222222222222222222222222222222222222222222222222222222222222',
        },
      };
      await handler.handleFiscalEnvelope(rev2Envelope);

      // Attempt to apply stale revision 1
      expect(
        () => handler.handleFiscalEnvelope(sampleEnvelope),
        throwsA(isA<StaleFiscalRevisionException>()),
      );

      final local = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(local!.revision, 2);
    });

    test('upgrade: strictly higher revision applies successfully', () async {
      await handler.handleFiscalEnvelope(sampleEnvelope);

      final rev2Envelope = {
        ...sampleEnvelope,
        'businessName': 'Cafetín Central Modernizado',
        'configVersion': {
          'revision': 2,
          'fingerprint':
              '2222222222222222222222222222222222222222222222222222222222222222',
        },
      };

      final outcome = await handler.handleFiscalEnvelope(rev2Envelope);
      expect(outcome.status, FiscalInboxStatus.applied);
      expect(outcome.revision, 2);

      final local = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(local!.revision, 2);
      expect(local.fingerprint,
          '2222222222222222222222222222222222222222222222222222222222222222');
    });
  });
}
