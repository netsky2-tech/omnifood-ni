import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:sqflite/sqflite.dart' show deleteDatabase, getDatabasesPath;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'DT 09-2007 (#539 S1-S4) real Android hardware E2E on attached device',
    (WidgetTester tester) async {
      final dbDir = await getDatabasesPath();
      final dbPath = '$dbDir/dt09_2007_s23_hardware_e2e.sqlite';
      await deleteDatabase(dbPath);

      final database = await $FloorAppDatabase
          .databaseBuilder(dbPath)
          .addMigrations(allMigrations)
          .build();

      try {
        debugPrint('[DT09-S23] START real Android ARM64 hardware E2E');
        // 0. Real Android SQLite schema check (v86 columns present)
        final columns = await database.database.rawQuery(
          'PRAGMA table_info(invoices)',
        );
        final colNames = columns
            .map((c) => c['name'] as String?)
            .whereType<String>()
            .toSet();
        expect(colNames, contains('payment_condition'));
        expect(colNames, contains('contingency_manual_series'));
        expect(colNames, contains('contingency_manual_number'));
        expect(colNames, contains('contingency_manual_issued_at'));
        debugPrint('[DT09-S23] PASS 0/5: SQLite v86 schema verified on S23');

        // 1. S1 (Ordinal QUINTO): FiscalInboxHandler + 58mm/80mm right-aligned DGI auth
        const tenantId = '00000000-0000-4000-8000-000000000539';
        const authCode = 'DGI-S23-2026-000123456789';
        final inboxHandler = FiscalInboxHandler(database);
        final envelope = {
          'tenantId': tenantId,
          'businessName': 'Café S23 Hardware Test',
          'ruc': 'J0310000123456',
          'fiscalRegime': 'REGIMEN_GENERAL',
          'pricesIncludeTax': true,
          'taxRate': 15,
          'dgiAuthorizationCode': authCode,
          'dgiAuthorizationIssuedAt': '2026-01-01',
          'dgiAuthorizationExpiresAt': '2027-12-31',
          'configVersion': {
            'revision': 1,
            'fingerprint':
                '1111111111111111111111111111111111111111111111111111111111111111',
          },
        };

        await inboxHandler.handleFiscalEnvelope(envelope);
        expect(
          await inboxHandler.isProjectionComplete(envelope, tenantId),
          isTrue,
        );

        // Simulate local drift -> isProjectionComplete MUST detect it
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: FiscalProjectionKeys.dgiAuthorizationCode,
            value: 'DRIFTED-CODE',
          ),
        );
        expect(
          await inboxHandler.isProjectionComplete(envelope, tenantId),
          isFalse,
        );

        // Replay repairs drift
        await inboxHandler.handleFiscalEnvelope(envelope);
        expect(
          await inboxHandler.isProjectionComplete(envelope, tenantId),
          isTrue,
        );
        final repairedAuth = await database.localConfigDao.getConfigByKey(
          FiscalProjectionKeys.dgiAuthorizationCode,
        );
        expect(repairedAuth?.value, authCode);

        final f58 = ReceiptLayoutFormatter.format58mm();
        final f80 = ReceiptLayoutFormatter.format80mm();
        final authLines58 = f58.fiscalAuthorizationLines(authCode);
        expect(authLines58.length, greaterThanOrEqualTo(2));
        for (final line in authLines58) {
          expect(line.length, 32);
          expect(line.startsWith(' '), isTrue);
        }
        debugPrint('[DT09-S23] PASS 1/5: S1 QUINTO auth drift repair + 58mm right-align verified');

        // 2. S2 (Ordinal TERCERO 3.4): cross-day void blocked on real Android
        final yesterday = DateTime(2026, 11, 26, 23, 55);
        final today = DateTime(2026, 11, 27, 0, 5);
        final crossDayDecision = evaluateVoidRequest(
          actorCanVoidAny: true,
          actorCanVoidOwnCurrentShift: true,
          actorUserId: 'owner-1',
          invoiceUserId: 'owner-1',
          invoiceShiftId: 'shift-1',
          invoiceLocalIssueDate: '2026-11-26',
          invoiceCreatedAt: yesterday,
          currentShiftId: 'shift-1',
          comparedTo: today,
        );
        expect(crossDayDecision, VoidDecision.deniedCrossDay);
        expect(crossDayDecision.uiMessage, contains('Portal Web'));
        debugPrint('[DT09-S23] PASS 2/5: S2 3.4 cross-day void blocked on S23');

        // 3. S3 & S4: Real SalesRepositoryImpl on Android SQLite
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_range_start', value: '1'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_range_end', value: '1000'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_current_number', value: '1'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_id', value: 'S23-HW-01'),
        );

        final dio = Dio(
          BaseOptions(
            baseUrl: 'http://127.0.0.1:3000',
            connectTimeout: const Duration(seconds: 5),
            receiveTimeout: const Duration(seconds: 5),
            validateStatus: (status) => status != null && status < 500,
          ),
        );
        final capabilityCache = TenantCapabilityCache(
          configDao: database.localConfigDao,
          clock: StopwatchMonotonicClock(),
          bootSessionId: 'dt09-s23-hw',
          nowUtc: () => DateTime.now().toUtc(),
        );
        final authRepo = AuthRepositoryImpl(
          database.userDao,
          database.securityProfileDao,
          LocalAuthService(),
          dio,
          capabilityCache: capabilityCache,
        );
        final inventoryRepo = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          countSessionDao: database.countSessionDao,
          countLineDao: database.countLineDao,
          forensicAlertDao: database.forensicAlertDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          dio: dio,
          database: database,
        );
        final movementEngine = MovementEngineImpl(
          inventoryRepo,
          AlertServiceImpl(inventoryRepo),
        );
        final salesRepo = SalesRepositoryImpl(
          database: database,
          invoiceDao: database.invoiceDao,
          itemDao: database.invoiceItemDao,
          paymentDao: database.paymentDao,
          transactionDao: database.salesTransactionDao,
          numberingService: DgiNumberingServiceImpl(
            database.localConfigDao,
            database.invoiceDao,
          ),
          movementEngine: movementEngine,
          auditRepository: AuditRepositoryImpl(
            database.auditDao,
            authRepo,
            dio,
            'S23-HW-01',
            capabilityCache: capabilityCache,
            forensicAlertDao: database.forensicAlertDao,
          ),
          processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
          reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
          inventoryRepository: inventoryRepo,
        );

        // 3a. Anti-collision: manual series matching dgi_prefix MUST be rejected
        final collidingInvoice = Invoice(
          id: '00000000-0000-4000-8000-00000000c011',
          number: '',
          createdAt: DateTime(2026, 11, 27, 10, 0),
          userId: '00000000-0000-4000-8000-000000000001',
          subtotal: 100.0,
          totalTax: 0.0,
          total: 100.0,
          paymentStatus: PaymentStatus.paid,
          paymentCondition: 'CONTADO',
          contingencyManualSeries: '001-001-01',
          contingencyManualNumber: '000142',
          contingencyManualIssuedAt: '2026-11-26',
        );
        await expectLater(
          () => salesRepo.saveSale(
            invoice: collidingInvoice,
            items: const <InvoiceItem>[],
            payments: const <Payment>[],
          ),
          throwsArgumentError,
        );
        expect(
          await database.invoiceDao.getInvoiceById(collidingInvoice.id),
          isNull,
        );
        debugPrint('[DT09-S23] PASS 3/5: S3 3.3.a anti-collision rejected matching dgi_prefix');

        // 3b. Valid contingency back-entry persists and produces ORIGINAL + COPIA
        final validContingency = Invoice(
          id: '00000000-0000-4000-8000-00000000c012',
          number: '',
          createdAt: DateTime(2026, 11, 27, 10, 5),
          userId: '00000000-0000-4000-8000-000000000001',
          subtotal: 150.0,
          totalTax: 0.0,
          total: 150.0,
          paymentStatus: PaymentStatus.paid,
          paymentCondition: 'CONTADO',
          contingencyManualSeries: 'MAN-S23',
          contingencyManualNumber: '000142',
          contingencyManualIssuedAt: '2026-11-26',
        );
        final payment = Payment(
          id: '00000000-0000-4000-8000-00000000p012',
          invoiceId: validContingency.id,
          method: PaymentMethod.cash,
          amount: 150.0,
          currency: 'NIO',
        );
        await salesRepo.saveSale(
          invoice: validContingency,
          items: const <InvoiceItem>[],
          payments: [payment],
        );

        final savedEntity = await database.invoiceDao.getInvoiceById(
          validContingency.id,
        );
        expect(savedEntity, isNotNull);
        expect(savedEntity!.paymentCondition, 'CONTADO');
        expect(savedEntity.contingencyManualSeries, 'MAN-S23');
        expect(savedEntity.contingencyManualNumber, '000142');
        expect(savedEntity.contingencyManualIssuedAt, '2026-11-26');

        final savedDomain = SalesMapper.toInvoiceDomain(savedEntity);
        final syncJson = SalesMapper.toSyncJson(
          savedDomain,
          const <InvoiceItem>[],
          [payment],
        );
        expect(syncJson['contingencyManualSeries'], 'MAN-S23');
        expect(syncJson['contingencyManualNumber'], '000142');
        expect(syncJson['contingencyManualIssuedAt'], '2026-11-26');
        // Hash-safety: default CONTADO is omitted on wire
        expect(syncJson.containsKey('paymentCondition'), isFalse);

        // Receipt rendering on 58mm & 80mm for BOTH ORIGINAL and COPIA
        final originalDoc = ReceiptDocument.fromInvoice(
          savedDomain,
          items: const [],
          payments: [payment],
          businessName: 'Café S23 Hardware Test',
          ruc: 'J0310000123456',
          taxRegime: TaxRegime.cuotaFija,
          fiscalAuthorizationNumber: authCode,
          copyLabel: 'ORIGINAL',
        );
        final copyDoc = ReceiptDocument.fromInvoice(
          savedDomain,
          items: const [],
          payments: [payment],
          businessName: 'Café S23 Hardware Test',
          ruc: 'J0310000123456',
          taxRegime: TaxRegime.cuotaFija,
          fiscalAuthorizationNumber: authCode,
          copyLabel: 'COPIA - ADJUNTAR COPIA MANUAL',
        );

        for (final formatter in [f58, f80]) {
          for (final doc in [originalDoc, copyDoc]) {
            final text = formatter.formatReceiptDocumentText(doc);
            final escpos = String.fromCharCodes(
              formatter.formatReceiptDocumentEscPos(doc),
            );
            expect(text, contains('Condicion:'));
            expect(text, contains('Contado'));
            expect(text, contains('INGRESO POR CONTINGENCIA'));
            expect(text, contains('MAN-S23-000142'));
            expect(text, contains('2026-11-26'));
            expect(text, contains(authCode));
            expect(escpos, contains('Condicion:'));
            expect(escpos, contains('MAN-S23-000142'));
            expect(escpos, contains(authCode));
            for (final line in text.split('\n')) {
              expect(
                line.length,
                lessThanOrEqualTo(formatter.maxCols),
                reason: 'Line exceeded ${formatter.maxCols} cols: "$line"',
              );
            }
          }
        }
        debugPrint('[DT09-S23] PASS 4/5: S3+S4 persistence, hash-safety, Condicion: Contado & ORIGINAL/COPIA 58mm+80mm verified');

        // 4. Real S23 -> NestJS backend connectivity over adb reverse tcp:3000
        final response = await dio.get<dynamic>('/api/health');
        expect(
          response.statusCode,
          anyOf(200, 404),
          reason:
              'S23 must reach local admin_backend over adb reverse tcp:3000',
        );
        debugPrint('[DT09-S23] PASS 5/5: S23 -> NestJS backend HTTP ${response.statusCode} over USB adb reverse');
        debugPrint('[DT09-S23] ALL_TESTS_PASSED');
      } catch (e, st) {
        debugPrint('[DT09-S23] FAILED: $e\n$st');
        rethrow;
      } finally {
        await database.close();
        await deleteDatabase(dbPath);
      }
    },
  );
}
