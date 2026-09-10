import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:mockito/mockito.dart';

import 'sales_repository_impl_test.mocks.dart';

void main() {
  late AppDatabase database;
  late SalesRepositoryImpl repository;
  late MockDgiNumberingService mockNumberingService;
  late MockMovementEngine mockMovementEngine;
  late MockAuditRepository mockAuditRepository;
  late MockProcessSaleInventoryUseCase mockProcessInventoryUseCase;
  late MockReverseSaleInventoryUseCase mockReverseInventoryUseCase;
  late MockInventoryRepository mockInventoryRepository;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    mockNumberingService = MockDgiNumberingService();
    mockMovementEngine = MockMovementEngine();
    mockAuditRepository = MockAuditRepository();
    mockProcessInventoryUseCase = MockProcessSaleInventoryUseCase();
    mockReverseInventoryUseCase = MockReverseSaleInventoryUseCase();
    mockInventoryRepository = MockInventoryRepository();

    when(
      mockNumberingService.isRangeExhausted(),
    ).thenAnswer((_) async => false);
    when(
      mockNumberingService.getNextNumber(),
    ).thenAnswer((_) async => '001-001-01-00000001');
    when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});

    when(
      mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
    ).thenAnswer(
      (_) async => AuditLog(
        userId: 'u1',
        action: 'SALE_CREATED',
        timestamp: DateTime.now(),
        deviceId: 'term-1',
        sequenceNo: 1,
        prevHash: 'GENESIS',
        entryHash: 'HASH1',
      ),
    );

    repository = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: mockNumberingService,
      movementEngine: mockMovementEngine,
      auditRepository: mockAuditRepository,
      processInventoryUseCase: mockProcessInventoryUseCase,
      reverseInventoryUseCase: mockReverseInventoryUseCase,
      inventoryRepository: mockInventoryRepository,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Slice 8 POS movement ownership and exact ACK', () {
    test(
      'saveSale sets deliveryOwner=SALE_SYNC, deliveryState=LOCAL_APPLIED, saleId and saleCorrelationId on frozen movements',
      () async {
        // Setup insumo in database
        await database.insumoDao.insertInsumos([
          InsumoEntity(
            id: 'ins-1',
            name: 'Pan',
            consumptionUom: 'UND',
            warehouseId: 'wh-1',
            isPerishable: false,
            stock: 10.0,
            averageCost: 5.0,
            parLevel: 2.0,
            isActive: true,
          ),
        ]);

        final snapshot = SaleTimeInventorySnapshot(
          classification: SaleInventoryClassification.simple,
          disposition: SaleInventoryDisposition.direct,
          catalogRevision: 'catalog-1',
          mappingVersionId: 'map-v1',
          bindings: [
            SaleTimeInventoryBinding(
              bindingOrdinal: 0,
              insumoId: 'ins-1',
              quantityPerSaleUnit: 1.0,
              saleCorrelationId: 'corr-sha256-direct-1',
            ),
          ],
        );

        final invoice = Invoice(
          id: 'inv-sale-1',
          number: '001-001-01-00000001',
          createdAt: DateTime.parse('2026-09-01T10:00:00Z'),
          userId: 'user-1',
          subtotal: 100.0,
          totalTax: 15.0,
          total: 115.0,
          type: InvoiceType.regular,
          terminalId: 'term-1',
          inventoryPolicyVersion: 'SALE_TIME_V1',
          inventoryOutcome: 'APPLIED',
        );

        final items = [
          InvoiceItem(
            id: 'item-1',
            invoiceId: 'inv-sale-1',
            productId: 'prod-1',
            productName: 'Hamburguesa',
            quantity: 2.0,
            unitPrice: 50.0,
            originalTaxRate: 15.0,
            appliedTaxRate: 15.0,
            taxAmount: 15.0,
            total: 115.0,
            inventorySnapshotVersion: 'SALE_TIME_V1',
            inventorySnapshot: snapshot,
          ),
        ];

        final payments = [
          Payment(
            id: 'pay-1',
            invoiceId: 'inv-sale-1',
            amount: 115.0,
            method: PaymentMethod.cash,
          ),
        ];

        await repository.saveSale(
          invoice: invoice,
          items: items,
          payments: payments,
        );

        // Verify movements in DB
        final movements = await database.salesTransactionDao
            .getMovementsBySaleId('inv-sale-1');
        expect(movements, hasLength(1));
        final m = movements.first;
        expect(m.deliveryOwner, MovementDeliveryOwner.saleSync);
        expect(m.deliveryState, MovementDeliveryState.localApplied);
        expect(m.saleId, 'inv-sale-1');
        expect(m.saleCorrelationId, 'corr-sha256-direct-1');
        expect(m.quantity, -2.0);
      },
    );

    test(
      'acknowledgeSaleSync marks invoice synced and movements CLOUD_ACKNOWLEDGED on exact matching ACK',
      () async {
        // Seed invoice and movements
        final invoice = InvoiceEntity(
          id: 'inv-ack-1',
          number: '001-001-01-00000002',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          type: 'regular',
          syncStatus: 'pending',
          inventoryOutcome: 'APPLIED',
        );
        await database.invoiceDao.insertInvoice(invoice);

        final movement = MovementEntity(
          id: 'corr-1',
          insumoId: 'ins-1',
          type: 'sale',
          quantity: -1.0,
          previousStock: 10.0,
          newStock: 9.0,
          timestamp: DateTime.now().toIso8601String(),
          deliveryOwner: MovementDeliveryOwner.saleSync,
          deliveryState: MovementDeliveryState.localApplied,
          saleId: 'inv-ack-1',
          saleCorrelationId: 'corr-1',
        );
        await database.salesTransactionDao.insertMovement(movement);

        // Call acknowledgeSaleSync with exact matching ACK
        await repository.acknowledgeSaleSync(
          invoiceId: 'inv-ack-1',
          outcome: 'APPLIED',
          acknowledgedCorrelationIds: ['corr-1'],
        );

        // Verify invoice is synced
        final updatedInv = await database.invoiceDao.getInvoiceById(
          'inv-ack-1',
        );
        expect(updatedInv?.syncStatus, 'synced');

        // Verify movement is CLOUD_ACKNOWLEDGED
        final movements = await database.salesTransactionDao
            .getMovementsBySaleId('inv-ack-1');
        expect(
          movements.first.deliveryState,
          MovementDeliveryState.cloudAcknowledged,
        );
      },
    );

    test(
      'acknowledgeSaleSync marks invoice synced when outcome is APPLIED_NO_INVENTORY_IMPACT and ACK set is empty',
      () async {
        final invoice = InvoiceEntity(
          id: 'inv-no-impact',
          number: '001-001-01-00000003',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 50,
          totalTax: 0,
          total: 50,
          type: 'regular',
          syncStatus: 'pending',
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
        );
        await database.invoiceDao.insertInvoice(invoice);

        await repository.acknowledgeSaleSync(
          invoiceId: 'inv-no-impact',
          outcome: 'APPLIED_NO_INVENTORY_IMPACT',
          acknowledgedCorrelationIds: [],
        );

        final updatedInv = await database.invoiceDao.getInvoiceById(
          'inv-no-impact',
        );
        expect(updatedInv?.syncStatus, 'synced');
      },
    );

    test(
      'acknowledgeSaleSync fails closed and throws StateError when ACK misses an expected correlation ID',
      () async {
        final invoice = InvoiceEntity(
          id: 'inv-missing-ack',
          number: '001-001-01-00000004',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          type: 'regular',
          syncStatus: 'pending',
          inventoryOutcome: 'APPLIED',
        );
        await database.invoiceDao.insertInvoice(invoice);

        final movement1 = MovementEntity(
          id: 'corr-m1',
          insumoId: 'ins-1',
          type: 'sale',
          quantity: -1.0,
          previousStock: 10.0,
          newStock: 9.0,
          timestamp: DateTime.now().toIso8601String(),
          deliveryOwner: MovementDeliveryOwner.saleSync,
          deliveryState: MovementDeliveryState.localApplied,
          saleId: 'inv-missing-ack',
          saleCorrelationId: 'corr-m1',
        );
        final movement2 = MovementEntity(
          id: 'corr-m2',
          insumoId: 'ins-2',
          type: 'sale',
          quantity: -1.0,
          previousStock: 10.0,
          newStock: 9.0,
          timestamp: DateTime.now().toIso8601String(),
          deliveryOwner: MovementDeliveryOwner.saleSync,
          deliveryState: MovementDeliveryState.localApplied,
          saleId: 'inv-missing-ack',
          saleCorrelationId: 'corr-m2',
        );
        await database.salesTransactionDao.insertMovement(movement1);
        await database.salesTransactionDao.insertMovement(movement2);

        // Backend only acknowledges corr-m1, omitting corr-m2
        expect(
          () => repository.acknowledgeSaleSync(
            invoiceId: 'inv-missing-ack',
            outcome: 'APPLIED',
            acknowledgedCorrelationIds: ['corr-m1'],
          ),
          throwsA(isA<StateError>()),
        );

        // Verify invoice is STILL pending
        final updatedInv = await database.invoiceDao.getInvoiceById(
          'inv-missing-ack',
        );
        expect(updatedInv?.syncStatus, 'pending');

        // Verify movements are STILL LOCAL_APPLIED
        final movements = await database.salesTransactionDao
            .getMovementsBySaleId('inv-missing-ack');
        expect(
          movements.every(
            (m) => m.deliveryState == MovementDeliveryState.localApplied,
          ),
          isTrue,
        );
      },
    );

    test(
      'acknowledgeSaleSync fails closed when ACK contains unexpected extra correlation ID',
      () async {
        final invoice = InvoiceEntity(
          id: 'inv-extra-ack',
          number: '001-001-01-00000005',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          type: 'regular',
          syncStatus: 'pending',
          inventoryOutcome: 'APPLIED',
        );
        await database.invoiceDao.insertInvoice(invoice);

        final movement1 = MovementEntity(
          id: 'corr-e1',
          insumoId: 'ins-1',
          type: 'sale',
          quantity: -1.0,
          previousStock: 10.0,
          newStock: 9.0,
          timestamp: DateTime.now().toIso8601String(),
          deliveryOwner: MovementDeliveryOwner.saleSync,
          deliveryState: MovementDeliveryState.localApplied,
          saleId: 'inv-extra-ack',
          saleCorrelationId: 'corr-e1',
        );
        await database.salesTransactionDao.insertMovement(movement1);

        // Backend acknowledges corr-e1 AND phantom corr-extra
        expect(
          () => repository.acknowledgeSaleSync(
            invoiceId: 'inv-extra-ack',
            outcome: 'APPLIED',
            acknowledgedCorrelationIds: ['corr-e1', 'corr-extra'],
          ),
          throwsA(isA<StateError>()),
        );

        final updatedInv = await database.invoiceDao.getInvoiceById(
          'inv-extra-ack',
        );
        expect(updatedInv?.syncStatus, 'pending');
      },
    );

    test(
      'acknowledgeSaleSync fails closed when outcome is APPLIED_INVENTORY_PENDING but ACK set is non-empty',
      () async {
        final invoice = InvoiceEntity(
          id: 'inv-pending-ack',
          number: '001-001-01-00000006',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          type: 'regular',
          syncStatus: 'pending',
          inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
        );
        await database.invoiceDao.insertInvoice(invoice);

        expect(
          () => repository.acknowledgeSaleSync(
            invoiceId: 'inv-pending-ack',
            outcome: 'APPLIED_INVENTORY_PENDING',
            acknowledgedCorrelationIds: ['corr-unexpected'],
          ),
          throwsA(isA<StateError>()),
        );

        final updatedInv = await database.invoiceDao.getInvoiceById(
          'inv-pending-ack',
        );
        expect(updatedInv?.syncStatus, 'pending');
      },
    );

    test(
      'acknowledgeSaleSync is idempotent on replay of duplicate ACK for already-synced sale',
      () async {
        final invoice = InvoiceEntity(
          id: 'inv-replay-1',
          number: '001-001-01-00000007',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          type: 'regular',
          syncStatus: 'synced',
          inventoryOutcome: 'APPLIED',
        );
        await database.invoiceDao.insertInvoice(invoice);

        final movement = MovementEntity(
          id: 'corr-replay-1',
          insumoId: 'ins-1',
          type: 'sale',
          quantity: -1.0,
          previousStock: 10.0,
          newStock: 9.0,
          timestamp: DateTime.now().toIso8601String(),
          deliveryOwner: MovementDeliveryOwner.saleSync,
          deliveryState: MovementDeliveryState.cloudAcknowledged,
          saleId: 'inv-replay-1',
          saleCorrelationId: 'corr-replay-1',
        );
        await database.salesTransactionDao.insertMovement(movement);

        // Replaying the ACK on already synced sale
        await repository.acknowledgeSaleSync(
          invoiceId: 'inv-replay-1',
          outcome: 'APPLIED',
          acknowledgedCorrelationIds: ['corr-replay-1'],
        );

        final updatedInv = await database.invoiceDao.getInvoiceById(
          'inv-replay-1',
        );
        expect(updatedInv?.syncStatus, 'synced');
        final movements = await database.salesTransactionDao
            .getMovementsBySaleId('inv-replay-1');
        expect(
          movements.first.deliveryState,
          MovementDeliveryState.cloudAcknowledged,
        );
      },
    );
  });
}
