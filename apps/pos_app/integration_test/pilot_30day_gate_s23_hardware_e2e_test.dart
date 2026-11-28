import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
import 'package:pos_app/domain/usecases/inventory/frozen_sale_inventory_movement_boundary.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';

/// Real Android Hardware E2E Gate Suite for #531 (Gate G0-G6 30-Day Operability)
/// & #534 (Pilot Field Diagnostics Q-A1..Q-A6) on Samsung Galaxy S23 (SM-S918B, ARM64).
///
/// Uses 100% REAL on-device Floor SQLite (AppDatabase), REAL DAOs, REAL
/// CheckoutInventoryPreparationService, REAL FrozenSaleInventoryMovementBoundary,
/// REAL MovementEngineImpl, and REAL SalesTransactionDao — ZERO MOCKS.
///
/// Build & run on attached Android device:
///   flutter build apk --debug -t integration_test/pilot_30day_gate_s23_hardware_e2e_test.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb logcat -c && adb shell am start -n com.nhilos.pos_app/.MainActivity
///   adb logcat -d -s flutter
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _HardwareE2EPilotGateApp());
}

class _HardwareE2EPilotGateApp extends StatefulWidget {
  const _HardwareE2EPilotGateApp();

  @override
  State<_HardwareE2EPilotGateApp> createState() =>
      _HardwareE2EPilotGateAppState();
}

class _HardwareE2EPilotGateAppState extends State<_HardwareE2EPilotGateApp> {
  final List<String> _logs = [];
  String _status = 'RUNNING';

  @override
  void initState() {
    super.initState();
    _runAll();
  }

  void _log(String msg) {
    debugPrint('[S23_E2E_PILOT_GATE] $msg');
    if (mounted) {
      setState(() => _logs.add(msg));
    }
  }

  void _assertTrue(bool condition, String label) {
    if (!condition) {
      throw StateError('Assertion failed [$label]');
    }
  }

  void _assertClose(double actual, double expected, String label) {
    if ((actual - expected).abs() > 0.0001) {
      throw StateError(
        'Assertion failed [$label]: expected $expected, got $actual',
      );
    }
  }

  int _percentile(List<int> sortedAsc, double p) {
    if (sortedAsc.isEmpty) return 0;
    final idx = ((sortedAsc.length - 1) * p).round();
    return sortedAsc[idx];
  }

