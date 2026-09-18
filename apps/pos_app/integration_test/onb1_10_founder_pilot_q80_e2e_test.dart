import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';
import 'package:pos_app/data/adapters/printer/ipos_printer_adapter.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
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
import 'package:pos_app/domain/services/config/printer_config_service.dart';
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

// `all` is the default so an unqualified invocation performs the whole physical
// rehearsal. Naming one phase stays supported for focused debugging.
const _phase = String.fromEnvironment('PILOT_PHASE', defaultValue: 'all');

// `real` drives the hardware printer adapter and consumes paper. `simulated` reports a
// ready printer and acknowledges print commands without producing output, so a run can
// complete without paper. The cohort uses `simulated` because the physical 80 mm output
// was already accepted in the FREEZE-06 rehearsal; every receipt carries the mode so a
// simulated print can never be mistaken for a physical one.
const _printerMode = String.fromEnvironment(
  'PILOT_PRINTER_MODE',
  defaultValue: 'real',
);

PrinterPort _printerPort() {
  switch (_printerMode) {
    case 'real':
      return IPosPrinterAdapter();
    case 'simulated':
      return MockPrinterAdapter();
    default:
      fail('PILOT_PRINTER_MODE must be real or simulated; got $_printerMode');
  }
}
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

  testWidgets('ONB1.10F founder pilot Q80 attached-device $_phase run', (
    WidgetTester tester,
  ) async {
    _requireFixture();
    final phases = _selectedPhases();
    final dbPath = '${await getDatabasesPath()}/$_dbName';
    final database = await $FloorAppDatabase.databaseBuilder(dbPath).build();
    final startedAt = DateTime.now().toUtc();

    try {
      // One test body drives every phase on purpose. `flutter test` installs the
      // application, runs it, and then uninstalls it, so the application data
      // directory does not survive a run. `offline` and `reconnect` read back the
      // activation state that `setup` persisted in Floor, so running the phases as
      // separate invocations would find that state already destroyed.
      for (final phase in phases) {
        final marker = 'ONB1.10F-Q80-${startedAt.millisecondsSinceEpoch}-$phase';
        switch (phase) {
          case 'setup':
            await _setup(database, marker);
            break;
          case 'offline':
            await _offline(database, marker);
            break;
          case 'reconnect':
            await _reconnectAndVoid(database, marker);
            break;
        }
      }
    } finally {
      await database.close();
    }
  });
}

/// Phases to drive, in order. `all` performs the whole rehearsal; a single named
/// phase is still accepted so one step can be debugged in isolation.
List<String> _selectedPhases() {
  const phases = <String>['setup', 'offline', 'reconnect'];
  if (_phase == 'all') return phases;
  if (phases.contains(_phase)) return <String>[_phase];
  fail('PILOT_PHASE must be all, setup, offline, or reconnect; got $_phase');
}

Dio _dio() => Dio(BaseOptions(baseUrl: 'http://127.0.0.1:3000/api/'));

