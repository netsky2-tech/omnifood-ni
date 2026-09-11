import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

void main() {
  late Directory tempDir;
  late String dbPath;
  final localAuth = LocalAuthService();

  const tenantAlpha = 'tenant-alpha-enterprise';
  const tenantBeta = 'tenant-beta-retail';

  const fiscalFpAlpha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const fiscalFpBeta = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('pos_activation_it_');
    dbPath = p.join(tempDir.path, 'pos_activation_test.db');
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      await tempDir.delete(recursive: true);
    }
  });

  test(
      'Two-Tenant Isolation & Offline Restart Durability: required-config adapter verifies local projection without WAN',
      () async {
    // -------------------------------------------------------------
    // PHASE 1: Populate real SQLite database on disk with two tenants
    // -------------------------------------------------------------
    var db = await $FloorAppDatabase
        .databaseBuilder(dbPath)
        .addMigrations(allMigrations)
        .build();

    // 1. Fiscal configs
    final alphaFiscalPayload = jsonEncode({
      'tenantId': tenantAlpha,
      'businessName': 'Comercial Alpha S.A.',
      'ruc': 'J0310000000001',
      'fiscalRegime': 'GENERAL',
      'taxRate': 0.15,
      'pricesIncludeTax': true,
      'configVersion': {'revision': 1, 'fingerprint': fiscalFpAlpha},
      'generatedAt': '2026-09-03T14:00:00.000Z',
    });

    final betaFiscalPayload = jsonEncode({
      'tenantId': tenantBeta,
      'businessName': 'Tienda Beta',
      'ruc': 'J0310000000002',
      'fiscalRegime': 'CUOTA_FIJA',
      'taxRate': 0.0,
      'pricesIncludeTax': true,
      'configVersion': {'revision': 2, 'fingerprint': fiscalFpBeta},
      'generatedAt': '2026-09-03T14:05:00.000Z',
    });

    await db.fiscalConfigLocalDao.applyFiscalConfig(
      FiscalConfigLocalEntity(
        tenantId: tenantAlpha,
        revision: 1,
        fingerprint: fiscalFpAlpha,
        payload: alphaFiscalPayload,
        appliedAt: '2026-09-03T14:00:00.000Z',
      ),
    );

    await db.fiscalConfigLocalDao.applyFiscalConfig(
      FiscalConfigLocalEntity(
        tenantId: tenantBeta,
        revision: 2,
        fingerprint: fiscalFpBeta,
        payload: betaFiscalPayload,
        appliedAt: '2026-09-03T14:05:00.000Z',
      ),
    );

    // 2. Product masters for both tenants
    final productAlpha = ProductEntity(
      id: 'prod-alpha-founder-item',
      name: 'Quesillo Navideño',
      uom: 'UND',
      stock: 45.0,
      averageCost: 35.0,
      sellPrice: 95.0,
      isActive: true,
      tenantId: tenantAlpha,
    );

    final productBeta = ProductEntity(
      id: 'prod-beta-founder-item',
      name: 'Camisa Manguita',
      uom: 'UND',
      stock: 20.0,
      averageCost: 150.0,
      sellPrice: 350.0,
      isActive: true,
      tenantId: tenantBeta,
    );

    await db.productDao.insertProducts([productAlpha, productBeta]);

    // Compute canonical fingerprints for both products
    final fpAlphaProduct = ActivationRequiredConfigAdapter.computeProductFingerprint(
      productAlpha,
      tenantId: tenantAlpha,
    );
    final fpBetaProduct = ActivationRequiredConfigAdapter.computeProductFingerprint(
      productBeta,
      tenantId: tenantBeta,
    );

    // 3. Authorized users for both tenants
    final pinAlpha = '5678';
    final pinBeta = '9876';

    final hashedAlpha = localAuth.hashPin(pinAlpha);
    final hashedBeta = localAuth.hashPin(pinBeta);

    await db.userDao.insertUsers([
      UserEntity(
        id: 'user-alpha-founder',
        name: 'Administrador Alpha',
        role: 'OWNER',
        pinHash: hashedAlpha,
        isActive: true,
        email: 'founder@alpha.ni',
        tenantId: tenantAlpha,
      ),
      UserEntity(
        id: 'user-beta-founder',
        name: 'Administrador Beta',
        role: 'OWNER',
        pinHash: hashedBeta,
        isActive: true,
        email: 'founder@beta.ni',
        tenantId: tenantBeta,
      ),
    ]);

    await db.securityProfileDao.insertProfiles([
      SecurityProfileEntity(
        userId: 'user-alpha-founder',
        pinHash: hashedAlpha,
        isPinEnabled: true,
        isTotpEnabled: false,
      ),
      SecurityProfileEntity(
        userId: 'user-beta-founder',
        pinHash: hashedBeta,
        isPinEnabled: true,
        isTotpEnabled: false,
      ),
    ]);

    // -------------------------------------------------------------
    // PHASE 2: Close database simulating full application/device restart
    // -------------------------------------------------------------
    await db.close();

    // -------------------------------------------------------------
    // PHASE 3: Reopen database offline (zero WAN, purely local SQLite)
    // -------------------------------------------------------------
    final restartedDb = await $FloorAppDatabase
        .databaseBuilder(dbPath)
        .addMigrations(allMigrations)
        .build();

    final adapter = ActivationRequiredConfigAdapter(
      database: restartedDb,
      localAuthService: localAuth,
    );

    // -------------------------------------------------------------
    // PHASE 4: Tenant Alpha evaluations
    // -------------------------------------------------------------
    // 4.1 Legitimate Tenant Alpha evaluation -> PASS
    final alphaSummary = await adapter.evaluateAll(
      configParams: ActivationRequiredConfigParams(
        tenantId: tenantAlpha,
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: fiscalFpAlpha,
        verificationProductId: 'prod-alpha-founder-item',
        verificationProductRevision: 1,
        verificationProductFingerprint: fpAlphaProduct,
      ),
      userParams: const ActivationAuthorizedUserParams(
        tenantId: tenantAlpha,
        authorizedUserId: 'user-alpha-founder',
        testPin: '5678',
      ),
    );

    expect(alphaSummary.isReady, isTrue);
    expect(alphaSummary.blockers, isEmpty);
    expect(alphaSummary.requiredConfigResult.isPass, isTrue);
    expect(alphaSummary.authorizedUserResult.isPass, isTrue);

    // 4.2 Cross-tenant isolation: Tenant Alpha trying to use Tenant Beta's product -> BLOCKED
    final crossProductSummary = await adapter.evaluateAll(
      configParams: ActivationRequiredConfigParams(
        tenantId: tenantAlpha,
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: fiscalFpAlpha,
        verificationProductId: 'prod-beta-founder-item', // Foreign product
      ),
      userParams: const ActivationAuthorizedUserParams(
        tenantId: tenantAlpha,
        authorizedUserId: 'user-alpha-founder',
        testPin: '5678',
      ),
    );

    expect(crossProductSummary.isReady, isFalse);
    expect(crossProductSummary.requiredConfigResult.isFail, isTrue);
    expect(
      crossProductSummary.requiredConfigResult.reason,
      contains('belongs to tenant tenant-beta-retail, expected tenant-alpha-enterprise'),
    );

    // 4.3 Cross-tenant isolation: Tenant Alpha trying to use Tenant Beta's user -> BLOCKED
    final crossUserSummary = await adapter.evaluateAll(
      configParams: ActivationRequiredConfigParams(
        tenantId: tenantAlpha,
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: fiscalFpAlpha,
        verificationProductId: 'prod-alpha-founder-item',
      ),
      userParams: const ActivationAuthorizedUserParams(
        tenantId: tenantAlpha,
        authorizedUserId: 'user-beta-founder', // Foreign user
        testPin: '9876',
      ),
    );

    expect(crossUserSummary.isReady, isFalse);
    expect(crossUserSummary.authorizedUserResult.isFail, isTrue);
    expect(
      crossUserSummary.authorizedUserResult.reason,
      contains('belongs to tenant tenant-beta-retail, expected tenant-alpha-enterprise'),
    );

    // -------------------------------------------------------------
    // PHASE 5: Tenant Beta evaluations
    // -------------------------------------------------------------
    // 5.1 Legitimate Tenant Beta evaluation -> PASS
    final betaSummary = await adapter.evaluateAll(
      configParams: ActivationRequiredConfigParams(
        tenantId: tenantBeta,
        requiredFiscalRevision: 2,
        requiredFiscalFingerprint: fiscalFpBeta,
        verificationProductId: 'prod-beta-founder-item',
        verificationProductRevision: 1,
        verificationProductFingerprint: fpBetaProduct,
      ),
      userParams: const ActivationAuthorizedUserParams(
        tenantId: tenantBeta,
        authorizedUserId: 'user-beta-founder',
        testPin: '9876',
      ),
    );

    expect(betaSummary.isReady, isTrue);
    expect(betaSummary.blockers, isEmpty);
    expect(betaSummary.requiredConfigResult.isPass, isTrue);
    expect(betaSummary.authorizedUserResult.isPass, isTrue);

    await restartedDb.close();
  });
}