  Future<void> _executeRealCheckout({
    required AppDatabase db,
    required CheckoutInventoryPreparationService preparationService,
    required FrozenSaleInventoryMovementBoundary boundary,
    required String tenantId,
    required String userId,
    required String terminalId,
    required String shiftId,
    required int seqNum,
    required String prevAuditHash,
    required String nextAuditHash,
  }) async {
    final saleTime = DateTime.now().toUtc();
    final invId = 'inv-pilot-$seqNum';
    final localIssueDate =
        '${saleTime.year.toString().padLeft(4, '0')}-${saleTime.month.toString().padLeft(2, '0')}-${saleTime.day.toString().padLeft(2, '0')}';

    // Subtotal: 1x Latte (95) + 2x Soda (70) = 165.00 NIO
    final invoice = Invoice(
      id: invId,
      number: '001-001-01-${seqNum.toString().padLeft(8, '0')}',
      createdAt: saleTime,
      userId: userId,
      subtotal: 165.0,
      totalTax: 24.75,
      total: 189.75,
      terminalId: terminalId,
      sourceSequence: seqNum,
      idempotencyKey: 'sale:$terminalId:$invId',
    );

    final items = <InvoiceItem>[
      InvoiceItem(
        id: 'line-latte-$seqNum',
        invoiceId: invId,
        productId: 'prod-latte',
        productName: 'Latte Especial',
        quantity: 1,
        unitPrice: 95.0,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 14.25,
        total: 109.25,
      ),
      InvoiceItem(
        id: 'line-soda-$seqNum',
        invoiceId: invId,
        productId: 'prod-soda',
        productName: 'Refresco Reventa',
        quantity: 2,
        unitPrice: 35.0,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 10.50,
        total: 80.50,
      ),
    ];

    final prepared = await preparationService.prepare(
      invoice: invoice,
      items: items,
      offlineUserId: userId,
      tenantId: tenantId,
      terminalId: terminalId,
    );

    final derived = boundary.derive([
      for (final item in prepared.items)
        FrozenSaleInventoryMovementLine(
          invoiceItemId: item.id,
          quantity: item.quantity,
          snapshot: item.inventorySnapshot!,
        ),
    ]);
    _assertTrue(
      derived.outcome == LocalSaleMovementOutcome.applied,
      'Checkout #$seqNum inventory outcome == applied',
    );

    final movementEntities = derived.movements
        .map(
          (m) => MovementEntity(
            id: m.saleCorrelationId,
            insumoId: m.insumoId,
            type: 'sale',
            quantity: -m.quantity,
            previousStock: 0,
            newStock: 0,
            timestamp: saleTime.toIso8601String(),
            userId: userId,
            sourceDocumentType: 'SALE',
            sourceDocumentId: prepared.invoice.id,
            originInvoiceItemId: m.invoiceItemId,
            deliveryOwner: MovementDeliveryOwner.saleSync,
            deliveryState: MovementDeliveryState.localApplied,
            saleId: prepared.invoice.id,
            saleCorrelationId: m.saleCorrelationId,
          ),
        )
        .toList(growable: false);

    final invoiceEntity = SalesMapper.toInvoiceEntity(
      prepared.invoice.copyWith(
        inventoryOutcome: 'APPLIED',
        inventoryOutcomeReason: 'ALL_LINES_DEDUCTED',
      ),
    );
    invoiceEntity.shiftId = shiftId;
    invoiceEntity.localIssueDate = localIssueDate;

    final payment = Payment(
      id: 'pay-pilot-$seqNum',
      invoiceId: prepared.invoice.id,
      method: PaymentMethod.cash,
      amount: 189.75,
      currency: 'NIO',
      exchangeRate: 1.0,
      amountNio: 189.75,
      createdAt: saleTime,
    );

    final auditLog = AuditLogEntity(
      userId: userId,
      action: 'SALE_CREATED',
      timestamp: saleTime.toIso8601String(),
      deviceId: terminalId,
      metadata: '{"invoice_id":"$invId","total":189.75}',
      isSynced: false,
      sequenceNo: seqNum,
      prevHash: prevAuditHash,
      entryHash: nextAuditHash,
      remoteRefUuid: 'audit-ref-$seqNum',
      tenantId: tenantId,
    );

    await db.salesTransactionDao.executeSaleWithDgiTransaction(
      invoiceEntity,
      prepared.items.map(SalesMapper.toItemEntity).toList(growable: false),
      const [],
      [SalesMapper.toPaymentEntity(payment)],
      movementEntities,
      auditLog,
      (seqNum + 1).toString(),
      false,
    );
  }

