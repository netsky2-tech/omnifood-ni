import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';
import 'package:pos_app/data/adapters/printer/ipos_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/activation_verification_sale_cleanup_runner.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:sqflite/sqflite.dart' show getDatabasesPath;

const _phase = String.fromEnvironment('PILOT_PHASE', defaultValue: 'setup');
const _ownerEmail = String.fromEnvironment('PILOT_OWNER_EMAIL');
const _ownerPassword = String.fromEnvironment('PILOT_OWNER_PASSWORD');
const _ownerPin = String.fromEnvironment('PILOT_OWNER_PIN');
const _tenantId = String.fromEnvironment('PILOT_TENANT_ID');
const _ownerId = String.fromEnvironment('PILOT_OWNER_ID');
const _fixtureStartedAt = String.fromEnvironment('PILOT_FIXTURE_STARTED_AT');
const _terminalId = 'Q802024120001';
const _dbName = String.fromEnvironment(
  'PILOT_DB_NAME',
  defaultValue: 'onb1_10_founder_pilot_q80.sqlite',
);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('ONB1.10F founder pilot Q80 attached-device phase $_phase', (
    WidgetTester tester,
  ) async {
    _requireFixture();
    final dbPath = '${await getDatabasesPath()}/$_dbName';
    final database = await $FloorAppDatabase.databaseBuilder(dbPath).build();
    final startedAt = DateTime.now().toUtc();
    final marker = 'ONB1.10F-Q80-${startedAt.millisecondsSinceEpoch}-$_phase';

    try {
      switch (_phase) {
        case 'setup':
          await _setup(database, marker);
          break;
        case 'offline':
          await _offline(database, marker);
          break;
        case 'reconnect':
          await _reconnectAndVoid(database, marker);
          break;
        default:
          fail('PILOT_PHASE must be setup, offline, or reconnect; got $_phase');
      }
    } finally {
      await database.close();
    }
  });
}

Dio _dio() => Dio(BaseOptions(baseUrl: 'http://127.0.0.1:3000/api/'));

void _requireFixture() {
  for (final entry in <String, String>{
    'PILOT_OWNER_EMAIL': _ownerEmail,
    'PILOT_OWNER_PASSWORD': _ownerPassword,
    'PILOT_OWNER_PIN': _ownerPin,
    'PILOT_TENANT_ID': _tenantId,
    'PILOT_OWNER_ID': _ownerId,
    'PILOT_FIXTURE_STARTED_AT': _fixtureStartedAt,
  }.entries) {
    expect(entry.value, isNotEmpty, reason: '${entry.key} must come from seed JSON');
  }
}

Future<Map<String, dynamic>> _login(Dio dio) async {
  final response = await dio.post<Map<String, dynamic>>('identity/login', data: {
    'email': _ownerEmail,
    'pass': _ownerPassword,
  });
  final data = response.data!;
  dio.options.headers['Authorization'] = 'Bearer ${data['access_token']}';
  expect((data['user'] as Map<String, dynamic>)['id'], _ownerId);
  expect((data['user'] as Map<String, dynamic>)['tenant_id'], _tenantId);
  return data;
}

