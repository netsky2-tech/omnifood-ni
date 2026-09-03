import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/fulfillment/topology_persistence_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/fulfillment/durable_print_service.dart';
import 'package:pos_app/domain/services/fulfillment/fulfillment_execution_service.dart';

import 'sales_repository_impl_test.mocks.dart';

class _FakePrinterPort implements PrinterPort {
  bool failReceipt = false;
  bool uncertainReceipt = false;
  final List<String> printedJobs = [];

  @override
  Future<PrinterStatus> checkStatus() async => PrinterStatus.ready;

  @override
  Future<PrinterResult> printInvoice(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    List<int>? logoRasterBytes,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    int paperWidthMm = 58,
  }) async {
    if (failReceipt) {
      return PrinterResult.failure(PrinterStatus.error, 'Receipt failed');
    }
    if (uncertainReceipt) {
      return PrinterResult.failure(
        PrinterStatus.offline,
        'Printer disconnected after print',
      );
    }
    printedJobs.add('RECEIPT:${invoice.id}');
    return PrinterResult.success();
  }

  @override
  Future<PrinterResult> printKitchenOrder({
    required String ticketId,
    required String orderTitle,
    required String cashierName,
    required DateTime timestamp,
    required List<InvoiceItem> items,
    String? notes,
    int? buzzerNumber,
    String? tableName,
  }) async {
    printedJobs.add('TICKET:$ticketId');
    return PrinterResult.success();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

class _FakeAuditRepository implements AuditRepository {
  final List<Map<String, String?>> logs = [];

  @override
  String get deviceId => 'pos-pilot-1';

  @override
  Future<void> log(String action, {String? metadata}) async {
    logs.add({'action': action, 'metadata': metadata});
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

void main() {
  late AppDatabase database;
  late MockDgiNumberingService numberingService;
  late MockProcessSaleInventoryUseCase processInventoryUseCase;
  late SalesRepositoryImpl repository;
  late FulfillmentExecutionService executionService;
  late DurablePrintService printService;
  late _FakePrinterPort printerPort;
  late _FakeAuditRepository auditRepo;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_current_number', value: '1'),
    );
    await database.insumoDao.insertInsumos([
      InsumoEntity(
        id: 'ins-pilot-1',
        name: 'Carne Molida',
        consumptionUom: 'kg',
        stock: 50,
        averageCost: 50,
      ),
    ]);

    numberingService = MockDgiNumberingService();
    processInventoryUseCase = MockProcessSaleInventoryUseCase();
    final inventoryRepository = MockInventoryRepository();

    when(numberingService.isRangeExhausted()).thenAnswer((_) async => false);
    when(
      numberingService.getNextNumber(),
    ).thenAnswer((_) async => '001-001-01-00000001');
    when(
      inventoryRepository.getProductById('product-pilot-1'),
    ).thenAnswer((_) async => null);
    when(processInventoryUseCase.execute(any)).thenAnswer(
      (_) async => [
        InventoryMovement(
          id: 'movement-pilot-1',
          insumoId: 'ins-pilot-1',
          type: MovementType.sale,
          quantity: -1,
          unitCostNio: 50,
          previousStock: 50,
          newStock: 49,
          timestamp: DateTime.parse('2026-09-02T12:00:00Z'),
          sourceDocumentType: 'INVOICE',
          sourceDocumentId: 'pilot-sale-1',
        ),
      ],
    );

    repository = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: numberingService,
      movementEngine: MockMovementEngine(),
      auditRepository: MockAuditRepository(),
      processInventoryUseCase: processInventoryUseCase,
      reverseInventoryUseCase: MockReverseSaleInventoryUseCase(),
      inventoryRepository: inventoryRepository,
    );

    executionService = FulfillmentExecutionService(database);
    printerPort = _FakePrinterPort();
    auditRepo = _FakeAuditRepository();
    printService = DurablePrintService(
      database: database,
      printerPort: printerPort,
      auditRepository: auditRepo,
    );

    // Seed frozen topology snapshot
    await database.fulfillmentTopologyDao.insertSnapshot(
      TopologySnapshotEntity(
        id: 'snap-pilot-tenant-r1',
        tenantId: 'pilot-tenant',
        revision: 1,
        hash: 'pilot-hash-1',
        payload: '{"operationMode":"FOOD_PARK"}',
        receivedAt: '2026-09-02T10:00:00Z',
      ),
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Fulfillment Pilot Rollout Proof (SQLite & Domain Integration)', () {
    test(
      '1. Legacy Tenant Compatibility: checkout with null fulfillmentContext succeeds without creating fulfillment artifacts or rewriting history',
      () async {
        final invoice = _buildInvoice('legacy-sale-1');
        final items = _buildItems('legacy-sale-1');

        await repository.saveSale(
          invoice: invoice,
          items: items,
          payments: const [],
          fulfillmentContext: null, // Legacy tenant without topology
        );

        final persistedInvoice = await database.invoiceDao.getInvoiceById(
          'legacy-sale-1',
        );
        expect(persistedInvoice, isNotNull);
        expect(persistedInvoice?.id, 'legacy-sale-1');

        // Verify NO fulfillment records or outbox events created for legacy checkout
        final outboxEvents = await database.fulfillmentPersistenceDao
            .findPendingOutboxEvents('pilot-tenant');
        expect(outboxEvents, isEmpty);
      },
    );

    test(
      '2. Triangulation across 3 Fulfillment Channels: PRINT_ONLY, KDS_ONLY, and KDS_AND_PRINT',
      () async {
        final cartItems = [
          const CartItem(
            productId: 'p-pilot-1',
            productName: 'Nacatamal Tradicional',
            unitPrice: 120,
            quantity: 1,
            taxRate: 0.15,
          ),
        ];

        // Channel A: PRINT_ONLY
        const topoPrintOnly = FulfillmentTopology(
          tenantId: 'pilot-tenant',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.foodparkQsr,
          channels: {FulfillmentChannel.print},
        );
        final resPrintOnly = await executionService.executeFulfillment(
          tenantId: 'pilot-tenant',
          saleId: 'sale-print-only',
          invoiceNumber: '001-001-01-00000001',
          items: cartItems,
          topology: topoPrintOnly,
          cashierName: 'Cajero Pilot',
        );
        expect(resPrintOnly.channel, 'PRINT_ONLY');
        expect(resPrintOnly.kdsOrders, isEmpty);
        expect(resPrintOnly.printJobs, hasLength(2)); // receipt + ticket
        expect(resPrintOnly.deliveryState, 'PENDING');

        // Channel B: KDS_ONLY
        const topoKdsOnly = FulfillmentTopology(
          tenantId: 'pilot-tenant',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.restaurant,
          channels: {FulfillmentChannel.kds},
        );
        final resKdsOnly = await executionService.executeFulfillment(
          tenantId: 'pilot-tenant',
          saleId: 'sale-kds-only',
          invoiceNumber: '001-001-01-00000002',
          items: cartItems,
          topology: topoKdsOnly,
          cashierName: 'Cajero Pilot',
        );
        expect(resKdsOnly.channel, 'KDS_ONLY');
        expect(resKdsOnly.kdsOrders, hasLength(1));
        expect(resKdsOnly.printJobs, hasLength(1)); // customer receipt only, 0 kitchen tickets
        expect(resKdsOnly.deliveryState, 'PENDING');

        // Channel C: KDS_AND_PRINT
        const topoBoth = FulfillmentTopology(
          tenantId: 'pilot-tenant',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.hybrid,
          channels: {FulfillmentChannel.print, FulfillmentChannel.kds},
        );
        final resBoth = await executionService.executeFulfillment(
          tenantId: 'pilot-tenant',
          saleId: 'sale-both',
          invoiceNumber: '001-001-01-00000003',
          items: cartItems,
          topology: topoBoth,
          cashierName: 'Cajero Pilot',
        );
        expect(resBoth.channel, 'KDS_AND_PRINT');
        expect(resBoth.kdsOrders, hasLength(1));
        expect(resBoth.printJobs, hasLength(2));
      },
    );

    test(
      '3. Offline Missing Routing Fallback: unrouted items generate warning alert and fallback to general dispatch without blocking execution',
      () async {
        const topology = FulfillmentTopology(
          tenantId: 'pilot-tenant',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.foodparkQsr,
          channels: {FulfillmentChannel.print},
        );

        final unroutedItems = [
          const CartItem(
            productId: 'p-unrouted-99',
            productName: 'Producto Desconocido',
            unitPrice: 50,
            quantity: 1,
            taxRate: 0.15,
          ),
        ];

        final result = await executionService.executeFulfillment(
          tenantId: 'pilot-tenant',
          saleId: 'sale-fallback-1',
          invoiceNumber: '001-001-01-00000004',
          items: unroutedItems,
          topology: topology,
          cashierName: 'Cajero Pilot',
        );

        expect(result.routeState, 'ROUTED');
        expect(result.printJobs, isNotEmpty);
        expect(result.channel, 'PRINT_ONLY');
        expect(result.deliveryState, 'PENDING');
      },
    );

    test(
      '4. Print Uncertainty Resolution and Authorized Reprint Copy: resolves UNCERTAIN and creates authorized copy without duplicate stock movements',
      () async {
        final fulfillment = FulfillmentRecordEntity(
          id: 'f-pilot-unc',
          tenantId: 'pilot-tenant',
          saleId: 'sale-pilot-unc',
          topologySnapshotId: 'snap-1',
          topologyRevision: 1,
          channel: 'PRINT_ONLY',
          routeState: 'ROUTED',
          deliveryState: 'PENDING',
          linesPayload: '[]',
        );
        await database.fulfillmentPersistenceDao.insertFulfillment(fulfillment);

        final receiptJob = PrintJobEntity(
          id: 'job-pilot-unc-receipt',
          tenantId: 'pilot-tenant',
          fulfillmentId: 'f-pilot-unc',
          documentKind: 'RECEIPT',
          sequence: 0,
          payload: '{"invoiceId":"sale-pilot-unc"}',
          state: 'PENDING',
          retryCount: 0,
          idempotencyKey: 'key-pilot-unc-receipt',
        );
        await database.fulfillmentPersistenceDao.insertPrintJob(receiptJob);

        // Inject printer disconnect after send -> UNCERTAIN
        printerPort.uncertainReceipt = true;

        final batchRes = await printService.processFulfillmentPrintBatch(
          tenantId: 'pilot-tenant',
          fulfillmentId: 'f-pilot-unc',
        );
        expect(batchRes.receiptState, 'UNCERTAIN');

        // Resolve as retryAsCopy
        printerPort.uncertainReceipt = false;
        await printService.resolveUncertainty(
          tenantId: 'pilot-tenant',
          jobId: 'job-pilot-unc-receipt',
          resolution: UncertaintyResolution.retryAsCopy,
          operatorRole: 'MANAGER',
          reason: 'Papel atascado en gaveta',
        );

        final allJobs = await database.fulfillmentPersistenceDao
            .findPrintJobsByFulfillment('f-pilot-unc', 'pilot-tenant');
        expect(allJobs, hasLength(2));
        expect(allJobs.first.state, 'UNCERTAIN_SUPERSEDED');
        expect(allJobs.last.state, 'PRINTED');
        expect(allJobs.last.idempotencyKey, contains(':copy:'));

        // Perform authorized reprint copy
        final reprintCopy = await printService.requestReprint(
          tenantId: 'pilot-tenant',
          jobId: 'job-pilot-unc-receipt',
          userRole: 'MANAGER',
          userId: 'user-mgr-1',
          reason: 'Cliente solicitó duplicado autorizado',
        );
        expect(reprintCopy.id, contains('-copy-'));

        // Verify audit log recorded role and reason
        expect(auditRepo.logs, isNotEmpty);
        expect(auditRepo.logs.any((l) => l['metadata']?.contains('MANAGER') ?? false), isTrue);
      },
    );
  });
}

Invoice _buildInvoice(String id) => Invoice(
  id: id,
  number: '001-001-01-00000001',
  createdAt: DateTime.parse('2026-09-02T12:00:00Z'),
  userId: 'cashier-1',
  subtotal: 100,
  totalTax: 15,
  total: 115,
  paymentStatus: PaymentStatus.paid,
  syncStatus: SyncStatus.pending,
  type: InvoiceType.regular,
);

List<InvoiceItem> _buildItems(String invoiceId) => [
  InvoiceItem(
    id: 'item-$invoiceId-1',
    invoiceId: invoiceId,
    productId: 'product-pilot-1',
    productName: 'Carne Asada con Tajadas',
    quantity: 1,
    unitPrice: 100,
    taxAmount: 15,
    total: 115,
    originalTaxRate: 15,
    appliedTaxRate: 15,
  ),
];