  Future<void> _runAll() async {
    int passed = 0;
    const int total = 4;

    final docsDir = await getApplicationDocumentsDirectory();
    final workDir = Directory(
      '${docsDir.path}/s23_e2e_pilot_gate_${DateTime.now().millisecondsSinceEpoch}',
    );
    await workDir.create(recursive: true);
    final dbPath = '${workDir.path}/pilot_30day_gate_s23.db';

    AppDatabase? database;
    try {
      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      const tenantId = 'tenant-s23-pilot';
      const userId = 'user-s23-cashier';
      const terminalId = 'S23-TERM-01';
      const shiftId = 'shift-s23-pilot-1';

      final authorityDao = database.authorityProjectionDao;
      final insumoDao = database.insumoDao;
      final productDao = database.productDao;
      final localConfigDao = database.localConfigDao;
      final taxConfigDao = database.taxConfigDao;
      final cashierSessionDao = database.cashierSessionDao;

      final inventoryRepo = InventoryRepositoryImpl(
        insumoDao: insumoDao,
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
        productionTransactionDao: database.productionTransactionDao,
        dio: Dio(),
        database: database,
      );
      final alertService = AlertServiceImpl(inventoryRepo);
      final movementEngine = MovementEngineImpl(inventoryRepo, alertService);
      final preparationService = CheckoutInventoryPreparationService(database);
      final boundary = FrozenSaleInventoryMovementBoundary();

      // -----------------------------------------------------------------------
      // Seed Realistic Catalog, Tax Config, Open Shift, and DGI Sequence
      // -----------------------------------------------------------------------
      for (final authInsumo in const [
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-coffee',
          name: 'Café Molido Espresso',
          uom: 'KG',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-milk',
          name: 'Leche Entera',
          uom: 'L',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-soda',
          name: 'Refresco Lata 355ml',
          uom: 'UND',
        ),
      ]) {
        await authorityDao.insertInsumo(authInsumo);
      }

      await insumoDao.insertInsumos([
        InsumoEntity(
          id: 'ins-coffee',
          name: 'Café Molido Espresso',
          consumptionUom: 'KG',
          stock: 50.0,
          averageCost: 220.0,
        ),
        InsumoEntity(
          id: 'ins-milk',
          name: 'Leche Entera',
          consumptionUom: 'L',
          stock: 40.0,
          averageCost: 42.0,
        ),
        InsumoEntity(
          id: 'ins-soda',
          name: 'Refresco Lata 355ml',
          consumptionUom: 'UND',
          stock: 200.0,
          averageCost: 18.0,
        ),
      ]);

      await productDao.insertProducts([
        ProductEntity(
          id: 'prod-latte',
          name: 'Latte Especial',
          uom: 'UND',
          stock: 0.0,
          averageCost: 0.0,
          sellPrice: 95.0,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
        ProductEntity(
          id: 'prod-soda',
          name: 'Refresco Reventa',
          uom: 'UND',
          stock: 200.0,
          averageCost: 18.0,
          sellPrice: 35.0,
          productType: 'SIMPLE',
          isPrepared: false,
          inventoryPolicy: 'directStock',
          mappingVersionId: 'mv-soda',
          insumoId: 'ins-soda',
          tenantId: tenantId,
        ),
      ]);

      await authorityDao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-latte-1',
          productId: 'prod-latte',
          versionNumber: 1,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-01-01T00:00:00Z',
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        ),
      );
      await authorityDao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-latte-coffee',
          versionId: 'rv-latte-1',
          ordinal: 0,
          insumoId: 'ins-coffee',
          grossQuantity: 0.020,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Café Molido Espresso',
        ),
      );
      await authorityDao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-latte-milk',
          versionId: 'rv-latte-1',
          ordinal: 1,
          insumoId: 'ins-milk',
          grossQuantity: 0.200,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Leche Entera',
        ),
      );
      await inventoryRepo.saveRecipeVersionDocument(
        RecipeVersionDocument(
          id: 'rv-latte-1',
          productId: 'prod-latte',
          productName: 'Latte Especial',
          versionNumber: 1,
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
          publishedAt: DateTime.parse('2026-01-01T00:00:00Z'),
          components: const [
            RecipeVersionComponentDocument(
              ingredientId: 'ins-coffee',
              ingredientType: 'insumo',
              ingredientName: 'Café Molido Espresso',
              grossQuantity: 0.020,
              netQuantity: 0.020,
              technicalShrinkPct: 0.0,
            ),
            RecipeVersionComponentDocument(
              ingredientId: 'ins-milk',
              ingredientType: 'insumo',
              ingredientName: 'Leche Entera',
              grossQuantity: 0.200,
              netQuantity: 0.200,
              technicalShrinkPct: 0.0,
            ),
          ],
        ),
      );

      await taxConfigDao.insertTaxConfig(
        TaxConfigEntity(
          id: 'tax-iva-15',
          name: 'IVA 15%',
          rate: 0.15,
          isActive: true,
          isDefault: true,
        ),
      );

      await cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: shiftId,
          userId: userId,
          cashierName: 'Cajero Piloto S23',
          terminalId: terminalId,
          openedAt: DateTime.now().toUtc().millisecondsSinceEpoch,
          openingBalanceNio: 1500.0,
          expectedNio: 1500.0,
          isClosed: false,
          syncStatus: 'pending',
        ),
      );

      await localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'),
      );
      await localConfigDao.saveConfig(
        LocalConfigEntity(key: 'dgi_current_number', value: '1'),
      );

      // =======================================================================
      // CASE [1/4] G1.5 Checkout Latency Benchmark (< 1000ms)
      // =======================================================================
      _log('E2E_CASE: [1/4] G1.5 Checkout Latency Benchmark (10 real checkouts < 1000ms)');
      final latenciesMs = <int>[];
      String prevHash = 'GENESIS';

      for (var i = 1; i <= 10; i++) {
        final nextHash = 'pilot-hash-$i';
        final sw = Stopwatch()..start();
        await _executeRealCheckout(
          db: database,
          preparationService: preparationService,
          boundary: boundary,
          tenantId: tenantId,
          userId: userId,
          terminalId: terminalId,
          shiftId: shiftId,
          seqNum: i,
          prevAuditHash: prevHash,
          nextAuditHash: nextHash,
        );
        sw.stop();
        latenciesMs.add(sw.elapsedMilliseconds);
        prevHash = nextHash;
      }

      final sorted = List<int>.from(latenciesMs)..sort();
      final minMs = sorted.first;
      final p50Ms = _percentile(sorted, 0.50);
      final p95Ms = _percentile(sorted, 0.95);
      final maxMs = sorted.last;

      _log('G1.5_LATENCY_MS: min=$minMs p50=$p50Ms p95=$p95Ms max=$maxMs (samples=$latenciesMs)');
      _assertTrue(maxMs < 1000, 'G1.5 max checkout latency ($maxMs ms) < 1000 ms');

      passed++;
      _log('E2E_RESULT: PASS [1/4] G1.5 Checkout Latency < 1000ms (p50=${p50Ms}ms, p95=${p95Ms}ms, max=${maxMs}ms)');

      // =======================================================================
      // CASE [2/4] G2.2 / G2.5 + #534 Q-A1 & Q-A2 Empirical SQLite Verification
      // =======================================================================
      _log('E2E_CASE: [2/4] G2.2/G2.5 + #534 Q-A1 & Q-A2 Empirical SQLite Verification');

      // After 10 sales of 2x soda each, soda stock: 200.0 - 20.0 = 180.0
      final sodaBeforePurchase =
          (await insumoDao.findInsumoById('ins-soda'))!.stock;
      _assertClose(sodaBeforePurchase, 180.0, 'Soda stock after 10 sales');

      // Record real PURCHASE stock intake (+24.0)
      await movementEngine.recordPurchase(
        'ins-soda',
        24.0,
        18.50,
        reason: 'Pilot G2.2 Purchase Intake',
      );
      final sodaAfterPurchase =
          (await insumoDao.findInsumoById('ins-soda'))!.stock;
      _assertClose(sodaAfterPurchase, 204.0, 'Soda stock after PURCHASE intake');

      // Complete 11th real sale deducting from replenished stock
      await _executeRealCheckout(
        db: database,
        preparationService: preparationService,
        boundary: boundary,
        tenantId: tenantId,
        userId: userId,
        terminalId: terminalId,
        shiftId: shiftId,
        seqNum: 11,
        prevAuditHash: prevHash,
        nextAuditHash: 'pilot-hash-11',
      );
      final sodaAfterSale11 =
          (await insumoDao.findInsumoById('ins-soda'))!.stock;
      _assertClose(sodaAfterSale11, 202.0, 'Soda stock after 11th sale');

      // Raw SQLite Q-A1: inventory_outcome distribution
      final qa1Rows = await database.database.rawQuery(
        "SELECT COALESCE(inventory_outcome, 'NULL') AS inventory_outcome, "
        "COALESCE(inventory_outcome_reason, 'NULL') AS inventory_outcome_reason, "
        'COUNT(*) AS cnt '
        'FROM invoices '
        'GROUP BY 1, 2 '
        'ORDER BY cnt DESC, 1 ASC',
      );
      for (final row in qa1Rows) {
        _log(
          'Q-A1_ROW: outcome=${row['inventory_outcome']} reason=${row['inventory_outcome_reason']} count=${row['cnt']}',
        );
      }
      _assertTrue(qa1Rows.isNotEmpty, 'Q-A1 returned distribution rows');

      // Raw SQLite Q-A2: non-canceled regular invoices missing inventory_movements
      final qa2Rows = await database.database.rawQuery(
        'SELECT COUNT(*) AS cnt '
        'FROM invoices i '
        'WHERE i.is_canceled = 0 '
        "  AND (i.type IS NULL OR i.type = 'regular') "
        '  AND NOT EXISTS ( '
        '    SELECT 1 FROM inventory_movements m '
        '    WHERE m.sale_id = i.id '
        '       OR m.source_document_id = i.id '
        '  )',
      );
      final qa2Count = (qa2Rows.first['cnt'] as int?) ?? -1;
      _log('Q-A2_MISSING_MOVEMENTS: $qa2Count');
      _assertTrue(qa2Count == 0, 'Q-A2 == 0 (all non-canceled sales have Kardex movements)');

      passed++;
      _log('E2E_RESULT: PASS [2/4] G2.2/G2.5 Purchase->Sale Kardex + Q-A1/Q-A2 verified (Q-A2=$qa2Count)');

      // =======================================================================
      // CASE [3/4] G5.3 Mid-Shift Close & Reopen Persistence
      // =======================================================================
      _log('E2E_CASE: [3/4] G5.3 Mid-Shift Close & Reopen Persistence');

      final shiftBefore = await cashierSessionDao
          .getActiveSessionForUserAndTerminal(userId, terminalId);
      final prodCountBefore = (await database.database.rawQuery(
        'SELECT COUNT(*) AS cnt FROM products',
      ))
          .first['cnt'] as int;
      final unsyncedBefore = (await database.database.rawQuery(
        "SELECT COUNT(*) AS cnt FROM invoices WHERE sync_status = 'pending'",
      ))
          .first['cnt'] as int;
      final dgiBefore =
          (await localConfigDao.getConfigByKey('dgi_current_number'))?.value;

      _assertTrue(
        shiftBefore != null && shiftBefore.id == shiftId && !shiftBefore.isClosed,
        'Open shift exists before DB close',
      );
      _assertTrue(unsyncedBefore == 11, '11 pending invoices before DB close');
      _assertTrue(dgiBefore == '12', 'dgi_current_number == 12 before DB close');

      // Close Floor AppDatabase cleanly and reopen from the same on-disk SQLite file
      await database.close();
      database = null;

      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      final shiftAfter = await database.cashierSessionDao
          .getActiveSessionForUserAndTerminal(userId, terminalId);
      final prodCountAfter = (await database.database.rawQuery(
        'SELECT COUNT(*) AS cnt FROM products',
      ))
          .first['cnt'] as int;
      final unsyncedAfter = (await database.database.rawQuery(
        "SELECT COUNT(*) AS cnt FROM invoices WHERE sync_status = 'pending'",
      ))
          .first['cnt'] as int;
      final dgiAfter = (await database.localConfigDao
              .getConfigByKey('dgi_current_number'))
          ?.value;

      _assertTrue(
        shiftAfter != null &&
            shiftAfter.id == shiftBefore!.id &&
            !shiftAfter.isClosed,
        'Open shift intact after reopen',
      );
      _assertTrue(
        prodCountAfter == prodCountBefore,
        'Product count intact after reopen ($prodCountAfter == $prodCountBefore)',
      );
      _assertTrue(
        unsyncedAfter == unsyncedBefore,
        'Unsynced invoice count intact after reopen ($unsyncedAfter == $unsyncedBefore)',
      );
      _assertTrue(
        dgiAfter == dgiBefore,
        'dgi_current_number intact after reopen ($dgiAfter == $dgiBefore)',
      );

      passed++;
      _log(
        'E2E_RESULT: PASS [3/4] G5.3 Mid-shift DB close/reopen preserved shift=$shiftId, products=$prodCountAfter, pending_invoices=$unsyncedAfter, dgi_cursor=$dgiAfter',
      );

      // =======================================================================
      // CASE [4/4] G5.5 / #534 Q-A3..Q-A6 Device Capacity Telemetry
      // =======================================================================
      _log('E2E_CASE: [4/4] G5.5 / #534 Q-A3..Q-A6 Device Capacity Telemetry');

      // Q-A3: dgi_current_number + latest 5 invoice_numbers
      final qa3Cursor = (await database.localConfigDao
              .getConfigByKey('dgi_current_number'))
          ?.value;
      final qa3Latest5 = await database.database.rawQuery(
        'SELECT invoice_number, created_at, sync_status '
        'FROM invoices ORDER BY created_at DESC LIMIT 5',
      );
      _log('Q-A3_DGI_CURSOR: $qa3Cursor');
      for (final row in qa3Latest5) {
        _log(
          'Q-A3_LATEST_INVOICE: number=${row['invoice_number']} sync=${row['sync_status']}',
        );
      }
      _assertTrue(qa3Cursor == '12', 'Q-A3 dgi_current_number == 12');
      _assertTrue(qa3Latest5.length == 5, 'Q-A3 returned 5 latest invoices');

      // Q-A4: invoices by sync_status + audit_logs by is_synced
      final qa4Invoices = await database.database.rawQuery(
        'SELECT sync_status, COUNT(*) AS cnt FROM invoices GROUP BY sync_status',
      );
      final qa4Audits = await database.database.rawQuery(
        'SELECT is_synced, COUNT(*) AS cnt FROM audit_logs GROUP BY is_synced',
      );
      for (final row in qa4Invoices) {
        _log('Q-A4_INVOICES: sync_status=${row['sync_status']} count=${row['cnt']}');
      }
      for (final row in qa4Audits) {
        _log('Q-A4_AUDIT_LOGS: is_synced=${row['is_synced']} count=${row['cnt']}');
      }
      _assertTrue(qa4Invoices.isNotEmpty && qa4Audits.isNotEmpty, 'Q-A4 returned queue depth');

      // Q-A5: daily invoice counts
      final qa5Daily = await database.database.rawQuery(
        "SELECT date(created_at / 1000, 'unixepoch', '-6 hours') AS day, COUNT(*) AS cnt "
        'FROM invoices GROUP BY day ORDER BY day DESC',
      );
      for (final row in qa5Daily) {
        _log('Q-A5_DAILY_VOLUME: day=${row['day']} count=${row['cnt']}');
      }
      _assertTrue(qa5Daily.isNotEmpty, 'Q-A5 returned daily volume');

      // Q-A6: real on-disk SQLite size
      final dbBytes = File(dbPath).lengthSync();
      final dbKb = (dbBytes / 1024).toStringAsFixed(1);
      _log('Q-A6_SQLITE_SIZE: ${dbBytes}B (${dbKb}KB)');
      _assertTrue(dbBytes > 0, 'Q-A6 SQLite file size > 0');

      passed++;
      _log(
        'E2E_RESULT: PASS [4/4] G5.5/Q-A3..Q-A6 telemetry captured (db=${dbKb}KB, cursor=$qa3Cursor, pending_invoices=$unsyncedAfter)',
      );

      _log('E2E_RESULT: $passed/$total ALL_TESTS_PASSED');
      if (mounted) setState(() => _status = 'ALL_TESTS_PASSED ($passed/$total)');
    } catch (e, st) {
      _log('TEST_FAILED: $e\n$st');
      if (mounted) setState(() => _status = 'TEST_FAILED: $e');
    } finally {
      await database?.close();
      if (await workDir.exists()) {
        await workDir.delete(recursive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: Text('#531/#534 S23 Pilot Gate — $_status')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: _logs.map((l) => Text(l)).toList(),
        ),
      ),
    );
  }
}