/// Counts every request that reaches Dio, so the offline phase can prove that the
/// sale path issued none rather than assuming the tunnel had been removed.
class _RequestRecorder extends Interceptor {
  int count = 0;
  final List<String> observed = <String>[];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    count++;
    observed.add('${options.method} ${options.uri}');
    handler.next(options);
  }
}

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

  // The founder-pilot seed already provisioned this tenant with the real issuer RUC.
  // Reuse that value instead of synthesising one: the fiscal-setup response below feeds
  // PrinterConfigService.fiscalRucKey, so the physical TEST_PRINT must carry the real
  // issuer identity, and a generated RUC would misattribute the printed evidence.
  final currentFiscal = await dio.get<Map<String, dynamic>>('onboarding/fiscal-setup');
  final issuerRuc = (currentFiscal.data!['ruc'] as String?)?.trim();
  expect(
    issuerRuc,
    isNotEmpty,
    reason: 'the pilot tenant must already carry the seeded issuer RUC',
  );

  final fiscal = await dio.post<Map<String, dynamic>>('onboarding/fiscal-setup', data: {
    // Founder regime decision (FREEZE-04): the pilot tenant is CUOTA_FIJA
    // (COMPROBANTE DE VENTA, no IVA collected), matching the declared
    // acceptance fixture in AP_FIXTURE_MANIFEST.md.
    'regime': 'CUOTA_FIJA',
    'businessName': 'Founder Pilot Q80 $marker',
    'ruc': issuerRuc,
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
  // Effective fiscal/printer configuration consumed by TEST_PRINT (FR-4).
  // The fiscal-setup response exposes `ruc` and `regime` (not `taxRegime`);
  // never write an empty value (it would clobber previously projected data).
  for (final entry in {
    PrinterConfigService.fiscalRucKey: (fiscalData['ruc'] as String?)?.trim(),
    'tax_regime': (fiscalData['regime'] as String?)?.trim(),
    PrinterConfigService.paperWidthMmKey: '80',
  }.entries) {
    final value = entry.value;
    if (value == null || value.isEmpty) continue;
    await db.localConfigDao.saveConfig(
      LocalConfigEntity(key: entry.key, value: value),
    );
  }

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

  final printer = _printerPort();
  final preflight = await ActivationPreOfflineRunner(
    database: db,
    configAdapter: ActivationRequiredConfigAdapter(database: db),
    terminalIdentityService: TerminalIdentityService(db.localConfigDao),
    printerPort: printer,
    printerConfigService: PrinterConfigService(db.localConfigDao),
  ).runPreOfflineChecks(PreOfflineRunnerParams(
    attemptId: attempt['id'] as String,
    tenantId: _tenantId,
    authorizedUserId: _ownerId,
    authorizedUserPin: _ownerPin,
  ));
  expect(preflight.isReadyForOffline, isTrue, reason: preflight.blockers.join('\n'));
  // ignore: avoid_print
  print('ONB1.10F_PHASE_RECEIPT ${jsonEncode({'phase': 'setup', 'marker': marker, 'attemptId': attempt['id'], 'dbName': _dbName, 'testPrint': 'accepted', 'printerMode': _printerMode})}');
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
  // Offline is enforced by construction instead of by cutting the tunnel: the
  // recorder fails the phase if the sale path issues even one request, which is a
  // stronger guarantee than assuming adb reverse was removed beforehand.
  final attempt = await db.activationAttemptLocalDao.getLatestAttempt(_tenantId);
  expect(attempt, isNotNull);
  final resolvedAttempt = attempt!;
  final recorder = _RequestRecorder();
  final sale = await ActivationControlledSaleRunner(
    database: db,
    salesRepository: await _salesRepository(db, _dio()..interceptors.add(recorder)),
    printerPort: _printerPort(),
    clockManager: ActivationClockManager(initialBootSessionId: 'onb1.10f-q80'),
  ).executeControlledOfflineSale(ControlledSaleParams(
    tenantId: _tenantId,
    attemptId: resolvedAttempt.attemptId,
    cashierUserId: _ownerId,
    customAmount: 1,
  ));
  expect(sale.isSuccess, isTrue, reason: sale.errors.join('\n'));
  expect(
    recorder.count,
    0,
    reason:
        'the offline sale must issue no HTTP request; observed ${recorder.observed}',
  );
  final invoice = await db.invoiceDao.getInvoiceById(sale.verificationTicketId!);
  expect(invoice, isNotNull);
  expect(invoice!.number, isNotEmpty);
  expect(invoice.syncStatus, 'pending');
  final claim = await db.firstSuccessfulSaleClaimDao.getClaimByTenantId(_tenantId);
  expect(claim?.ticketId, sale.verificationTicketId);
  // ignore: avoid_print
  print('ONB1.10F_PHASE_RECEIPT ${jsonEncode({'phase': 'offline', 'marker': marker, 'attemptId': resolvedAttempt.attemptId, 'ticketId': sale.verificationTicketId, 'physicalReceipt': _printerMode == 'real' ? 'print-command-accepted' : 'simulated-no-output', 'printerMode': _printerMode, 'httpRequests': recorder.count})}');
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
  print('ONB1.10F_PHASE_RECEIPT ${jsonEncode({'phase': 'reconnect', 'marker': marker, 'attemptId': resolvedAttempt.attemptId, 'ticketId': ticketId, 'backendStatus': diagnostics.data!['attempt']['status'], 'elapsedWallClockMs': elapsed.inMilliseconds, 'visualConfirmation': _printerMode == 'real' ? 'not-claimed' : 'not-applicable-simulated-printer', 'printerMode': _printerMode})}');
}
