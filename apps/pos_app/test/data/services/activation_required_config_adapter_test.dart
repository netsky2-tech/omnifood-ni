import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

void main() {
  late AppDatabase database;
  late ActivationRequiredConfigAdapter adapter;
  final localAuth = LocalAuthService();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    adapter = ActivationRequiredConfigAdapter(
      database: database,
      localAuthService: localAuth,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('ActivationRequiredConfigAdapter (Real SQLite Floor)', () {
    const tenantA = 'tenant-alpha';
    const tenantB = 'tenant-beta';
    const fiscalFingerprintA = '1111111111111111111111111111111111111111111111111111111111111111';

    setUp(() async {
      // Seed valid fiscal config for Tenant A
      final fiscalPayload = jsonEncode({
        'tenantId': tenantA,
        'businessName': 'Comedor Alpha',
        'ruc': 'J0310000000001',
        'fiscalRegime': 'GENERAL',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'configVersion': {
          'revision': 1,
          'fingerprint': fiscalFingerprintA,
        },
        'generatedAt': '2026-09-03T12:00:00.000Z',
      });

      await database.fiscalConfigLocalDao.applyFiscalConfig(
        FiscalConfigLocalEntity(
          tenantId: tenantA,
          revision: 1,
          fingerprint: fiscalFingerprintA,
          payload: fiscalPayload,
          appliedAt: '2026-09-03T12:00:00.000Z',
        ),
      );

      // Seed valid product for Tenant A
      await database.productDao.insertProducts([
        ProductEntity(
          id: 'prod-alpha-1',
          name: 'Nacatamal Navideño',
          uom: 'UND',
          stock: 50.0,
          averageCost: 40.0,
          sellPrice: 120.0,
          isActive: true,
          tenantId: tenantA,
        ),
      ]);

      // Seed valid user & security profile for Tenant A
      final hashedPin = localAuth.hashPin('1234');
      await database.userDao.insertUsers([
        UserEntity(
          id: 'user-alpha-1',
          name: 'Gerente Alpha',
          role: 'ADMIN',
          pinHash: hashedPin,
          isActive: true,
          email: 'gerente@alpha.ni',
          tenantId: tenantA,
        ),
      ]);

      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: 'user-alpha-1',
          pinHash: hashedPin,
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);
    });

    group('ONB1.6D — Verification Product Local Readiness', () {
      test('PASS: product exists in Floor, belongs to tenant, and is active sellable', () async {
        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-alpha-1',
          ),
        );

        expect(result.isPass, isTrue);
        expect(result.status, ActivationCheckStatus.pass);
        expect(result.checkCode, 'REQUIRED_CONFIG_LOCAL');
        expect(result.details['productId'], 'prod-alpha-1');
      });

      test('PASS: verificationProductFingerprint matches canonical hash', () async {
        final product = (await database.productDao.findProductById('prod-alpha-1'))!;
        final canonicalFingerprint = ActivationRequiredConfigAdapter.computeProductFingerprint(
          product,
          tenantId: tenantA,
        );

        final result = await adapter.checkRequiredConfigLocal(
          ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-alpha-1',
            verificationProductRevision: 1,
            verificationProductFingerprint: canonicalFingerprint,
          ),
        );

        expect(result.isPass, isTrue);
      });

      test('FAIL: product not found in SQLite', () async {
        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-non-existent',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.status, ActivationCheckStatus.fail);
        expect(result.reason, contains('not found in local SQLite'));
      });

      test('FAIL: product belongs to different tenant (Tenant B vs Tenant A)', () async {
        // Insert product belonging to Tenant B
        await database.productDao.insertProducts([
          ProductEntity(
            id: 'prod-beta-foreign',
            name: 'Gallo Pinto Beta',
            uom: 'UND',
            stock: 10.0,
            averageCost: 15.0,
            sellPrice: 50.0,
            isActive: true,
            tenantId: tenantB,
          ),
        ]);

        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-beta-foreign',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('belongs to tenant tenant-beta, expected tenant-alpha'));
      });

      test('FAIL: product is inactive (isActive = false)', () async {
        await database.productDao.insertProducts([
          ProductEntity(
            id: 'prod-inactive',
            name: 'Item Inactivo',
            uom: 'UND',
            stock: 10.0,
            averageCost: 10.0,
            sellPrice: 50.0,
            isActive: false,
            tenantId: tenantA,
          ),
        ]);

        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-inactive',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('marked inactive'));
      });

      test('FAIL: product sellPrice <= 0', () async {
        await database.productDao.insertProducts([
          ProductEntity(
            id: 'prod-zero-price',
            name: 'Item Gratis Sin Precio',
            uom: 'UND',
            stock: 10.0,
            averageCost: 10.0,
            sellPrice: 0.0,
            isActive: true,
            tenantId: tenantA,
          ),
        ]);

        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-zero-price',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('sellPrice must be greater than 0'));
      });

      test('FAIL: verificationProductFingerprint mismatch', () async {
        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-alpha-1',
            verificationProductRevision: 1,
            verificationProductFingerprint: '9999999999999999999999999999999999999999999999999999999999999999',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('fingerprint mismatch'));
      });
    });

    group('ONB1.6E — Authorized User Local Readiness', () {
      test('PASS: user exists for tenant, is active, and offline PIN validates without network', () async {
        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-alpha-1',
            testPin: '1234',
          ),
        );

        expect(result.isPass, isTrue);
        expect(result.status, ActivationCheckStatus.pass);
        expect(result.checkCode, 'AUTHORIZED_USER_LOCAL');
        expect(result.details['userId'], 'user-alpha-1');
      });

      test('PASS: resolves user by email and passes offline check', () async {
        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'gerente@alpha.ni',
            testPin: '1234',
          ),
        );

        expect(result.isPass, isTrue);
      });

      test('FAIL: user not found in local SQLite', () async {
        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-unknown',
            testPin: '1234',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('not found in local SQLite'));
      });

      test('FAIL: user belongs to different tenant (Tenant B vs Tenant A)', () async {
        // Insert user for Tenant B
        final pinB = localAuth.hashPin('9999');
        await database.userDao.insertUsers([
          UserEntity(
            id: 'user-beta-foreign',
            name: 'Usuario Beta',
            role: 'CASHIER',
            pinHash: pinB,
            isActive: true,
            tenantId: tenantB,
          ),
        ]);
        await database.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: 'user-beta-foreign',
            pinHash: pinB,
            isPinEnabled: true,
            isTotpEnabled: false,
          ),
        ]);

        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-beta-foreign',
            testPin: '9999',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('belongs to tenant tenant-beta, expected tenant-alpha'));
      });

      test('FAIL: user is inactive', () async {
        final pinInactive = localAuth.hashPin('1111');
        await database.userDao.insertUsers([
          UserEntity(
            id: 'user-inactive',
            name: 'Inactivo',
            role: 'CASHIER',
            pinHash: pinInactive,
            isActive: false,
            tenantId: tenantA,
          ),
        ]);
        await database.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: 'user-inactive',
            pinHash: pinInactive,
            isPinEnabled: true,
            isTotpEnabled: false,
          ),
        ]);

        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-inactive',
            testPin: '1111',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('is inactive'));
      });

      test('FAIL: security profile missing for user', () async {
        await database.userDao.insertUsers([
          UserEntity(
            id: 'user-no-profile',
            name: 'Sin Perfil',
            role: 'CASHIER',
            pinHash: 'somehash',
            isActive: true,
            tenantId: tenantA,
          ),
        ]);

        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-no-profile',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('No security profile found'));
      });

      test('FAIL: no offline credentials enabled in security profile', () async {
        await database.userDao.insertUsers([
          UserEntity(
            id: 'user-disabled-creds',
            name: 'Sin Credenciales',
            role: 'CASHIER',
            pinHash: '',
            isActive: true,
            tenantId: tenantA,
          ),
        ]);
        await database.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: 'user-disabled-creds',
            pinHash: null,
            isPinEnabled: false,
            isTotpEnabled: false,
          ),
        ]);

        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-disabled-creds',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('No offline credentials configured'));
      });

      test('FAIL: offline PIN verification fails with wrong PIN', () async {
        final result = await adapter.checkAuthorizedUserLocal(
          const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-alpha-1',
            testPin: 'wrong-pin',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('Offline PIN verification failed'));
      });
    });

    group('ONB1.6F — Activation Required-Config Unified Adapter', () {
      test('FAIL: fiscal configuration missing for tenant', () async {
        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: 'tenant-unconfigured',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-alpha-1',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('Fiscal configuration not found in local SQLite'));
      });

      test('FAIL: stale/mismatched fiscal revision', () async {
        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 2, // Required is 2, local has 1
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-alpha-1',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('Fiscal revision mismatch (local: 1, required: 2)'));
      });

      test('FAIL: fiscal fingerprint mismatch (integrity conflict)', () async {
        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: 'tampered-fingerprint-99999999999999999999999999999999',
            verificationProductId: 'prod-alpha-1',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('Fiscal fingerprint mismatch'));
      });

      test('FAIL: fiscal payload corrupt JSON', () async {
        await database.fiscalConfigLocalDao.applyFiscalConfig(
          FiscalConfigLocalEntity(
            tenantId: 'tenant-corrupt',
            revision: 1,
            fingerprint: 'corrupt-hash',
            payload: 'NOT_VALID_JSON{:::corrupt',
            appliedAt: '2026-09-03T12:00:00.000Z',
          ),
        );

        final result = await adapter.checkRequiredConfigLocal(
          const ActivationRequiredConfigParams(
            tenantId: 'tenant-corrupt',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: 'corrupt-hash',
            verificationProductId: 'prod-alpha-1',
          ),
        );

        expect(result.isFail, isTrue);
        expect(result.reason, contains('Fiscal payload is corrupt'));
      });

      test('evaluateAll: isReady is true and blockers empty when all checks pass', () async {
        final summary = await adapter.evaluateAll(
          configParams: const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-alpha-1',
          ),
          userParams: const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-alpha-1',
            testPin: '1234',
          ),
        );

        expect(summary.isReady, isTrue);
        expect(summary.blockers, isEmpty);
        expect(summary.requiredConfigResult.isPass, isTrue);
        expect(summary.authorizedUserResult.isPass, isTrue);
      });

      test('evaluateAll: blocks activation (isReady=false) and aggregates blockers when checks fail', () async {
        final summary = await adapter.evaluateAll(
          configParams: const ActivationRequiredConfigParams(
            tenantId: tenantA,
            requiredFiscalRevision: 2, // Stale
            requiredFiscalFingerprint: fiscalFingerprintA,
            verificationProductId: 'prod-non-existent', // Missing
          ),
          userParams: const ActivationAuthorizedUserParams(
            tenantId: tenantA,
            authorizedUserId: 'user-alpha-1',
            testPin: 'wrong-pin', // Bad pin
          ),
        );

        expect(summary.isReady, isFalse);
        expect(summary.blockers, isNotEmpty);
        expect(summary.blockers.length, 2); // Both checks failed
        expect(summary.requiredConfigResult.isFail, isTrue);
        expect(summary.authorizedUserResult.isFail, isTrue);
      });
    });
  });
}