Future<void> _setup(AppDatabase db, String marker) async {
  final dio = _dio();
  await _login(dio);
  final headers = Options(headers: {'x-device-terminal-id': _terminalId});

  await dio.post<dynamic>('onboarding/session/start', data: {'source': 'SETUP_CENTER'});
  final templates = await dio.get<List<dynamic>>('onboarding/templates');
  final template = templates.data!.cast<Map<String, dynamic>>().first;
  final templateCode = template['code'] as String;
  await dio.post<dynamic>('onboarding/templates/$templateCode/preview', data: {});
  await dio.post<dynamic>('onboarding/templates/$templateCode/apply', data: {
    'idempotencyKey': '$marker-template',
  });

  final officialTemplate = await dio.get<Map<String, dynamic>>('onboarding/import/template');
  final csv = '${officialTemplate.data!['templateCsv']}\n$marker CSV,47.00,UN,$marker-CSV,Piloto,15';
  final upload = await dio.post<Map<String, dynamic>>('onboarding/import/upload-csv', data: {
    'csvContent': csv,
    'fileName': '$marker.csv',
  });
  final token = upload.data!['sessionToken'] as String;
  final preview = await dio.get<Map<String, dynamic>>('onboarding/import/preview/$token');
  expect(preview.data!['validRows'], greaterThan(0));
  await dio.post<dynamic>('onboarding/import/commit', data: {
    'sessionToken': token,
    'mode': 'ALL_OR_NOTHING',
    'duplicateResolution': 'SKIP',
    'idempotencyKey': '$marker-csv',
  });

  final fiscal = await dio.post<Map<String, dynamic>>('onboarding/fiscal-setup', data: {
    'regime': 'REGIMEN_GENERAL',
    'businessName': 'Founder Pilot Q80 $marker',
    'ruc': 'J${startedRuc(marker)}',
    'commercialFxSpread': 0,
    'pricesIncludeTax': true,
  });
  final manual = await dio.post<Map<String, dynamic>>('onboarding/catalog/manual-product', data: {
    'name': 'VERIFICACION FISICA $marker',
    'sellPrice': 1.0,
    'uom': 'UN',
  });
  final manualProduct = Map<String, dynamic>.from(manual.data!['product'] as Map);
  final readiness = await dio.get<Map<String, dynamic>>('onboarding/readiness');
  expect(readiness.data!['saleReady'], isTrue, reason: '${readiness.data}');

  final attemptResponse = await dio.post<Map<String, dynamic>>(
    'onboarding/activation/attempts',
    data: {
      'candidateTerminalId': _terminalId,
      'verificationProductId': manualProduct['id'],
      'idempotencyKey': '$marker-activation',
      'posBuild': 'ONB1.10F-attached-device',
    },
    options: headers,
  );
  final attempt = attemptResponse.data!;
  final fiscalData = fiscal.data!;
  final configVersion = Map<String, dynamic>.from(fiscalData['configVersion'] as Map);

  await db.localConfigDao.saveConfig(
    LocalConfigEntity(key: 'terminal_device_id', value: _terminalId),
  );
  await db.fiscalConfigLocalDao.applyFiscalConfig(FiscalConfigLocalEntity(
    tenantId: _tenantId,
    revision: configVersion['revision'] as int,
    fingerprint: configVersion['fingerprint'] as String,
    payload: jsonEncode(fiscalData),
    appliedAt: DateTime.now().toUtc().toIso8601String(),
  ));
  await db.productDao.insertProducts([
    ProductEntity(
      id: manualProduct['id'] as String,
      name: manualProduct['name'] as String,
      uom: manualProduct['uom'] as String,
      stock: 0,
      averageCost: 0,
      sellPrice: (manualProduct['sellPrice'] as num).toDouble(),
      isActive: manualProduct['is_active'] as bool,
      tenantId: _tenantId,
    ),
  ]);

  final staff = await dio.get<dynamic>('identity/staff', options: Options(headers: const {
    'x-offline-sync-scope': 'pos-auth-continuity',
  }));
  final staffList = staff.data is Map<String, dynamic>
      ? (staff.data as Map<String, dynamic>)['staff'] as List<dynamic>
      : staff.data as List<dynamic>;
  final owner = Map<String, dynamic>.from(staffList.cast<Map>().firstWhere(
        (item) => item['id'] == _ownerId,
      ));
  final profile = Map<String, dynamic>.from(owner['security_profile'] as Map);
  await db.userDao.insertUsers([
    // The staff response is authoritative for the offline owner identity.
    // UserEntity accepts the exact backend role spelling.
    // ignore: avoid_dynamic_calls
    _ownerEntity(owner),
  ]);
  await db.securityProfileDao.insertProfiles([
    // ignore: avoid_dynamic_calls
    _profileEntity(profile),
  ]);
  await db.activationAttemptLocalDao.saveAttempt(ActivationAttemptLocalEntity(
    attemptId: attempt['id'] as String,
    tenantId: _tenantId,
    candidateTerminalId: _terminalId,
    localStatus: 'ASSIGNED',
    requiredFiscalRevision: attempt['requiredFiscalRevision'] as int,
    requiredFiscalFingerprint: attempt['requiredFiscalFingerprint'] as String,
    verificationProductId: attempt['verificationProductId'] as String,
    serverTimeAnchorAt: attempt['serverTimeAnchorAt'] as String,
    anchorMonotonicTicks: 0,
    bootSessionId: 'onb1.10f-q80',
    assignedAt: attempt['startedAt'] as String,
    updatedAt: DateTime.now().toUtc().toIso8601String(),
  ));

  final printer = IPosPrinterAdapter();
  final preflight = await ActivationPreOfflineRunner(
    database: db,
    configAdapter: ActivationRequiredConfigAdapter(database: db),
    terminalIdentityService: TerminalIdentityService(db.localConfigDao),
    printerPort: printer,
  ).runPreOfflineChecks(PreOfflineRunnerParams(
    attemptId: attempt['id'] as String,
    tenantId: _tenantId,
    authorizedUserId: _ownerId,
    authorizedUserPin: _ownerPin,
  ));
  expect(preflight.isReadyForOffline, isTrue, reason: preflight.blockers.join('\n'));
  // ignore: avoid_print
  print('ONB1.10F_PHASE_RECEIPT ${jsonEncode({'phase': 'setup', 'marker': marker, 'attemptId': attempt['id'], 'dbName': _dbName, 'testPrint': 'accepted'})}');
}

