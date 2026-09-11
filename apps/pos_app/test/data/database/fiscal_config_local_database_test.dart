import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';

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

  group('FiscalConfigLocalDao (Real SQLite Persistence)', () {
    const tenantId = 'tenant-sqlite-test-1';
    final samplePayload = jsonEncode({
      'businessName': 'Comedor Central Granada',
      'commercialFxSpread': 0.5,
      'fiscalRegime': 'REGIMEN_GENERAL',
      'pricesIncludeTax': true,
      'ruc': 'J0310000000001',
      'taxRate': 0.15,
      'tenantId': tenantId,
    });
    const fingerprint = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    test('stores and retrieves fiscal config local projection by tenantId', () async {
      final entity = FiscalConfigLocalEntity(
        tenantId: tenantId,
        revision: 1,
        fingerprint: fingerprint,
        payload: samplePayload,
        appliedAt: '2026-03-30T10:00:00Z',
      );

      await database.fiscalConfigLocalDao.insertOrReplace(entity);

      final retrieved = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(retrieved, isNotNull);
      expect(retrieved!.tenantId, tenantId);
      expect(retrieved.revision, 1);
      expect(retrieved.fingerprint, fingerprint);
      expect(retrieved.payload, samplePayload);
      expect(retrieved.appliedAt, '2026-03-30T10:00:00Z');
    });

    test('replaces existing projection on new revision without duplicate rows', () async {
      final rev1 = FiscalConfigLocalEntity(
        tenantId: tenantId,
        revision: 1,
        fingerprint: fingerprint,
        payload: samplePayload,
        appliedAt: '2026-03-30T10:00:00Z',
      );
      await database.fiscalConfigLocalDao.insertOrReplace(rev1);

      const newFingerprint = 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb';
      final rev2Payload = jsonEncode({
        'businessName': 'Comedor Central Granada Renovado',
        'commercialFxSpread': 0.75,
        'fiscalRegime': 'REGIMEN_GENERAL',
        'pricesIncludeTax': true,
        'ruc': 'J0310000000001',
        'taxRate': 0.15,
        'tenantId': tenantId,
      });
      final rev2 = FiscalConfigLocalEntity(
        tenantId: tenantId,
        revision: 2,
        fingerprint: newFingerprint,
        payload: rev2Payload,
        appliedAt: '2026-03-30T11:00:00Z',
      );
      await database.fiscalConfigLocalDao.insertOrReplace(rev2);

      final current = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(current!.revision, 2);
      expect(current.fingerprint, newFingerprint);
      expect(current.payload, rev2Payload);

      final all = await database.fiscalConfigLocalDao.getAll();
      expect(all.length, 1);
    });

    test('transactional applyFiscalConfig operates atomically with positional parameter', () async {
      final entity = FiscalConfigLocalEntity(
        tenantId: 'tenant-tx-1',
        revision: 5,
        fingerprint: 'tx-fingerprint-1234567890',
        payload: samplePayload,
        appliedAt: '2026-03-30T12:00:00Z',
      );

      await database.fiscalConfigLocalDao.applyFiscalConfig(entity);

      final retrieved = await database.fiscalConfigLocalDao.getByTenantId('tenant-tx-1');
      expect(retrieved, isNotNull);
      expect(retrieved!.revision, 5);
      expect(retrieved.appliedAt, '2026-03-30T12:00:00Z');
    });

    test('returns null for non-existent tenant', () async {
      final none = await database.fiscalConfigLocalDao.getByTenantId('missing-tenant');
      expect(none, isNull);
    });
  });
}
