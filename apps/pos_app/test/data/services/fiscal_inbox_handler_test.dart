import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/data/daos/fiscal_config_local_dao.dart';
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
        throwsA(
          isA<FiscalIntegrityConflictException>()
              .having((e) => e.message, 'message', isNot(contains('bbbbbbbb')))
              .having((e) => e.message, 'message', isNot(contains('aaaaaaaa'))),
        ),
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

    test('projects fiscal snapshot fields to local_configs for UI consumption', () async {
      final outcome = await handler.handleFiscalEnvelope(sampleEnvelope);
      expect(outcome.status, FiscalInboxStatus.applied);

      // Verify business_name
      final businessName = await database.localConfigDao.getConfigByKey('business_name');
      expect(businessName?.value, 'Cafetín Central');

      // Verify ruc
      final ruc = await database.localConfigDao.getConfigByKey('ruc');
      expect(ruc?.value, 'J0310000000001');

      // Verify tax_regime
      final taxRegime = await database.localConfigDao.getConfigByKey('tax_regime');
      expect(taxRegime?.value, 'CUOTA_FIJA');

      // Verify commercial_exchange_rate
      final fxRate = await database.localConfigDao.getConfigByKey('commercial_exchange_rate');
      expect(fxRate?.value, '0.5');

      // Verify tenant_id
      final tid = await database.localConfigDao.getConfigByKey('tenant_id');
      expect(tid?.value, tenantId);

      // Verify tenant_name (mirrors businessName)
      final tName = await database.localConfigDao.getConfigByKey('tenant_name');
      expect(tName?.value, 'Cafetín Central');
    });

    test('omits empty/null optional fields (ruc, commercialFxSpread) from local_configs projection', () async {
      final envelopeWithoutOptionals = {
        'tenantId': tenantId,
        'businessName': 'Solo Nombre',
        'ruc': null,
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'commercialFxSpread': null,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
      };

      final outcome = await handler.handleFiscalEnvelope(envelopeWithoutOptionals);
      expect(outcome.status, FiscalInboxStatus.applied);

      // business_name should be set
      final bn = await database.localConfigDao.getConfigByKey('business_name');
      expect(bn?.value, 'Solo Nombre');

      // tax_regime should be set (required field)
      final tr = await database.localConfigDao.getConfigByKey('tax_regime');
      expect(tr?.value, 'CUOTA_FIJA');

      // ruc should NOT be written (null/empty optional)
      final ruc = await database.localConfigDao.getConfigByKey('ruc');
      expect(ruc, isNull);

      // commercial_exchange_rate should NOT be written (null optional)
      final fx = await database.localConfigDao.getConfigByKey('commercial_exchange_rate');
      expect(fx, isNull);
    });

    group('D-21 (U2 #554): DGI authorization projection', () {
      test('projects dgiAuthorizationCode/IssuedAt/ExpiresAt into local_configs', () async {
        final envelope = {
          ...sampleEnvelope,
          'dgiAuthorizationCode': 'RES-SFC-145/2025',
          'dgiAuthorizationIssuedAt': '2026-01-15',
          'dgiAuthorizationExpiresAt': '2026-02-14',
        };

        final outcome = await handler.handleFiscalEnvelope(envelope);
        expect(outcome.status, FiscalInboxStatus.applied);

        final code =
            await database.localConfigDao.getConfigByKey('dgi_authorization_code');
        expect(code?.value, 'RES-SFC-145/2025');
        final issuedAt = await database.localConfigDao
            .getConfigByKey('dgi_authorization_issued_at');
        expect(issuedAt?.value, '2026-01-15');
        final expiresAt = await database.localConfigDao
            .getConfigByKey('dgi_authorization_expires_at');
        expect(expiresAt?.value, '2026-02-14');
      });

      test('null authorization fields write no keys (absence looks like absence) and do not loop repair', () async {
        final envelopeWithoutAuthorization = {
          ...sampleEnvelope,
          'dgiAuthorizationCode': null,
          'dgiAuthorizationIssuedAt': null,
          'dgiAuthorizationExpiresAt': null,
        };

        final outcome = await handler.handleFiscalEnvelope(envelopeWithoutAuthorization);
        expect(outcome.status, FiscalInboxStatus.applied);

        expect(
          await database.localConfigDao.getConfigByKey('dgi_authorization_code'),
          isNull,
        );
        expect(
          await database.localConfigDao.getConfigByKey('dgi_authorization_issued_at'),
          isNull,
        );
        expect(
          await database.localConfigDao.getConfigByKey('dgi_authorization_expires_at'),
          isNull,
        );

        // The projection must be stable: an immediate replay is a true no-op.
        final replay = await handler.handleFiscalEnvelope(envelopeWithoutAuthorization);
        expect(replay.status, FiscalInboxStatus.idempotentNoOp);
      });

      test('blank authorization strings are treated as absent (no empty-key writes)', () async {
        final envelopeWithBlanks = {
          ...sampleEnvelope,
          'dgiAuthorizationCode': '  ',
          'dgiAuthorizationIssuedAt': '',
        };

        final outcome = await handler.handleFiscalEnvelope(envelopeWithBlanks);
        expect(outcome.status, FiscalInboxStatus.applied);

        expect(
          await database.localConfigDao.getConfigByKey('dgi_authorization_code'),
          isNull,
        );
        expect(
          await database.localConfigDao.getConfigByKey('dgi_authorization_issued_at'),
          isNull,
        );
      });
    });

    test('Q80-A fixture: preseeded snapshot without projections triggers projection repair on first replay and true idempotentNoOp on second replay', () async {
      const q80TenantId = 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a';
      const q80Revision = 1;
      const q80Fingerprint =
          '23317601f4471b3f678e849288ab04fbb83a5fa3c30ccfc989dcac0951281c26';
      const q80BusinessName = 'Founder Pilot Q80 1789164022241-e9530ebc';
      const q80Regime = 'CUOTA_FIJA';

      final q80Envelope = {
        'tenantId': q80TenantId,
        'businessName': q80BusinessName,
        'fiscalRegime': q80Regime,
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        // ruc null/absent
        'configVersion': {
          'revision': q80Revision,
          'fingerprint': q80Fingerprint,
        },
      };

      const initialAppliedAt = '2026-03-30T10:00:00.000Z';
      // Preseed fiscal_config_local and last_applied markers ONLY
      await database.fiscalConfigLocalDao.applyFiscalConfig(
        FiscalConfigLocalEntity(
          tenantId: q80TenantId,
          revision: q80Revision,
          fingerprint: q80Fingerprint,
          payload: jsonEncode(q80Envelope),
          appliedAt: initialAppliedAt,
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'last_applied_fiscal_revision',
          value: q80Revision.toString(),
        ),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'last_applied_fiscal_fingerprint',
          value: q80Fingerprint,
        ),
      );

      // Confirm pre-state: derived projections and version marker are absent
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tax_regime'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tenant_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tenant_id'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);
      expect(await database.taxConfigDao.getAllTaxConfigs(), isEmpty);

      // First identical replay returns projection repair
      final outcome1 = await handler.handleFiscalEnvelope(q80Envelope);
      expect(outcome1.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome1.isRepaired, isTrue);
      expect(outcome1.revision, q80Revision);
      expect(outcome1.fingerprint, q80Fingerprint);

      // Does NOT rewrite snapshot or appliedAt
      final snapshotAfterRepair =
          await database.fiscalConfigLocalDao.getByTenantId(q80TenantId);
      expect(snapshotAfterRepair?.appliedAt, initialAppliedAt);

      // Creates required projections + typed tax + CURRENT marker
      final bn = await database.localConfigDao.getConfigByKey('business_name');
      expect(bn?.value, q80BusinessName);
      final tr = await database.localConfigDao.getConfigByKey('tax_regime');
      expect(tr?.value, q80Regime);
      final tid = await database.localConfigDao.getConfigByKey('tenant_id');
      expect(tid?.value, q80TenantId);
      final tn = await database.localConfigDao.getConfigByKey('tenant_name');
      expect(tn?.value, q80BusinessName);

      final pv = await database.localConfigDao.getConfigByKey('fiscal_projection_version');
      expect(pv?.value, '1');

      final taxes = await database.taxConfigDao.getActiveTaxConfigs();
      expect(taxes, isNotEmpty);
      expect(taxes.first.id, 'fiscal-tax-$q80TenantId');
      expect(taxes.first.rate, 0.0);
      expect(taxes.first.name, q80Regime);

      // Immediate second replay is true idempotentNoOp
      final outcome2 = await handler.handleFiscalEnvelope(q80Envelope);
      expect(outcome2.status, FiscalInboxStatus.idempotentNoOp);
      expect(outcome2.isIdempotent, isTrue);
      expect(outcome2.revision, q80Revision);
      expect(outcome2.fingerprint, q80Fingerprint);
    });

    test('Q80-E: same revision with altered fingerprint remains integrity conflict and mutates no projections', () async {
      const tenantId = 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a';
      const revision = 1;
      const originalFp =
          '23317601f4471b3f678e849288ab04fbb83a5fa3c30ccfc989dcac0951281c26';
      const alteredFp =
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

      await database.fiscalConfigLocalDao.applyFiscalConfig(
        FiscalConfigLocalEntity(
          tenantId: tenantId,
          revision: revision,
          fingerprint: originalFp,
          payload: '{}',
          appliedAt: '2026-03-30T10:00:00.000Z',
        ),
      );

      final alteredEnvelope = {
        'tenantId': tenantId,
        'businessName': 'Tampered Name',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': revision,
          'fingerprint': alteredFp,
        },
      };

      expect(
        () => handler.handleFiscalEnvelope(alteredEnvelope),
        throwsA(
          isA<FiscalIntegrityConflictException>()
              .having((e) => e.message, 'message', isNot(contains(alteredFp)))
              .having((e) => e.message, 'message', isNot(contains(originalFp)))
              .having((e) => e.message, 'message', isNot(contains('Tampered Name'))),
        ),
      );

      // Verify non-throwing path too
      final outcome = await handler.handleFiscalEnvelope(
        alteredEnvelope,
        throwOnConflict: false,
      );
      expect(outcome.status, FiscalInboxStatus.integrityConflict);
      expect(outcome.message, isNot(contains(alteredFp)));
      expect(outcome.message, isNot(contains(originalFp)));
      expect(outcome.message, isNot(contains('Tampered Name')));

      // Mutates no projections
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);
    });

    test('Q80-F: persisted rev2 + incoming rev1 remains stale without repair or mutation', () async {
      const tenantId = 'dddb91ab-74de-4b06-aa8c-f38c6e053b5a';

      await database.fiscalConfigLocalDao.applyFiscalConfig(
        FiscalConfigLocalEntity(
          tenantId: tenantId,
          revision: 2,
          fingerprint:
              '2222222222222222222222222222222222222222222222222222222222222222',
          payload: '{}',
          appliedAt: '2026-03-30T12:00:00.000Z',
        ),
      );

      final staleEnvelope = {
        'tenantId': tenantId,
        'businessName': 'Stale Name',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '1111111111111111111111111111111111111111111111111111111111111111',
        },
      };

      expect(
        () => handler.handleFiscalEnvelope(staleEnvelope),
        throwsA(isA<StaleFiscalRevisionException>()),
      );

      final outcome = await handler.handleFiscalEnvelope(
        staleEnvelope,
        throwOnConflict: false,
      );
      expect(outcome.status, FiscalInboxStatus.staleRevision);

      // Mutates no projections
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);
    });

    test('Q80-G: optional ruc null/absent does not write fake ruc and does not trigger infinite repair', () async {
      const tenantId = 'tenant-q80-g';
      final envelopeWithoutRuc = {
        'tenantId': tenantId,
        'businessName': 'Negocio Sin RUC',
        'fiscalRegime': 'CUOTA_FIJA',
        'ruc': null,
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              'gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg',
        },
      };

      // First call applies
      final outcome1 = await handler.handleFiscalEnvelope(envelopeWithoutRuc);
      expect(outcome1.status, FiscalInboxStatus.applied);

      // RUC key is not written
      final rucConfig = await database.localConfigDao.getConfigByKey('ruc');
      expect(rucConfig, isNull);

      // Second replay is idempotentNoOp (no infinite repair)
      final outcome2 = await handler.handleFiscalEnvelope(envelopeWithoutRuc);
      expect(outcome2.status, FiscalInboxStatus.idempotentNoOp);
      expect(outcome2.isIdempotent, isTrue);

      // Third replay is still idempotentNoOp
      final outcome3 = await handler.handleFiscalEnvelope(envelopeWithoutRuc);
      expect(outcome3.status, FiscalInboxStatus.idempotentNoOp);
    });

    test('marker current but required key missing triggers projection repair', () async {
      const tenantId = 'tenant-marker-repair';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Comercial La Estrella',
        'fiscalRegime': 'REGIMEN_GENERAL',
        'ruc': 'J0310000000002',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
      };

      // First call applies
      final outcome1 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      final versionMarker =
          await database.localConfigDao.getConfigByKey('fiscal_projection_version');
      expect(versionMarker?.value, '1');

      // Simulate accidental deletion of a required key (business_name) while version marker remains current '1'
      await database.localConfigDao.deleteConfig('business_name');
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);

      // Replay should detect missing required key despite marker == '1' and trigger repair
      final outcome2 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome2.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome2.isRepaired, isTrue);

      // business_name is restored
      final restoredBn =
          await database.localConfigDao.getConfigByKey('business_name');
      expect(restoredBn?.value, 'Comercial La Estrella');

      // Next replay is idempotentNoOp
      final outcome3 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome3.status, FiscalInboxStatus.idempotentNoOp);
    });

    test('marker current but wrong value in required key triggers projection repair', () async {
      const tenantId = 'tenant-wrong-value-repair';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Correct Name',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'commercialFxSpread': 0.75,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '1234567890123456789012345678901234567890123456789012345678901234',
        },
      };

      // First call applies
      final outcome1 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      // Corrupt commercial_exchange_rate value
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'commercial_exchange_rate',
          value: '0.10', // Wrong value
        ),
      );

      // Replay should detect wrong value and repair it
      final outcome2 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome2.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome2.isRepaired, isTrue);

      final repairedFx =
          await database.localConfigDao.getConfigByKey('commercial_exchange_rate');
      expect(repairedFx?.value, '0.75');

      // Subsequent replay is idempotentNoOp
      final outcome3 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome3.status, FiscalInboxStatus.idempotentNoOp);
    });

    test('missing or wrong last_applied_fiscal_revision marker triggers projection repair', () async {
      const tenantId = 'tenant-rev-marker-repair';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Revision Marker Cafe',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        },
      };

      // 1. Initial application
      final outcome1 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      // 2. Missing revision marker triggers repair
      await database.localConfigDao.deleteConfig(FiscalProjectionKeys.lastAppliedFiscalRevision);
      expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalRevision), isNull);

      final outcome2 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome2.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome2.isRepaired, isTrue);

      final restoredRev = await database.localConfigDao
          .getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalRevision);
      expect(restoredRev?.value, '1');

      // 3. Wrong revision marker value triggers repair
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: FiscalProjectionKeys.lastAppliedFiscalRevision,
          value: '999',
        ),
      );

      final outcome3 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome3.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome3.isRepaired, isTrue);

      final fixedRev = await database.localConfigDao
          .getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalRevision);
      expect(fixedRev?.value, '1');
    });

    test('missing or wrong last_applied_fiscal_fingerprint marker triggers projection repair', () async {
      const tenantId = 'tenant-fp-marker-repair';
      const fp = 'aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Fingerprint Marker Cafe',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint': fp,
        },
      };

      // 1. Initial application
      final outcome1 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      // 2. Missing fingerprint marker triggers repair
      await database.localConfigDao.deleteConfig(FiscalProjectionKeys.lastAppliedFiscalFingerprint);
      expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalFingerprint), isNull);

      final outcome2 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome2.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome2.isRepaired, isTrue);

      final restoredFp = await database.localConfigDao
          .getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalFingerprint);
      expect(restoredFp?.value, fp);

      // 3. Wrong fingerprint marker value triggers repair
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: FiscalProjectionKeys.lastAppliedFiscalFingerprint,
          value: '0000000000000000000000000000000000000000000000000000000000000000',
        ),
      );

      final outcome3 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome3.status, FiscalInboxStatus.projectionRepaired);
      expect(outcome3.isRepaired, isTrue);

      final fixedFp = await database.localConfigDao
          .getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalFingerprint);
      expect(fixedFp?.value, fp);
    });

    test('stale typed tax in SQLite triggers projection repair and does not retain stale state', () async {
      const tenantId = 'tenant-stale-tax-repair';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Tax State Cafe',
        'fiscalRegime': 'REGIMEN_GENERAL',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '1212121212121212121212121212121212121212121212121212121212121212',
        },
      };

      // Apply initial envelope
      final outcome1 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      // Corrupt typed tax config in DB (simulate out-of-band edit or stale state)
      await database.taxConfigDao.updateTaxConfig(
        TaxConfigEntity(
          id: 'fiscal-tax-$tenantId',
          name: 'OLD_STALE_REGIME',
          rate: 0.05,
          isActive: true,
          isDefault: true,
        ),
      );

      // Completeness must detect stale typed tax state
      expect(await handler.isProjectionComplete(envelope, tenantId), isFalse);

      // Replay should trigger repair and update typed tax to match snapshot
      final outcome2 = await handler.handleFiscalEnvelope(envelope);
      expect(outcome2.status, FiscalInboxStatus.projectionRepaired);

      final taxes = await database.taxConfigDao.getActiveTaxConfigs();
      final tenantTax = taxes.firstWhere((t) => t.id == 'fiscal-tax-$tenantId');
      expect(tenantTax.rate, 0.15);
      expect(tenantTax.name, 'REGIMEN_GENERAL');
      expect(await handler.isProjectionComplete(envelope, tenantId), isTrue);
    });

    test('preserves and distinguishes pricesIncludeTax true vs false across snapshots without stale retain', () async {
      const tenantId = 'tenant-pit-distinguish';
      final rev1Envelope = {
        'tenantId': tenantId,
        'businessName': 'Inclusive vs Exclusive Cafe',
        'fiscalRegime': 'REGIMEN_GENERAL',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '3434343434343434343434343434343434343434343434343434343434343434',
        },
      };

      // Apply rev 1: pricesIncludeTax true
      final outcome1 = await handler.handleFiscalEnvelope(rev1Envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);

      final pit1 = await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.pricesIncludeTax);
      expect(pit1?.value, 'true');
      expect(await handler.isProjectionComplete(rev1Envelope, tenantId), isTrue);

      // Apply rev 2: pricesIncludeTax changed to false, taxRate changed to 0.08
      final rev2Envelope = {
        'tenantId': tenantId,
        'businessName': 'Inclusive vs Exclusive Cafe',
        'fiscalRegime': 'REGIMEN_GENERAL',
        'taxRate': 0.08,
        'pricesIncludeTax': false,
        'configVersion': {
          'revision': 2,
          'fingerprint':
              '5656565656565656565656565656565656565656565656565656565656565656',
        },
      };

      final outcome2 = await handler.handleFiscalEnvelope(rev2Envelope);
      expect(outcome2.status, FiscalInboxStatus.applied);

      // Verify new pricesIncludeTax false cleanly replaces true
      final pit2 = await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.pricesIncludeTax);
      expect(pit2?.value, 'false');

      // Verify typed tax config updated cleanly from 0.15 to 0.08
      final taxes2 = await database.taxConfigDao.getActiveTaxConfigs();
      final tenantTax2 = taxes2.firstWhere((t) => t.id == 'fiscal-tax-$tenantId');
      expect(tenantTax2.rate, 0.08);

      expect(await handler.isProjectionComplete(rev2Envelope, tenantId), isTrue);
    });

    test('Q80-C real SQLite rollback: obligatory intermediate write failure rolls back snapshot and projections; removing failure allows clean retry', () async {
      const tenantId = 'tenant-q80-c';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Restaurante Rollback Real',
        'ruc': 'J0310000000003',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '3333333333333333333333333333333333333333333333333333333333333333',
        },
      };

      // Confirm pre-existing state is clean
      expect(await database.fiscalConfigLocalDao.getByTenantId(tenantId), isNull);
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);

      // Install a SQLite trigger on an obligatory intermediate write (business_name)
      await database.database.execute(
        "CREATE TRIGGER trigger_fail_business_name "
        "BEFORE INSERT ON local_configs "
        "FOR EACH ROW "
        "WHEN NEW.key = 'business_name' "
        "BEGIN "
        "  SELECT RAISE(ABORT, 'controlled SQLite trigger error on business_name'); "
        "END;",
      );

      // Attempt application — must fail with real database exception from trigger
      await expectLater(
        handler.handleFiscalEnvelope(envelope),
        throwsA(isA<DatabaseException>()),
      );

      // Verify ATOMIC ROLLBACK in real SQLite:
      // The snapshot MUST NOT be in fiscal_config_local (must NOT become idempotency guard!)
      final rolledBackSnapshot =
          await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(rolledBackSnapshot, isNull);

      // No projections, markers, or completion version written
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('ruc'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tax_regime'), isNull);
      expect(await database.localConfigDao.getConfigByKey('last_applied_fiscal_revision'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);
      expect(await database.taxConfigDao.getAllTaxConfigs(), isEmpty);

      // Remove the controlled failure
      await database.database.execute("DROP TRIGGER trigger_fail_business_name;");

      // Retry application — must succeed normally because snapshot was not falsely retained
      final retryOutcome = await handler.handleFiscalEnvelope(envelope);
      expect(retryOutcome.status, FiscalInboxStatus.applied);
      expect(retryOutcome.isApplied, isTrue);

      // Assert complete persisted state after clean retry
      final snapshot = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(snapshot, isNotNull);
      expect(snapshot?.revision, 1);

      final bn = await database.localConfigDao.getConfigByKey('business_name');
      expect(bn?.value, 'Restaurante Rollback Real');

      final completionMarker =
          await database.localConfigDao.getConfigByKey('fiscal_projection_version');
      expect(completionMarker?.value, '1');

      // Second replay is idempotentNoOp
      final secondReplay = await handler.handleFiscalEnvelope(envelope);
      expect(secondReplay.status, FiscalInboxStatus.idempotentNoOp);
      expect(secondReplay.isIdempotent, isTrue);
    });

    test('repair failure leaves pre-existing canonical snapshot rev/fingerprint/appliedAt unchanged and completion marker not advanced', () async {
      const tenantId = 'tenant-repair-rollback';
      const originalRev = 1;
      const originalFp =
          '4444444444444444444444444444444444444444444444444444444444444444';
      const initialAppliedAt = '2026-03-30T08:00:00.000Z';

      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Repair Rollback Cafe',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': originalRev,
          'fingerprint': originalFp,
        },
      };

      // Preseed snapshot with initial timestamp, but NO projections (repair needed)
      await database.fiscalConfigLocalDao.applyFiscalConfig(
        FiscalConfigLocalEntity(
          tenantId: tenantId,
          revision: originalRev,
          fingerprint: originalFp,
          payload: jsonEncode(envelope),
          appliedAt: initialAppliedAt,
        ),
      );

      // Install trigger failure on typed tax insert
      await database.database.execute(
        "CREATE TRIGGER trigger_fail_tax "
        "BEFORE INSERT ON tax_configurations "
        "FOR EACH ROW "
        "BEGIN "
        "  SELECT RAISE(ABORT, 'controlled SQLite trigger error on tax_configurations'); "
        "END;",
      );

      // Attempt repair — should fail on tax write
      await expectLater(
        handler.handleFiscalEnvelope(envelope),
        throwsA(isA<DatabaseException>()),
      );

      // Assert canonical snapshot is COMPLETELY UNCHANGED
      final snapshotAfterFail =
          await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(snapshotAfterFail, isNotNull);
      expect(snapshotAfterFail?.revision, originalRev);
      expect(snapshotAfterFail?.fingerprint, originalFp);
      expect(snapshotAfterFail?.appliedAt, initialAppliedAt);

      // Intermediate projections and completion marker MUST NOT be left partially persisted
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);

      // Drop trigger and retry repair
      await database.database.execute("DROP TRIGGER trigger_fail_tax;");

      final repairOutcome = await handler.handleFiscalEnvelope(envelope);
      expect(repairOutcome.status, FiscalInboxStatus.projectionRepaired);
      expect(repairOutcome.isRepaired, isTrue);

      // Canonical snapshot appliedAt STILL unchanged after repair
      final snapshotAfterSuccess =
          await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(snapshotAfterSuccess?.appliedAt, initialAppliedAt);

      // Projections and completion marker now present
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNotNull);
      final taxes = await database.taxConfigDao.getActiveTaxConfigs();
      expect(taxes, isNotEmpty);
    });

    test('Q80-D normal N->N+1: snapshot, projections, typed tax, markers, completion update atomically; outcome applied; identical second replay no-op', () async {
      const tenantId = 'tenant-q80-d';
      final rev1Envelope = {
        'tenantId': tenantId,
        'businessName': 'Cafetín Versión 1',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '1111111111111111111111111111111111111111111111111111111111111111',
        },
      };

      // 1. Apply Rev 1 (N)
      final outcome1 = await handler.handleFiscalEnvelope(rev1Envelope);
      expect(outcome1.status, FiscalInboxStatus.applied);
      expect(outcome1.isApplied, isTrue);
      expect(outcome1.revision, 1);

      final snapshot1 = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(snapshot1?.revision, 1);
      final bn1 = await database.localConfigDao.getConfigByKey('business_name');
      expect(bn1?.value, 'Cafetín Versión 1');
      final markerRev1 =
          await database.localConfigDao.getConfigByKey('last_applied_fiscal_revision');
      expect(markerRev1?.value, '1');
      final markerVer1 =
          await database.localConfigDao.getConfigByKey('fiscal_projection_version');
      expect(markerVer1?.value, '1');

      // 2. Apply Rev 2 (N+1)
      final rev2Envelope = {
        'tenantId': tenantId,
        'businessName': 'Restaurante Versión 2',
        'fiscalRegime': 'REGIMEN_GENERAL',
        'ruc': 'J0310000000099',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'commercialFxSpread': 0.85,
        'configVersion': {
          'revision': 2,
          'fingerprint':
              '2222222222222222222222222222222222222222222222222222222222222222',
        },
      };

      final outcome2 = await handler.handleFiscalEnvelope(rev2Envelope);
      expect(outcome2.status, FiscalInboxStatus.applied);
      expect(outcome2.isApplied, isTrue);
      expect(outcome2.revision, 2);

      // Verify all atomic updates for Rev 2
      final snapshot2 = await database.fiscalConfigLocalDao.getByTenantId(tenantId);
      expect(snapshot2?.revision, 2);
      expect(snapshot2?.fingerprint, '2222222222222222222222222222222222222222222222222222222222222222');

      final bn2 = await database.localConfigDao.getConfigByKey('business_name');
      expect(bn2?.value, 'Restaurante Versión 2');
      final ruc2 = await database.localConfigDao.getConfigByKey('ruc');
      expect(ruc2?.value, 'J0310000000099');
      final regime2 = await database.localConfigDao.getConfigByKey('tax_regime');
      expect(regime2?.value, 'REGIMEN_GENERAL');
      final fx2 = await database.localConfigDao.getConfigByKey('commercial_exchange_rate');
      expect(fx2?.value, '0.85');

      final markerRev2 =
          await database.localConfigDao.getConfigByKey('last_applied_fiscal_revision');
      expect(markerRev2?.value, '2');
      final markerFp2 =
          await database.localConfigDao.getConfigByKey('last_applied_fiscal_fingerprint');
      expect(markerFp2?.value, '2222222222222222222222222222222222222222222222222222222222222222');
      final markerVer2 =
          await database.localConfigDao.getConfigByKey('fiscal_projection_version');
      expect(markerVer2?.value, '1');

      final taxes2 = await database.taxConfigDao.getActiveTaxConfigs();
      expect(taxes2.first.rate, 0.15);
      expect(taxes2.first.name, 'REGIMEN_GENERAL');

      // 3. Second replay of Rev 2 is idempotentNoOp
      final outcome3 = await handler.handleFiscalEnvelope(rev2Envelope);
      expect(outcome3.status, FiscalInboxStatus.idempotentNoOp);
      expect(outcome3.isIdempotent, isTrue);
      expect(outcome3.revision, 2);
    });

    test('failure on typed tax write during new snapshot rolls back snapshot and all projections', () async {
      const tenantId = 'tenant-tax-fail';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Tax Failure Diner',
        'fiscalRegime': 'REGIMEN_GENERAL',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '5555555555555555555555555555555555555555555555555555555555555555',
        },
      };

      await database.database.execute(
        "CREATE TRIGGER trigger_fail_tax_new "
        "BEFORE INSERT ON tax_configurations "
        "FOR EACH ROW "
        "BEGIN "
        "  SELECT RAISE(ABORT, 'controlled tax insert error'); "
        "END;",
      );

      await expectLater(
        handler.handleFiscalEnvelope(envelope),
        throwsA(isA<DatabaseException>()),
      );

      // Verify DB rolled back completely
      expect(await database.fiscalConfigLocalDao.getByTenantId(tenantId), isNull);
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);

      await database.database.execute("DROP TRIGGER trigger_fail_tax_new;");

      final retry = await handler.handleFiscalEnvelope(envelope);
      expect(retry.status, FiscalInboxStatus.applied);
      expect(await database.fiscalConfigLocalDao.getByTenantId(tenantId), isNotNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNotNull);
    });

    test('failure on completion marker write rolls back snapshot and all intermediate projections', () async {
      const tenantId = 'tenant-marker-fail';
      final envelope = {
        'tenantId': tenantId,
        'businessName': 'Marker Failure Cafe',
        'fiscalRegime': 'CUOTA_FIJA',
        'taxRate': 0.0,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              '6666666666666666666666666666666666666666666666666666666666666666',
        },
      };

      // Fails when inserting the completion marker LAST
      await database.database.execute(
        "CREATE TRIGGER trigger_fail_marker "
        "BEFORE INSERT ON local_configs "
        "FOR EACH ROW "
        "WHEN NEW.key = 'fiscal_projection_version' "
        "BEGIN "
        "  SELECT RAISE(ABORT, 'controlled completion marker error'); "
        "END;",
      );

      await expectLater(
        handler.handleFiscalEnvelope(envelope),
        throwsA(isA<DatabaseException>()),
      );

      // Snapshot and intermediate projections (business_name, tax_regime, legacy markers) must all be rolled back
      expect(await database.fiscalConfigLocalDao.getByTenantId(tenantId), isNull);
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      expect(await database.localConfigDao.getConfigByKey('tax_regime'), isNull);
      expect(await database.localConfigDao.getConfigByKey('last_applied_fiscal_revision'), isNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNull);

      await database.database.execute("DROP TRIGGER trigger_fail_marker;");

      final retry = await handler.handleFiscalEnvelope(envelope);
      expect(retry.status, FiscalInboxStatus.applied);
      expect(await database.fiscalConfigLocalDao.getByTenantId(tenantId), isNotNull);
      expect(await database.localConfigDao.getConfigByKey('business_name'), isNotNull);
      expect(await database.localConfigDao.getConfigByKey('fiscal_projection_version'), isNotNull);
    });

    group('Payload transitions & stale optional mirrors (Finding A)', () {
      const transitionTenant = 'tenant-transition-1';

      test('absence of optional ruc and commercialFxSpread in newer snapshot atomically removes stale legacy keys', () async {
        final rev1Envelope = {
          'tenantId': transitionTenant,
          'businessName': 'Restaurante El Lago',
          'ruc': 'J0310000000001',
          'fiscalRegime': 'REGIMEN_GENERAL',
          'taxRate': 0.15,
          'pricesIncludeTax': true,
          'commercialFxSpread': 0.75,
          'configVersion': {
            'revision': 1,
            'fingerprint':
                '1111111111111111111111111111111111111111111111111111111111111111',
          },
        };

        // Apply rev 1
        final outcome1 = await handler.handleFiscalEnvelope(rev1Envelope);
        expect(outcome1.status, FiscalInboxStatus.applied);

        // Verify ruc and commercial_exchange_rate exist
        final ruc1 = await database.localConfigDao.getConfigByKey('ruc');
        expect(ruc1?.value, 'J0310000000001');
        final fx1 = await database.localConfigDao.getConfigByKey('commercial_exchange_rate');
        expect(fx1?.value, '0.75');

        // Prepare rev 2: optional fields omitted / null
        final rev2Envelope = {
          'tenantId': transitionTenant,
          'businessName': 'Restaurante El Lago Renovado',
          'ruc': null,
          'fiscalRegime': 'CUOTA_FIJA',
          'taxRate': 0.0,
          'pricesIncludeTax': true,
          'commercialFxSpread': null,
          'configVersion': {
            'revision': 2,
            'fingerprint':
                '2222222222222222222222222222222222222222222222222222222222222222',
          },
        };

        // Apply rev 2
        final outcome2 = await handler.handleFiscalEnvelope(rev2Envelope);
        expect(outcome2.status, FiscalInboxStatus.applied);

        // Required fields updated
        final bn2 = await database.localConfigDao.getConfigByKey('business_name');
        expect(bn2?.value, 'Restaurante El Lago Renovado');
        final regime2 = await database.localConfigDao.getConfigByKey('tax_regime');
        expect(regime2?.value, 'CUOTA_FIJA');
        final tn2 = await database.localConfigDao.getConfigByKey('tenant_name');
        expect(tn2?.value, 'Restaurante El Lago Renovado');

        // Optional fields MUST BE REMOVED atomically
        final ruc2 = await database.localConfigDao.getConfigByKey('ruc');
        expect(ruc2, isNull, reason: 'Stale RUC key must be removed when absent in newer snapshot');
        final fx2 = await database.localConfigDao.getConfigByKey('commercial_exchange_rate');
        expect(fx2, isNull, reason: 'Stale commercialFxSpread key must be removed when absent in newer snapshot');

        // Completeness evaluates to true
        expect(await handler.isProjectionComplete(rev2Envelope, transitionTenant), isTrue);

        // If a stale optional key is manually re-inserted, completeness detects it and returns false
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'ruc', value: 'stale-ruc-value'),
        );
        expect(
          await handler.isProjectionComplete(rev2Envelope, transitionTenant),
          isFalse,
          reason: 'Completeness must detect stale optional keys that should be absent',
        );
      });
    });

    group('Validation reliability for required fields and invalid shapes (Findings A & F)', () {
      const vTenant = 'tenant-validation-1';

      Map<String, dynamic> validEnvelope() => {
            'tenantId': vTenant,
            'businessName': 'Valid Business',
            'fiscalRegime': 'CUOTA_FIJA',
            'taxRate': 0.0,
            'pricesIncludeTax': true,
            'commercialFxSpread': 0.5,
            'configVersion': {
              'revision': 1,
              'fingerprint':
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            },
          };

      test('missing or empty tenantId throws ArgumentError and does not mutate DB', () async {
        final envMissing = validEnvelope()..remove('tenantId');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envEmpty = validEnvelope()..['tenantId'] = '   ';
        expect(() => handler.handleFiscalEnvelope(envEmpty), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      });

      test('missing or blank businessName throws ArgumentError and does not mutate DB', () async {
        final envMissing = validEnvelope()..remove('businessName');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envEmpty = validEnvelope()..['businessName'] = ' \t ';
        expect(() => handler.handleFiscalEnvelope(envEmpty), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
      });

      test('missing or blank fiscalRegime throws ArgumentError and does not mutate DB', () async {
        final envMissing = validEnvelope()..remove('fiscalRegime');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envEmpty = validEnvelope()..['fiscalRegime'] = '';
        expect(() => handler.handleFiscalEnvelope(envEmpty), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
      });

      test('missing or invalid revision throws ArgumentError and does not mutate DB', () async {
        final envMissing = validEnvelope();
        (envMissing['configVersion'] as Map).remove('revision');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envFractional = validEnvelope();
        (envFractional['configVersion'] as Map)['revision'] = 1.5;
        expect(() => handler.handleFiscalEnvelope(envFractional), throwsArgumentError);

        final envNegative = validEnvelope();
        (envNegative['configVersion'] as Map)['revision'] = -1;
        expect(() => handler.handleFiscalEnvelope(envNegative), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
      });

      test('missing or invalid fingerprint shape throws ArgumentError without raw fingerprint in message', () async {
        final envMissing = validEnvelope();
        (envMissing['configVersion'] as Map).remove('fingerprint');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envShort = validEnvelope();
        (envShort['configVersion'] as Map)['fingerprint'] = 'short';
        expect(
          () => handler.handleFiscalEnvelope(envShort),
          throwsA(
            isA<ArgumentError>().having(
              (e) => e.message,
              'message',
              isNot(contains('short')),
            ),
          ),
        );

        final envSpaces = validEnvelope();
        (envSpaces['configVersion'] as Map)['fingerprint'] = '1111 2222 3333 4444';
        expect(() => handler.handleFiscalEnvelope(envSpaces), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
      });

      test('missing or null taxRate throws ArgumentError and does not mutate DB', () async {
        final envMissing = validEnvelope()..remove('taxRate');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envNull = validEnvelope()..['taxRate'] = null;
        expect(() => handler.handleFiscalEnvelope(envNull), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
        expect(await database.taxConfigDao.getAllTaxConfigs(), isEmpty);
      });

      test('missing or null pricesIncludeTax throws ArgumentError and does not mutate DB', () async {
        final envMissing = validEnvelope()..remove('pricesIncludeTax');
        expect(() => handler.handleFiscalEnvelope(envMissing), throwsArgumentError);

        final envNull = validEnvelope()..['pricesIncludeTax'] = null;
        expect(() => handler.handleFiscalEnvelope(envNull), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
        expect(await database.localConfigDao.getConfigByKey(FiscalProjectionKeys.pricesIncludeTax), isNull);
      });

      test('invalid taxRate, pricesIncludeTax, or commercialFxSpread throws ArgumentError and does not mutate DB', () async {
        final envNegativeTax = validEnvelope()..['taxRate'] = -0.15;
        expect(() => handler.handleFiscalEnvelope(envNegativeTax), throwsArgumentError);

        final envBadBool = validEnvelope()..['pricesIncludeTax'] = 'true';
        expect(() => handler.handleFiscalEnvelope(envBadBool), throwsArgumentError);

        final envBadFx = validEnvelope()..['commercialFxSpread'] = 'invalid_fx';
        expect(() => handler.handleFiscalEnvelope(envBadFx), throwsArgumentError);

        final envNegativeFx = validEnvelope()..['commercialFxSpread'] = -1.0;
        expect(() => handler.handleFiscalEnvelope(envNegativeFx), throwsArgumentError);

        expect(await database.fiscalConfigLocalDao.getAll(), isEmpty);
      });
    });

    group('Concurrency & DAO transactional preconditions (Finding D)', () {
      const daoTenant = 'tenant-dao-preconditions';

      final completionMarker = LocalConfigEntity(
        key: FiscalProjectionKeys.fiscalProjectionVersion,
        value: FiscalProjectionKeys.currentVersion.toString(),
      );

      test('executeFiscalEnvelopeTransaction rejects stale revision and commits zero writes', () async {
        // Pre-seed snapshot with revision 2
        final rev2 = FiscalConfigLocalEntity(
          tenantId: daoTenant,
          revision: 2,
          fingerprint: '2222222222222222222222222222222222222222222222222222222222222222',
          payload: jsonEncode({'businessName': 'Rev 2'}),
          appliedAt: '2026-03-30T12:00:00Z',
        );
        await database.fiscalConfigLocalDao.insertOrReplace(rev2);

        // Attempt applying revision 1 (stale incoming envelope)
        final rev1 = FiscalConfigLocalEntity(
          tenantId: daoTenant,
          revision: 1,
          fingerprint: '1111111111111111111111111111111111111111111111111111111111111111',
          payload: jsonEncode({'businessName': 'Stale Rev 1'}),
          appliedAt: '2026-03-30T10:00:00Z',
        );

        expect(
          () => database.fiscalConfigLocalDao.executeFiscalEnvelopeTransaction(
            rev1,
            daoTenant,
            1,
            rev1.fingerprint,
            [LocalConfigEntity(key: 'business_name', value: 'Stale Rev 1')],
            [],
            null,
            completionMarker,
          ),
          throwsA(
            isA<FiscalPreconditionException>().having(
              (e) => e.reason,
              'reason',
              FiscalPreconditionReason.staleRevision,
            ),
          ),
        );

        // Canonical state in DB must remain rev 2, no stale projection written
        final stored = await database.fiscalConfigLocalDao.getByTenantId(daoTenant);
        expect(stored!.revision, 2);
        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      });

      test('executeFiscalEnvelopeTransaction rejects integrity conflict in transaction', () async {
        final rev2 = FiscalConfigLocalEntity(
          tenantId: daoTenant,
          revision: 2,
          fingerprint: '2222222222222222222222222222222222222222222222222222222222222222',
          payload: jsonEncode({'businessName': 'Rev 2'}),
          appliedAt: '2026-03-30T12:00:00Z',
        );
        await database.fiscalConfigLocalDao.insertOrReplace(rev2);

        // Attempt applying same rev 2 with tampered fingerprint
        final tampered = FiscalConfigLocalEntity(
          tenantId: daoTenant,
          revision: 2,
          fingerprint: '9999999999999999999999999999999999999999999999999999999999999999',
          payload: jsonEncode({'businessName': 'Tampered Rev 2'}),
          appliedAt: '2026-03-30T13:00:00Z',
        );

        expect(
          () => database.fiscalConfigLocalDao.executeFiscalEnvelopeTransaction(
            tampered,
            daoTenant,
            2,
            tampered.fingerprint,
            [LocalConfigEntity(key: 'business_name', value: 'Tampered Rev 2')],
            [],
            null,
            completionMarker,
          ),
          throwsA(
            isA<FiscalPreconditionException>().having(
              (e) => e.reason,
              'reason',
              FiscalPreconditionReason.integrityConflict,
            ),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      });

      test('executeFiscalEnvelopeTransaction repair rejects replaced snapshot', () async {
        // DB currently has rev 2
        final rev2 = FiscalConfigLocalEntity(
          tenantId: daoTenant,
          revision: 2,
          fingerprint: '2222222222222222222222222222222222222222222222222222222222222222',
          payload: jsonEncode({'businessName': 'Rev 2'}),
          appliedAt: '2026-03-30T12:00:00Z',
        );
        await database.fiscalConfigLocalDao.insertOrReplace(rev2);

        // Repair runner thought it was repairing rev 1
        expect(
          () => database.fiscalConfigLocalDao.executeFiscalEnvelopeTransaction(
            null, // repair mode
            daoTenant,
            1, // expected rev 1
            '1111111111111111111111111111111111111111111111111111111111111111',
            [LocalConfigEntity(key: 'business_name', value: 'Old Projections')],
            [],
            null,
            completionMarker,
          ),
          throwsA(
            isA<FiscalPreconditionException>().having(
              (e) => e.reason,
              'reason',
              FiscalPreconditionReason.snapshotReplaced,
            ),
          ),
        );

        expect(await database.localConfigDao.getConfigByKey('business_name'), isNull);
      });
    });
  });
}