UserEntity _ownerEntity(Map<String, dynamic> owner) => UserEntity(
  id: owner['id'] as String,
  name: owner['name'] as String,
  role: owner['role'] as String,
  pinHash: '',
  isActive: owner['is_active'] as bool,
  email: owner['email'] as String?,
  tenantId: owner['tenant_id'] as String?,
);

SecurityProfileEntity _profileEntity(Map<String, dynamic> profile) =>
    SecurityProfileEntity(
      userId: profile['user_id'] as String,
      pinHash: profile['pin_hash'] as String?,
      isPinEnabled: profile['is_pin_enabled'] as bool? ?? false,
      isTotpEnabled: profile['is_totp_enabled'] as bool? ?? false,
    );

String startedRuc(String marker) => marker.codeUnits
    .fold<int>(0, (a, b) => (a + b) % 9999999999)
    .toString()
    .padLeft(10, '0');

Future<SalesRepositoryImpl> _salesRepository(AppDatabase db, Dio dio) async {
  final localAuth = LocalAuthService();
  final capabilityCache = TenantCapabilityCache(
    configDao: db.localConfigDao,
    clock: StopwatchMonotonicClock(),
    bootSessionId: 'onb1.10f-q80',
    nowUtc: () => DateTime.now().toUtc(),
  );
  final auth = AuthRepositoryImpl(
    db.userDao,
    db.securityProfileDao,
    localAuth,
    dio,
    capabilityCache: capabilityCache,
  );
  final inventory = InventoryRepositoryImpl(
    insumoDao: db.insumoDao,
    recipeDao: db.recipeDao,
    movementDao: db.movementDao,
    movementSyncStateDao: db.movementSyncStateDao,
    supplierDao: db.supplierDao,
    warehouseDao: db.warehouseDao,
    countSessionDao: db.countSessionDao,
    countLineDao: db.countLineDao,
    forensicAlertDao: db.forensicAlertDao,
    uomConversionDao: db.uomConversionDao,
    batchDao: db.batchDao,
    purchaseDao: db.purchaseDao,
    recipeVersionDocumentDao: db.recipeVersionDocumentDao,
    productionOrderDocumentDao: db.productionOrderDocumentDao,
    dio: dio,
    database: db,
  );
  final movement = MovementEngineImpl(inventory, AlertServiceImpl(inventory));
  return SalesRepositoryImpl(
    database: db,
    invoiceDao: db.invoiceDao,
    itemDao: db.invoiceItemDao,
    paymentDao: db.paymentDao,
    transactionDao: db.salesTransactionDao,
    numberingService: DgiNumberingServiceImpl(db.localConfigDao, db.invoiceDao),
    movementEngine: movement,
    auditRepository: AuditRepositoryImpl(
      db.auditDao,
      auth,
      dio,
      _terminalId,
      capabilityCache: capabilityCache,
      forensicAlertDao: db.forensicAlertDao,
    ),
    processInventoryUseCase: ProcessSaleInventoryUseCase(movement),
    reverseInventoryUseCase: ReverseSaleInventoryUseCase(movement),
    inventoryRepository: inventory,
  );
}

Future<void> _offline(AppDatabase db, String marker) async {
  // The parent removes adb reverse before this invocation. No HTTP is attempted here.
  final attempt = await db.activationAttemptLocalDao.getLatestAttempt(_tenantId);
  expect(attempt, isNotNull);
  final resolvedAttempt = attempt!;
  final sale = await ActivationControlledSaleRunner(
    database: db,
    salesRepository: await _salesRepository(db, _dio()),
    printerPort: IPosPrinterAdapter(),
    clockManager: ActivationClockManager(initialBootSessionId: 'onb1.10f-q80'),
  ).executeControlledOfflineSale(ControlledSaleParams(
    tenantId: _tenantId,
    attemptId: resolvedAttempt.attemptId,
    cashierUserId: _ownerId,
    customAmount: 1,
  ));
  expect(sale.isSuccess, isTrue, reason: sale.errors.join('\n'));
  final invoice = await db.invoiceDao.getInvoiceById(sale.verificationTicketId!);
  expect(invoice, isNotNull);
  expect(invoice!.number, isNotEmpty);
  expect(invoice.syncStatus, 'pending');
  final claim = await db.firstSuccessfulSaleClaimDao.getClaimByTenantId(_tenantId);
  expect(claim?.ticketId, sale.verificationTicketId);
  // ignore: avoid_print
  print('ONB1.10F_PHASE_RECEIPT ${jsonEncode({'phase': 'offline', 'marker': marker, 'attemptId': resolvedAttempt.attemptId, 'ticketId': sale.verificationTicketId, 'physicalReceipt': 'print-command-accepted'})}');
}

Future<void> _reconnectAndVoid(AppDatabase db, String marker) async {
  final dio = _dio();
  await _login(dio);
  final attempt = await db.activationAttemptLocalDao.getLatestAttempt(_tenantId);
  expect(attempt, isNotNull);
  final resolvedAttempt = attempt!;
  final sync = DioActivationSyncPort(dio);

  // Pre-offline evidence is durable in Floor but intentionally not an outbox event.
  for (final check in await db.activationCheckResultLocalDao.getChecksForAttempt(_tenantId, resolvedAttempt.attemptId)) {
    final delivered = await sync.sendCheck(
      attemptId: resolvedAttempt.attemptId,
      checkCode: check.checkCode,
      status: check.status,
      evidenceType: check.evidenceType,
      evidenceRef: check.evidenceRef,
      occurredAt: check.occurredAt,
      details: check.detailsSanitizedJson == null
          ? null
          : Map<String, dynamic>.from(jsonDecode(check.detailsSanitizedJson!) as Map),
      tenantId: _tenantId,
      terminalId: _terminalId,
    );
    expect(delivered, isTrue, reason: 'backend rejected ${check.checkCode}');
  }

  final result = await ActivationReconnectSyncRunner(
    database: db,
    syncPort: sync,
  ).syncActivationEvidence(ActivationReconnectSyncParams(
    tenantId: _tenantId,
    attemptId: resolvedAttempt.attemptId,
  ));
  expect(result.isSuccess, isTrue, reason: result.errors.join('\n'));
  expect(result.attemptStatus, 'ACTIVATED');
  expect(await db.activationOutboxDao.getPendingEnvelopes(_tenantId), isEmpty);

  final diagnostics = await dio.get<Map<String, dynamic>>(
    'onboarding/activation/attempts/${resolvedAttempt.attemptId}/diagnostics',
  );
  expect(diagnostics.data!['attempt']['status'], 'PASS');
  expect(diagnostics.data!['session']['lifecycleState'], 'ACTIVATED');

  final ticketId = (await db.activationAttemptLocalDao.getAttemptById(resolvedAttempt.attemptId))!.verificationTicketId!;
  final voided = await ActivationVerificationSaleCleanupRunner(
    database: db,
    salesRepository: await _salesRepository(db, dio),
  ).voidVerificationSale(VoidVerificationSaleParams(
    tenantId: _tenantId,
    attemptId: resolvedAttempt.attemptId,
    reason: 'ONB1.10F founder pilot physical verification cleanup',
  ));
  expect(voided.isSuccess, isTrue, reason: voided.errors.join('\n'));
  final invoice = await db.invoiceDao.getInvoiceById(ticketId);
  expect(invoice?.isCanceled, isTrue);
  expect((await db.firstSuccessfulSaleClaimDao.getClaimByTenantId(_tenantId))?.ticketId, ticketId);

  final fixtureStartedAt = DateTime.tryParse(_fixtureStartedAt)?.toUtc();
  expect(fixtureStartedAt, isNotNull, reason: 'PILOT_FIXTURE_STARTED_AT must be ISO-8601');
  final elapsed = DateTime.now().toUtc().difference(fixtureStartedAt!);
  // ignore: avoid_print
  print('ONB1.10F_PHASE_RECEIPT ${jsonEncode({'phase': 'reconnect', 'marker': marker, 'attemptId': resolvedAttempt.attemptId, 'ticketId': ticketId, 'backendStatus': diagnostics.data!['attempt']['status'], 'elapsedWallClockMs': elapsed.inMilliseconds, 'visualConfirmation': 'not-claimed'})}');
}
