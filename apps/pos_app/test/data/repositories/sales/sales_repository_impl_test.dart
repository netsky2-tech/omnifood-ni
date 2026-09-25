import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/daos/sales/sales_transaction_dao.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/daos/fulfillment/fulfillment_topology_dao.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_modifier_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/fulfillment/topology_persistence_entities.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';

import 'sales_repository_impl_test.mocks.dart';

class _StubFulfillmentTopologyDao implements FulfillmentTopologyDao {
  _StubFulfillmentTopologyDao(this.snapshot);
  final TopologySnapshotEntity snapshot;
  @override
  Future<TopologySnapshotEntity?> findSnapshot(
    String id,
    String tenantId,
  ) async =>
      id == snapshot.id && tenantId == snapshot.tenantId ? snapshot : null;
  @override
  Future<void> insertSnapshot(TopologySnapshotEntity snapshot) async =>
      throw UnsupportedError('Not used by this test');
  @override
  Future<void> bindShift(ShiftTopologyBindingEntity binding) async =>
      throw UnsupportedError('Not used by this test');
  @override
  Future<void> insertEmergencyAudit(EmergencyTopologyAuditEntity audit) async =>
      throw UnsupportedError('Not used by this test');
  @override
  Future<ShiftTopologyBindingEntity?> findBinding(
    String shiftId,
    String tenantId,
  ) async => null;
  @override
  Future<List<EmergencyTopologyAuditEntity>> findEmergencyAudits(
    String tenantId,
  ) async => [];
}

class _StubLocalConfigDao implements LocalConfigDao {
  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async => null;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Not used by this test');
}

class _StubCashierSessionDao implements CashierSessionDao {
  @override
  Future<CashierSessionEntity?> getActiveSessionForUserAndTerminal(
    String userId,
    String terminalId,
  ) async =>
      null;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Not used by this test');
}

class _FulfillmentAppDatabase extends Fake implements AppDatabase {
  _FulfillmentAppDatabase(this.fulfillmentTopologyDao);
  @override
  final FulfillmentTopologyDao fulfillmentTopologyDao;
  @override
  final CashierSessionDao cashierSessionDao = _StubCashierSessionDao();
  @override
  final LocalConfigDao localConfigDao = _StubLocalConfigDao();
}

class _FulfillmentSalesTransactionDao extends Fake
    implements SalesTransactionDao {
  int fulfillmentTransactionCalls = 0;
  @override
  Future<int?> getNextInvoiceSourceSequence(String terminalId) async => 1;
  @override
  Future<void> executeFulfillmentSaleTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    FulfillmentRecordEntity fulfillment,
    List<PrintJobEntity> printJobs,
    OutboxEventEntity outbox,
    bool shouldFail,
  ) async => fulfillmentTransactionCalls++;
}

@GenerateMocks([
  AppDatabase,
  InvoiceDao,
  InvoiceItemDao,
  PaymentDao,
  CashierSessionDao,
  SalesTransactionDao,
  DgiNumberingService,
  MovementEngine,
  AuditRepository,
  ProcessSaleInventoryUseCase,
  ReverseSaleInventoryUseCase,
  InventoryRepository,
  LocalConfigDao,
])
void main() {
  late SalesRepositoryImpl repository;
  late MockAppDatabase mockDatabase;
  late MockLocalConfigDao mockLocalConfigDao;
  late MockInvoiceDao mockInvoiceDao;
  late MockInvoiceItemDao mockItemDao;
  late MockPaymentDao mockPaymentDao;
  late MockSalesTransactionDao mockTransactionDao;
  late MockDgiNumberingService mockNumberingService;
  late MockMovementEngine mockMovementEngine;
  late MockAuditRepository mockAuditRepository;
  late MockProcessSaleInventoryUseCase mockProcessInventoryUseCase;
  late MockReverseSaleInventoryUseCase mockReverseInventoryUseCase;
  late MockInventoryRepository mockInventoryRepository;
  late MockCashierSessionDao mockSessionDao;

  setUp(() {
    mockDatabase = MockAppDatabase();
    mockLocalConfigDao = MockLocalConfigDao();
    mockInvoiceDao = MockInvoiceDao();
    mockItemDao = MockInvoiceItemDao();
    mockPaymentDao = MockPaymentDao();
    mockTransactionDao = MockSalesTransactionDao();
    mockNumberingService = MockDgiNumberingService();
    mockMovementEngine = MockMovementEngine();
    mockAuditRepository = MockAuditRepository();
    mockProcessInventoryUseCase = MockProcessSaleInventoryUseCase();
    mockReverseInventoryUseCase = MockReverseSaleInventoryUseCase();
    mockInventoryRepository = MockInventoryRepository();

    repository = SalesRepositoryImpl(
      database: mockDatabase,
      invoiceDao: mockInvoiceDao,
      itemDao: mockItemDao,
      paymentDao: mockPaymentDao,
      transactionDao: mockTransactionDao,
      numberingService: mockNumberingService,
      movementEngine: mockMovementEngine,
      auditRepository: mockAuditRepository,
      processInventoryUseCase: mockProcessInventoryUseCase,
      reverseInventoryUseCase: mockReverseInventoryUseCase,
      inventoryRepository: mockInventoryRepository,
    );
    when(
      mockTransactionDao.getNextInvoiceSourceSequence(any),
    ).thenAnswer((_) async => 1);
    when(mockInvoiceDao.getInvoiceById(any)).thenAnswer((_) async => null);

    // B1a-4: shift membership lookup at checkout. Default: no open session,
    // so the sale persists a null shiftId unless a test overrides it.
    mockSessionDao = MockCashierSessionDao();
    when(mockDatabase.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDatabase.localConfigDao).thenReturn(mockLocalConfigDao);
    when(mockLocalConfigDao.getConfigByKey(any)).thenAnswer((_) async => null);
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal(any, any),
    ).thenAnswer((_) async => null);
  });

  test(
    'should use ProcessSaleInventoryUseCase to calculate movements and execute transaction',
    () async {
      // Arrange
      final invoice = Invoice(
        id: 'inv1',
        number: '001',
        createdAt: DateTime.now(),
        userId: 'user1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

      final List<InvoiceItem> items = [
        const InvoiceItem(
          id: 'item1',
          invoiceId: 'inv1',
          productId: 'prod1',
          productName: 'Product 1',
          quantity: 2,
          unitPrice: 50,
          taxAmount: 7.5,
          total: 57.5,
          originalTaxRate: 15,
          appliedTaxRate: 15,
        ),
      ];

      final List<Payment> payments = [
        Payment(
          id: 'pay1',
          invoiceId: 'inv1',
          amount: 115,
          method: PaymentMethod.cash,
          createdAt: DateTime.now(),
        ),
      ];

      final movements = [
        InventoryMovement(
          id: 'mov1',
          insumoId: 'ins1',
          type: MovementType.sale,
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          timestamp: DateTime.now(),
          reason: 'Sale',
        ),
      ];

      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '001');
      // Product not found → item passes through without recipeVersionId resolution
      when(
        mockInventoryRepository.getProductById('prod1'),
      ).thenAnswer((_) async => null);
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => movements);
      when(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});

      // Act
      await repository.saveSale(
        invoice: invoice,
        items: items,
        payments: payments,
      );

      // Assert
      verify(mockProcessInventoryUseCase.execute(any)).called(1);
      verify(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).called(1);
    },
  );

  test(
    'forwards the exact immutable fulfillment context to the checkout callback',
    () async {
      final checkoutContexts = <FulfillmentCheckoutContext>[];
      final topologyDao = _StubFulfillmentTopologyDao(
        TopologySnapshotEntity(
          id: 'tenant-1-r3',
          tenantId: 'tenant-1',
          revision: 3,
          hash: 'snapshot-hash',
          payload: '{}',
          receivedAt: '2026-08-31T10:00:00Z',
        ),
      );
      final transactionDao = _FulfillmentSalesTransactionDao();
      repository = SalesRepositoryImpl(
        database: _FulfillmentAppDatabase(topologyDao),
        invoiceDao: mockInvoiceDao,
        itemDao: mockItemDao,
        paymentDao: mockPaymentDao,
        transactionDao: transactionDao,
        numberingService: mockNumberingService,
        movementEngine: mockMovementEngine,
        auditRepository: mockAuditRepository,
        processInventoryUseCase: mockProcessInventoryUseCase,
        reverseInventoryUseCase: mockReverseInventoryUseCase,
        inventoryRepository: mockInventoryRepository,
        onFulfillmentCheckoutContextReady: checkoutContexts.add,
      );
      const context = FulfillmentCheckoutContext(
        tenantId: 'tenant-1',
        topologySnapshotId: 'tenant-1-r3',
        topologyRevision: 3,
        topologyHash: 'snapshot-hash',
        channel: 'KDS_AND_PRINT',
      );
      final invoice = Invoice(
        id: 'context-sale',
        number: 'draft',
        createdAt: DateTime.parse('2026-08-31T10:00:00Z'),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(
        mockNumberingService.getNextNumber(),
      ).thenAnswer((_) async => 'F001-000127');
      when(
        mockInventoryRepository.getProductById('prod-1'),
      ).thenAnswer((_) async => null);
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});
      await repository.saveSale(
        invoice: invoice,
        items: const [
          InvoiceItem(
            id: 'context-line',
            invoiceId: 'context-sale',
            productId: 'prod-1',
            productName: 'Product 1',
            quantity: 1,
            unitPrice: 100,
            taxAmount: 15,
            total: 115,
            originalTaxRate: 15,
            appliedTaxRate: 15,
          ),
        ],
        payments: const [],
        fulfillmentContext: context,
      );
      final forwarded = checkoutContexts.single;
      expect(checkoutContexts, hasLength(1));
      expect(identical(forwarded, context), isTrue);
      expect(
        (
          forwarded.tenantId,
          forwarded.topologySnapshotId,
          forwarded.topologyRevision,
          forwarded.topologyHash,
          forwarded.channel,
        ),
        ('tenant-1', 'tenant-1-r3', 3, 'snapshot-hash', 'KDS_AND_PRINT'),
      );
      expect(transactionDao.fulfillmentTransactionCalls, 1);
    },
  );

  test(
    'assigns deterministic source metadata when saving regular offline sales',
    () async {
      final invoice = Invoice(
        id: 'sale-offline-1',
        number: 'draft',
        createdAt: DateTime.parse('2026-07-13T10:00:00Z'),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );
      const items = [
        InvoiceItem(
          id: 'sale-line-1',
          invoiceId: 'sale-offline-1',
          productId: 'prod-1',
          productName: 'Product 1',
          quantity: 1,
          unitPrice: 100,
          taxAmount: 15,
          total: 115,
          originalTaxRate: 15,
          appliedTaxRate: 15,
        ),
      ];

      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(
        mockNumberingService.getNextNumber(),
      ).thenAnswer((_) async => 'F001-000127');
      when(
        mockInventoryRepository.getProductById('prod-1'),
      ).thenAnswer((_) async => null);
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.getNextInvoiceSourceSequence('pos-cashier-1'),
      ).thenAnswer((_) async => 17);
      when(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});
      when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});

      await repository.saveSale(
        invoice: invoice,
        items: items,
        payments: const [],
      );

      final captured = verify(
        mockTransactionDao.executeSaleWithDgiTransaction(
          captureAny,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).captured;
      final persisted = captured.single as InvoiceEntity;
      expect(persisted.type, 'regular');
      expect(persisted.terminalId, 'pos-cashier-1');
      expect(persisted.sourceSequence, 17);
      expect(persisted.idempotencyKey, 'sale:pos-cashier-1:sale-offline-1');
      expect(persisted.payloadHash, isNotNull);
      expect(persisted.payloadHash, isNotEmpty);
    },
  );

  test(
    'keeps legacy checkout on the existing transaction when context is absent',
    () async {
      final contexts = <FulfillmentCheckoutContext>[];
      repository = SalesRepositoryImpl(
        database: mockDatabase,
        invoiceDao: mockInvoiceDao,
        itemDao: mockItemDao,
        paymentDao: mockPaymentDao,
        transactionDao: mockTransactionDao,
        numberingService: mockNumberingService,
        movementEngine: mockMovementEngine,
        auditRepository: mockAuditRepository,
        processInventoryUseCase: mockProcessInventoryUseCase,
        reverseInventoryUseCase: mockReverseInventoryUseCase,
        inventoryRepository: mockInventoryRepository,
        onFulfillmentCheckoutContextReady: contexts.add,
      );
      final invoice = Invoice(
        id: 'legacy-context-sale',
        number: 'draft',
        createdAt: DateTime.parse('2026-08-31T11:00:00Z'),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(
        mockNumberingService.getNextNumber(),
      ).thenAnswer((_) async => 'F001-000128');
      when(
        mockInventoryRepository.getProductById('prod-2'),
      ).thenAnswer((_) async => null);
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});

      await repository.saveSale(
        invoice: invoice,
        items: const [
          InvoiceItem(
            id: 'legacy-context-line',
            invoiceId: 'legacy-context-sale',
            productId: 'prod-2',
            productName: 'Product 2',
            quantity: 1,
            unitPrice: 100,
            taxAmount: 15,
            total: 115,
            originalTaxRate: 15,
            appliedTaxRate: 15,
          ),
        ],
        payments: const [],
      );

      expect(contexts, isEmpty);
      verify(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).called(1);
    },
  );

  test(
    'resolves and stores active recipeVersionId for prepared products at sale time',
    () async {
      // Arrange
      final invoice = Invoice(
        id: 'inv2',
        number: '002',
        createdAt: DateTime.now(),
        userId: 'user1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

      final preparedProduct = Product(
        id: 'burger-1',
        name: 'Burger',
        uom: 'un',
        stock: 0,
        averageCost: 0,
        sellPrice: 115,
        isPrepared: true,
      );

      final List<InvoiceItem> items = [
        const InvoiceItem(
          id: 'item-burger',
          invoiceId: 'inv2',
          productId: 'burger-1',
          productName: 'Burger',
          quantity: 2,
          unitPrice: 50,
          taxAmount: 15,
          total: 115,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
        ),
      ];

      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '002');
      when(
        mockInventoryRepository.getProductById('burger-1'),
      ).thenAnswer((_) async => preparedProduct);
      when(
        mockInventoryRepository.getActiveRecipeVersionId('burger-1'),
      ).thenAnswer((_) async => 'rv-active-v3');
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.executeSaleTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});

      // Act
      await repository.saveSale(invoice: invoice, items: items, payments: []);

      // Assert — the use case receives items with resolved recipeVersionId
      final captured = verify(
        mockProcessInventoryUseCase.execute(captureAny),
      ).captured;
      final resolvedItems = captured.single as List<InvoiceItem>;
      expect(resolvedItems.single.recipeVersionId, 'rv-active-v3');
    },
  );

  test(
    'does not recompute recipeVersionId when item already carries one',
    () async {
      // Arrange
      final invoice = Invoice(
        id: 'inv3',
        number: '003',
        createdAt: DateTime.now(),
        userId: 'user1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

      final preparedProduct = Product(
        id: 'burger-1',
        name: 'Burger',
        uom: 'un',
        stock: 0,
        averageCost: 0,
        sellPrice: 115,
        isPrepared: true,
      );

      final List<InvoiceItem> items = [
        const InvoiceItem(
          id: 'item-burger',
          invoiceId: 'inv3',
          productId: 'burger-1',
          productName: 'Burger',
          quantity: 2,
          unitPrice: 50,
          taxAmount: 15,
          total: 115,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          recipeVersionId: 'rv-historical-v1',
        ),
      ];

      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '003');
      when(
        mockInventoryRepository.getProductById('burger-1'),
      ).thenAnswer((_) async => preparedProduct);
      // Active version must NOT be consulted when item already has a version
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.executeSaleTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});

      // Act
      await repository.saveSale(invoice: invoice, items: items, payments: []);

      // Assert — existing recipeVersionId is preserved, active version not queried
      verifyNever(mockInventoryRepository.getActiveRecipeVersionId(any));
      final captured = verify(
        mockProcessInventoryUseCase.execute(captureAny),
      ).captured;
      final resolvedItems = captured.single as List<InvoiceItem>;
      expect(resolvedItems.single.recipeVersionId, 'rv-historical-v1');
    },
  );

  test(
    'rejects prepared product sale when no published recipe version exists',
    () async {
      final invoice = Invoice(
        id: 'inv4',
        number: '004',
        createdAt: DateTime.now(),
        userId: 'user1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );
      const preparedProduct = Product(
        id: 'burger-1',
        name: 'Burger',
        uom: 'un',
        stock: 0,
        averageCost: 0,
        sellPrice: 115,
        isPrepared: true,
      );
      const items = [
        InvoiceItem(
          id: 'item-burger',
          invoiceId: 'inv4',
          productId: 'burger-1',
          productName: 'Burger',
          quantity: 1,
          unitPrice: 100,
          taxAmount: 15,
          total: 115,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
        ),
      ];

      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '004');
      when(
        mockInventoryRepository.getProductById('burger-1'),
      ).thenAnswer((_) async => preparedProduct);
      when(
        mockInventoryRepository.getActiveRecipeVersionId('burger-1'),
      ).thenAnswer((_) async => null);

      await expectLater(
        repository.saveSale(invoice: invoice, items: items, payments: []),
        throwsA(isA<StateError>()),
      );
      verifyNever(
        mockTransactionDao.executeSaleTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      );
    },
  );

  group('SalesRepositoryImpl - voidInvoice cancellation atomicity', () {
    test(
      'does not mark the invoice canceled when inventory reversal fails',
      () async {
        // The sale line carries a historical recipeVersionId whose
        // document is missing, so the versioned reversal throws. The
        // invoice must stay active (no isCanceled persistence) instead
        // of being left canceled without compensating movements.
        final entity = InvoiceEntity(
          id: 'inv-void',
          number: '001',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'user1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          isCanceled: false,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );

        final itemEntities = [
          InvoiceItemEntity(
            id: 'item-void-1',
            invoiceId: 'inv-void',
            productId: 'burger-1',
            productName: 'Burger',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
            recipeVersionId: 'rv-missing',
          ),
        ];

        when(
          mockInvoiceDao.getInvoiceById('inv-void'),
        ).thenAnswer((_) async => entity);
        when(
          mockItemDao.getItemsByInvoiceId('inv-void'),
        ).thenAnswer((_) async => itemEntities);
        when(mockReverseInventoryUseCase.execute(any, any)).thenThrow(
          StateError(
            'Recipe version rv-missing not found for product burger-1. '
            'Historical version binding references a missing document.',
          ),
        );

        await expectLater(
          repository.voidInvoice('inv-void', 'customer refund'),
          throwsA(isA<StateError>()),
        );

        // The atomic write transaction must NOT have been opened: no
        // reversal could be computed, so there is nothing to persist.
        verifyNever(
          mockTransactionDao.executeVoidTransaction(any, any, any, any, any, any),
        );
        // The invoice must NOT have been persisted as canceled.
        verifyNever(
          mockInvoiceDao.updateInvoice(
            argThat(predicate<InvoiceEntity>((e) => e.isCanceled)),
          ),
        );
        // No audit log for a voided sale should be written on failure.
        verifyNever(
          mockAuditRepository.log(
            'SALE_VOIDED',
            metadata: anyNamed('metadata'),
          ),
        );
        // No pre-built audit entry either, since the reversal threw first.
        verifyNever(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        );
      },
    );

    test(
      'delegates cancellation, reversal and audit to a single atomic @transaction when reversal succeeds',
      () async {
        final entity = InvoiceEntity(
          id: 'inv-void-ok',
          number: '002',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'user1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          isCanceled: false,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );

        final itemEntities = [
          InvoiceItemEntity(
            id: 'item-void-ok-1',
            invoiceId: 'inv-void-ok',
            productId: 'prod-1',
            productName: 'Product 1',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
          ),
        ];

        final preparedAudit = AuditLog(
          userId: 'user1',
          action: 'SALE_VOIDED',
          timestamp: DateTime.now(),
          deviceId: 'dev-1',
          metadata:
              '{"invoice_id": "inv-void-ok", "reason": "voided by manager"}',
          sequenceNo: 7,
          prevHash: 'GENESIS',
          entryHash: 'hash-7',
        );

        when(
          mockInvoiceDao.getInvoiceById('inv-void-ok'),
        ).thenAnswer((_) async => entity);
        when(
          mockItemDao.getItemsByInvoiceId('inv-void-ok'),
        ).thenAnswer((_) async => itemEntities);
        // Reversal succeeds with no insumo movements for this line (the
        // product has no BOM), so the movement list is empty. The probe
        // here is the *delegation*: cancellation, reversal and audit are
        // all committed through one @transaction call below.
        when(
          mockReverseInventoryUseCase.execute(any, any),
        ).thenAnswer((_) async => []);
        when(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        ).thenAnswer((_) async => preparedAudit);
        when(
          mockTransactionDao.executeVoidTransaction(any, any, any, any, any, any),
        ).thenAnswer((_) async {});

        await repository.voidInvoice('inv-void-ok', 'voided by manager');

        // ALL persistence now goes through the single Floor @transaction
        // method: reversal movements + isCanceled invoice + audit log.
        final captured = verify(
          mockTransactionDao.executeVoidTransaction(
            captureAny,
            captureAny,
            captureAny,
            captureAny,
            captureAny,
            captureAny,
          ),
        ).captured;
        // Invoice + movements + audit + the two loyalty-reversal slots
        // (null/no-op when the invoice has no customer points to reverse).
        expect(captured.length, 6);
        final movements = captured[0] as List;
        expect(movements, isEmpty); // no BOM on this line
        final canceled = captured[1] as InvoiceEntity;
        expect(canceled.id, 'inv-void-ok');
        expect(canceled.isCanceled, isTrue);
        final audit = captured[2] as AuditLogEntity;
        expect(audit.action, 'SALE_VOIDED');
        expect(audit.entryHash, 'hash-7');
        expect(audit.remoteRefUuid, isNotEmpty); // mapped to a fresh entity
        expect(
          captured[3] as bool,
          isFalse,
        ); // production never forces a failure

        // The repo must NOT perform any separate, non-atomic writes: it
        // delegates everything to the @transaction. A direct invoiceDao /
        // auditRepository.log call would split the unit and re-open the
        // partial-state blocker.
        verifyNever(mockInvoiceDao.updateInvoice(any));
        verifyNever(
          mockAuditRepository.log(any, metadata: anyNamed('metadata')),
        );
      },
    );

    test(
      'rolls back the whole unit if a DAO write inside the void transaction fails (no partial cancellation persisted directly)',
      () async {
        // The previous blocker: voidInvoice awaited each DAO write
        // separately (movement insert, stock update, invoice update,
        // audit log), so a failure after the first write left partial
        // reversal/cancellation persisted.
        //
        // The unit-test harness mocks the Floor database and cannot
        // simulate a real BEGIN/ROLLBACK, so this test proves the fix by
        // contract: the repository performs NO direct DB writes — it
        // delegates the entire unit to SalesTransactionDao.
        // executeVoidTransaction is @transaction-annotated, so Floor
        // guarantees the inner await chain commits atomically or rolls
        // back. Simulating that inner DAO failure here shows the repo
        // propagates the error and makes no other writes.
        final entity = InvoiceEntity(
          id: 'inv-void-fail',
          number: '003',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'user1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          isCanceled: false,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );

        final itemEntities = <InvoiceItemEntity>[
          InvoiceItemEntity(
            id: 'item-void-fail-1',
            invoiceId: 'inv-void-fail',
            productId: 'prod-1',
            productName: 'Product 1',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
          ),
        ];

        // A reversal movement that WOULD have been written first under
        // the old non-atomic loop; now it is just an argument to the
        // atomic transaction, never persisted directly by the repo.
        final reversalMovements = <InventoryMovement>[
          InventoryMovement(
            id: 'rev-mov-1',
            insumoId: 'ins-1',
            type: MovementType.sale,
            quantity: 1, // positive: adds stock back
            previousStock: 8,
            newStock: 9,
            timestamp: DateTime.now(),
            reason: 'Anulación Factura: 003',
          ),
        ];

        final preparedAudit = AuditLog(
          userId: 'user1',
          action: 'SALE_VOIDED',
          timestamp: DateTime.now(),
          deviceId: 'dev-1',
          metadata: '{"invoice_id": "inv-void-fail", "reason": "manager void"}',
          sequenceNo: 8,
          prevHash: 'hash-7',
          entryHash: 'hash-8',
        );

        when(
          mockInvoiceDao.getInvoiceById('inv-void-fail'),
        ).thenAnswer((_) async => entity);
        when(
          mockItemDao.getItemsByInvoiceId('inv-void-fail'),
        ).thenAnswer((_) async => itemEntities);
        when(
          mockReverseInventoryUseCase.execute(any, any),
        ).thenAnswer((_) async => reversalMovements);
        when(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        ).thenAnswer((_) async => preparedAudit);
        // Simulate a DAO write failure INSIDE the @transaction (e.g. the
        // insumo stock update throws). Floor would roll back the whole
        // unit; the repo must surface the error without performing any
        // separate compensating writes.
        when(
          mockTransactionDao.executeVoidTransaction(any, any, any, any, any, any),
        ).thenThrow(StateError('simulated insumo stock update failure'));

        await expectLater(
          repository.voidInvoice('inv-void-fail', 'manager void'),
          throwsA(isA<StateError>()),
        );

        // The atomic wrapper was the ONLY write path attempted.
        verify(
          mockTransactionDao.executeVoidTransaction(any, any, any, any, any, any),
        ).called(1);

        // The repo performs NO direct persistence itself — every write
        // is inside the @transaction above, so a failure there cannot
        // leave partial reversal/cancellation/audit committed.
        verifyNever(mockInvoiceDao.updateInvoice(any));
        verifyNever(
          mockAuditRepository.log(any, metadata: anyNamed('metadata')),
        );
        // The audit entry was pre-built, but never inserted directly by
        // the repo — insertion is the @transaction's responsibility.
        verify(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        ).called(1);
      },
    );
  });

  group('SalesRepositoryImpl - voidInvoice audit metadata JSON encoding', () {
    // The audit metadata used to be built by raw string interpolation, so a
    // free-text reason containing a double quote or a backslash produced
    // invalid JSON that was persisted into the hash-chained audit row.
    // These tests force the reason through characters that break naive
    // interpolation and require the stored metadata to be parseable JSON
    // that round-trips the exact original reason.
    Future<String> captureVoidAuditMetadata({
      required String invoiceId,
      required String reason,
    }) async {
      final entity = InvoiceEntity(
        id: invoiceId,
        number: '001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: false,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
      );
      final itemEntities = [
        InvoiceItemEntity(
          id: 'item-$invoiceId',
          invoiceId: invoiceId,
          productId: 'prod-1',
          productName: 'Product 1',
          quantity: 1,
          unitPrice: 100,
          originalTaxRate: 15,
          appliedTaxRate: 15,
          taxAmount: 15,
          total: 115,
        ),
      ];
      final preparedAudit = AuditLog(
        userId: 'user1',
        action: 'SALE_VOIDED',
        timestamp: DateTime.now(),
        deviceId: 'dev-1',
        metadata: 'unused-by-this-test',
        sequenceNo: 7,
        prevHash: 'GENESIS',
        entryHash: 'hash-7',
      );

      when(mockInvoiceDao.getInvoiceById(invoiceId)).thenAnswer(
        (_) async => entity,
      );
      when(mockItemDao.getItemsByInvoiceId(invoiceId)).thenAnswer(
        (_) async => itemEntities,
      );
      when(mockReverseInventoryUseCase.execute(any, any)).thenAnswer(
        (_) async => [],
      );
      when(
        mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async => preparedAudit);
      when(
        mockTransactionDao.executeVoidTransaction(any, any, any, any, any, any),
      ).thenAnswer((_) async {});

      await repository.voidInvoice(invoiceId, reason);

      final captured = verify(
        mockAuditRepository.prepareLog(any, metadata: captureAnyNamed('metadata')),
      ).captured;
      expect(captured, hasLength(1));
      return captured.single as String;
    }

    void expectMetadataRoundTrips(String metadata, String invoiceId, String reason) {
      final Map<String, dynamic> decoded;
      try {
        decoded = jsonDecode(metadata) as Map<String, dynamic>;
      } on FormatException catch (e) {
        fail('Audit metadata is not valid JSON: $metadata\nError: $e');
      }
      expect(decoded['invoice_id'], invoiceId);
      expect(decoded['reason'], reason);
      // D-15: the reason is now a structured code + optional detail; the
      // code always rides the metadata as the metrics hook.
      expect(decoded['reason_code'], reason);
      expect(decoded.containsKey('reason_detail'), isFalse);
    }

    test('escapes a reason containing a double quote', () async {
      const reason = 'Cliente dijo "no pagó"';
      final metadata = await captureVoidAuditMetadata(
        invoiceId: 'inv-meta-quote',
        reason: reason,
      );
      expectMetadataRoundTrips(metadata, 'inv-meta-quote', reason);
    });

    test('escapes a reason containing a backslash', () async {
      const reason = 'Ruta C:\\facturas\\anulada';
      final metadata = await captureVoidAuditMetadata(
        invoiceId: 'inv-meta-backslash',
        reason: reason,
      );
      expectMetadataRoundTrips(metadata, 'inv-meta-backslash', reason);
    });

    test('escapes a reason containing a quote, a backslash and a newline', () async {
      const reason = 'Dice "fue" el \\ error\nde synchronize';
      final metadata = await captureVoidAuditMetadata(
        invoiceId: 'inv-meta-mixed',
        reason: reason,
      );
      expectMetadataRoundTrips(metadata, 'inv-meta-mixed', reason);
    });
  });

  group('B1r/JD-B-002: the POS credit note inherits origin rates and stamps issuance', () {
    test('rates copy from the origin; shift/local date/snapshot reflect issuance',
        () async {
      // Origin with DISTINCT non-default rates: any constructor-default rate
      // on the note (36.6241/36.50/0.0) is fabrication (JD-B-002).
      final original = InvoiceEntity(
        id: 'inv-cn-rates',
        number: 'F001-000777',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'cashier-1',
        subtotal: 200,
        totalTax: 30,
        total: 230,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        bcnOfficialRate: 41.25,
        commercialRate: 39.75,
        totalUsd: 5.79,
      );
      final originalItems = [
        InvoiceItemEntity(
          id: 'origin-line-1',
          invoiceId: original.id,
          productId: 'combo-1',
          productName: 'Combo 1',
          quantity: 2,
          unitPrice: 100,
          originalTaxRate: 15,
          appliedTaxRate: 15,
          taxAmount: 30,
          total: 230,
        ),
      ];

      when(
        mockInvoiceDao.getInvoiceById(original.id),
      ).thenAnswer((_) async => original);
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(
        mockItemDao.getItemsByInvoiceId(original.id),
      ).thenAnswer((_) async => originalItems);
      when(
        mockTransactionDao.getCreditNotesByRelatedId(original.id),
      ).thenAnswer((_) async => []);
      when(
        mockNumberingService.getNextNumber(),
      ).thenAnswer((_) async => 'NC-777');
      when(
        mockTransactionDao.getNextInvoiceSourceSequence('pos-cashier-1'),
      ).thenAnswer((_) async => 9);
      when(
        mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async => null);
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockReverseInventoryUseCase.execute(any, any),
      ).thenAnswer((_) async => []);
      // The credit-note movements builder queries the origin items again.
      when(
        mockItemDao.getItemsByInvoiceId('inv-cn-rates'),
      ).thenAnswer((_) async => originalItems);
      when(
        mockTransactionDao.executeSaleTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});

      // Issuance-time session: the shiftId must be THIS session. Realistic
      // pairing — the session opener stamps a deviceId, and the caller passes
      // that SAME terminal (JD-B-002/R2-3/R2-4).
      const deviceId = 'SUNMI-V2S-7F3A';
      const issuingUser = 'manager-1';
      final session = CashierSessionEntity(
        id: 'shift-issuance-1',
        userId: issuingUser,
        terminalId: deviceId,
        openedAt: 1700000000000,
        isClosed: false,
      );
      when(mockSessionDao.getActiveSessionForUserAndTerminal(
        issuingUser,
        deviceId,
      )).thenAnswer((_) async => session);
      // Issuance-time config: the snapshot must record THESE values.
      when(mockLocalConfigDao.getConfigByKey('printer_header_business_name'))
          .thenAnswer((_) async => LocalConfigEntity(
              key: 'printer_header_business_name', value: 'Café Al Momento'));
      when(mockLocalConfigDao.getConfigByKey('tax_regime')).thenAnswer(
          (_) async => LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'));

      await repository.createCreditNote(
        originalInvoiceId: original.id,
        reason: 'ERROR_DE_CAPTURA',
        authorizedByUserId: issuingUser,
        authorizedByRole: UserRole.manager,
        terminalId: deviceId,
      );

      final captured = verify(
        mockTransactionDao.executeSaleTransaction(
          captureAny,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      );
      captured.called(1);
      final note = captured.captured.first as InvoiceEntity;
      // Rates: origin's, not the constructor defaults.
      expect(note.bcnOfficialRate, 41.25);
      expect(note.commercialRate, 39.75);
      expect(note.totalUsd, 5.79);
      // Issuance moment: the open session and today's local date.
      expect(note.shiftId, 'shift-issuance-1');
      expect(note.localIssueDate,
          DateTime.now().toIso8601String().substring(0, 10));
      // A FRESH snapshot of issuance-time config, with the regime key.
      final snapshot =
          jsonDecode(note.fiscalHeaderSnapshot!) as Map<String, dynamic>;
      expect(snapshot['businessName'], 'Café Al Momento');
      expect(snapshot['taxRegime'], 'REGIMEN_GENERAL');
    });

    test('a mismatched terminal yields a null shiftId honestly, no throw',
        () async {
      final original = InvoiceEntity(
        id: 'inv-cn-rates',
        number: 'F001-000777',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'cashier-1',
        subtotal: 200,
        totalTax: 30,
        total: 230,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        bcnOfficialRate: 41.25,
        commercialRate: 39.75,
        totalUsd: 5.79,
      );
      when(
        mockInvoiceDao.getInvoiceById(original.id),
      ).thenAnswer((_) async => original);
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(
        mockItemDao.getItemsByInvoiceId(original.id),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.getCreditNotesByRelatedId(original.id),
      ).thenAnswer((_) async => []);
      when(
        mockNumberingService.getNextNumber(),
      ).thenAnswer((_) async => 'NC-778');
      when(
        mockTransactionDao.getNextInvoiceSourceSequence(any),
      ).thenAnswer((_) async => 10);
      when(
        mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async => null);
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockReverseInventoryUseCase.execute(any, any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.executeSaleTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      // The issuing session lives on ANOTHER terminal: no match.
      when(mockSessionDao.getActiveSessionForUserAndTerminal(
        'manager-1',
        'TERM-OTHER',
      )).thenAnswer((_) async => null);

      await repository.createCreditNote(
        originalInvoiceId: original.id,
        reason: 'ERROR_DE_CAPTURA',
        authorizedByUserId: 'manager-1',
        authorizedByRole: UserRole.manager,
        terminalId: 'TERM-OTHER',
      );

      final captured = verify(
        mockTransactionDao.executeSaleTransaction(
          captureAny,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      );
      captured.called(1);
      final note = captured.captured.first as InvoiceEntity;
      expect(note.shiftId, isNull,
          reason: 'null = no open session known for this terminal — '
              'never a synthetic match');
    });
  });

  group('SalesRepositoryImpl - credit note refund policy', () {
    test(
      'creates a partial financial-only credit note without returning BOM stock',
      () async {
        final original = InvoiceEntity(
          id: 'inv-credit-origin',
          number: 'F001-000123',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 200,
          totalTax: 30,
          total: 230,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );
        final originalItems = [
          InvoiceItemEntity(
            id: 'origin-line-1',
            invoiceId: original.id,
            productId: 'combo-1',
            productName: 'Combo 1',
            quantity: 4,
            unitPrice: 50,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 30,
            total: 230,
            recipeVersionId: 'rv-combo-1',
          ),
        ];

        when(
          mockInvoiceDao.getInvoiceById(original.id),
        ).thenAnswer((_) async => original);
        when(
          mockNumberingService.isRangeExhausted(),
        ).thenAnswer((_) async => false);
        when(
          mockItemDao.getItemsByInvoiceId(original.id),
        ).thenAnswer((_) async => originalItems);
        when(
          mockTransactionDao.getCreditNotesByRelatedId(original.id),
        ).thenAnswer((_) async => []);
        when(
          mockNumberingService.isRangeExhausted(),
        ).thenAnswer((_) async => false);
        when(
          mockNumberingService.getNextNumber(),
        ).thenAnswer((_) async => 'NC-001');
        when(
          mockTransactionDao.getNextInvoiceSourceSequence('pos-cashier-1'),
        ).thenAnswer((_) async => 7);
        when(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        ).thenAnswer((_) async => null);
        when(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        ).thenAnswer((_) async {});
        when(
          mockAuditRepository.log(any, metadata: anyNamed('metadata')),
        ).thenAnswer((_) async {});
        when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});

        await repository.createCreditNote(
          originalInvoiceId: original.id,
          reason: 'Customer goodwill adjustment',
          authorizedByUserId: 'manager-1',
          authorizedByRole: UserRole.manager,
          refundReasonPolicy: RefundReasonPolicy.financialOnly,
          lines: const [
            CreditNoteRefundLine(
              originInvoiceItemId: 'origin-line-1',
              quantity: 1,
            ),
          ],
        );

        final captured = verify(
          mockTransactionDao.executeSaleTransaction(
            captureAny,
            captureAny,
            any,
            any,
            captureAny,
            any,
            any,
          ),
        ).captured;
        final creditNote = captured[0] as InvoiceEntity;
        final creditLines = captured[1] as List<InvoiceItemEntity>;
        final movements = captured[2] as List;

        expect(creditNote.type, 'creditNote');
        expect(creditNote.relatedInvoiceId, original.id);
        expect(creditNote.refundReasonPolicy, 'FINANCIAL_ONLY');
        expect(creditNote.refundReasonCode, 'Customer goodwill adjustment');
        expect(creditNote.authorizedByUserId, 'manager-1');
        expect(creditNote.authorizedByRole, 'manager');
        expect(creditNote.originInvoiceId, original.id);
        expect(creditNote.sourceSequence, 7);
        expect(creditLines, hasLength(1));
        expect(creditLines.single.quantity, -1);
        expect(creditLines.single.originInvoiceItemId, 'origin-line-1');
        expect(creditLines.single.total, -57.5);
        expect(movements, isEmpty);
        verifyNever(mockReverseInventoryUseCase.execute(any, any));
        verifyNever(
          mockAuditRepository.log(any, metadata: anyNamed('metadata')),
        );
      },
    );

    test('rejects credit note when DGI numbering range is exhausted', () async {
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => true);

      await expectLater(
        repository.createCreditNote(
          originalInvoiceId: 'inv-exhausted',
          reason: 'Valid return reason',
          authorizedByUserId: 'manager-1',
          authorizedByRole: UserRole.manager,
        ),
        throwsA(isA<Exception>()),
      );

      verifyNever(mockNumberingService.getNextNumber());
      verifyNever(mockInvoiceDao.getInvoiceById(any));
    });

    test(
      'rejects blank credit note reason before numbering or persistence',
      () async {
        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: 'inv-blank-reason',
            reason: '   ',
            authorizedByUserId: 'manager-1',
            authorizedByRole: UserRole.manager,
          ),
          throwsA(isA<StateError>()),
        );

        verifyNever(mockNumberingService.isRangeExhausted());
        verifyNever(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        );
      },
    );

    test('rejects repository credit note without authorized actor', () async {
      await expectLater(
        repository.createCreditNote(
          originalInvoiceId: 'inv-no-actor',
          reason: 'Valid return reason',
          authorizedByUserId: ' ',
          authorizedByRole: UserRole.manager,
        ),
        throwsA(isA<StateError>()),
      );

      verifyNever(mockNumberingService.isRangeExhausted());
      verifyNever(
        mockTransactionDao.executeSaleTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      );
    });

    test(
      'rejects cashier or waiter repository bypass attempts before persistence',
      () async {
        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: 'inv-cashier-bypass',
            reason: 'Valid return reason',
            authorizedByUserId: 'cashier-1',
            authorizedByRole: UserRole.cashier,
          ),
          throwsA(isA<StateError>()),
        );
        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: 'inv-waiter-bypass',
            reason: 'Valid return reason',
            authorizedByUserId: 'waiter-1',
            authorizedByRole: UserRole.waiter,
          ),
          throwsA(isA<StateError>()),
        );

        verifyNever(mockNumberingService.isRangeExhausted());
        verifyNever(mockInvoiceDao.getInvoiceById(any));
        verifyNever(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        );
      },
    );

    test(
      'creates restock movements without claiming a false origin movement id',
      () async {
        final original = InvoiceEntity(
          id: 'inv-restock-origin',
          number: 'F001-000128',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );
        final originalItems = [
          InvoiceItemEntity(
            id: 'origin-line-restock',
            invoiceId: original.id,
            productId: 'prod-restock',
            productName: 'Product Restock',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
          ),
        ];

        when(
          mockNumberingService.isRangeExhausted(),
        ).thenAnswer((_) async => false);
        when(
          mockInvoiceDao.getInvoiceById(original.id),
        ).thenAnswer((_) async => original);
        when(
          mockItemDao.getItemsByInvoiceId(original.id),
        ).thenAnswer((_) async => originalItems);
        when(
          mockTransactionDao.getCreditNotesByRelatedId(original.id),
        ).thenAnswer((_) async => []);
        when(
          mockNumberingService.getNextNumber(),
        ).thenAnswer((_) async => 'NC-RESTOCK-1');
        when(
          mockTransactionDao.getNextInvoiceSourceSequence('pos-cashier-1'),
        ).thenAnswer((_) async => 18);
        when(mockReverseInventoryUseCase.execute(any, any)).thenAnswer(
          (_) async => [
            InventoryMovement(
              id: 'new-reversal-movement-id',
              insumoId: 'ins-restock',
              type: MovementType.reversal,
              quantity: 1,
              previousStock: 4,
              newStock: 5,
              timestamp: DateTime.parse('2026-07-13T10:00:00Z'),
              originInvoiceItemId: 'origin-line-restock',
            ),
          ],
        );
        when(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        ).thenAnswer((_) async => null);
        when(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        ).thenAnswer((_) async {});
        when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});

        await repository.createCreditNote(
          originalInvoiceId: original.id,
          reason: 'Restock original goods',
          authorizedByUserId: 'manager-1',
          authorizedByRole: UserRole.manager,
          refundReasonPolicy: RefundReasonPolicy.restockOriginalBom,
          lines: const [
            CreditNoteRefundLine(
              originInvoiceItemId: 'origin-line-restock',
              quantity: 1,
            ),
          ],
        );

        final captured = verify(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            captureAny,
            any,
            any,
          ),
        ).captured;
        final movements = captured.single as List<MovementEntity>;
        expect(movements, isNotEmpty);
        final movement = movements.single;
        expect(movement.sourceDocumentType, 'CREDIT_NOTE_RESTOCK');
        expect(movement.originMovementId, isNull);
        expect(movement.originInvoiceItemId, 'origin-line-restock');
      },
    );

    test(
      'rejects canceled or non-regular invoice origins before persistence',
      () async {
        final canceledOrigin = InvoiceEntity(
          id: 'inv-canceled-origin',
          number: 'F001-000125',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          isCanceled: true,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );
        final creditNoteOrigin = InvoiceEntity(
          id: 'inv-credit-note-origin',
          number: 'NC-ORIGIN',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: -100,
          totalTax: -15,
          total: -115,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'creditNote',
        );

        when(
          mockNumberingService.isRangeExhausted(),
        ).thenAnswer((_) async => false);
        when(
          mockInvoiceDao.getInvoiceById(canceledOrigin.id),
        ).thenAnswer((_) async => canceledOrigin);
        when(
          mockInvoiceDao.getInvoiceById(creditNoteOrigin.id),
        ).thenAnswer((_) async => creditNoteOrigin);

        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: canceledOrigin.id,
            reason: 'Valid return reason',
            authorizedByUserId: 'manager-1',
            authorizedByRole: UserRole.manager,
          ),
          throwsA(isA<StateError>()),
        );
        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: creditNoteOrigin.id,
            reason: 'Valid return reason',
            authorizedByUserId: 'manager-1',
            authorizedByRole: UserRole.manager,
          ),
          throwsA(isA<StateError>()),
        );

        verifyNever(mockItemDao.getItemsByInvoiceId(any));
        verifyNever(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        );
      },
    );

    test(
      'rejects duplicate requested refund lines for the same origin item',
      () async {
        final original = InvoiceEntity(
          id: 'inv-duplicate-lines-origin',
          number: 'F001-000126',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );
        final originalItems = [
          InvoiceItemEntity(
            id: 'origin-line-duplicate',
            invoiceId: original.id,
            productId: 'prod-duplicate',
            productName: 'Product Duplicate',
            quantity: 2,
            unitPrice: 50,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
          ),
        ];

        when(
          mockNumberingService.isRangeExhausted(),
        ).thenAnswer((_) async => false);
        when(
          mockInvoiceDao.getInvoiceById(original.id),
        ).thenAnswer((_) async => original);
        when(
          mockItemDao.getItemsByInvoiceId(original.id),
        ).thenAnswer((_) async => originalItems);

        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: original.id,
            reason: 'Duplicate line attempt',
            authorizedByUserId: 'manager-1',
            authorizedByRole: UserRole.manager,
            lines: const [
              CreditNoteRefundLine(
                originInvoiceItemId: 'origin-line-duplicate',
                quantity: 1.25,
              ),
              CreditNoteRefundLine(
                originInvoiceItemId: 'origin-line-duplicate',
                quantity: 1.25,
              ),
            ],
          ),
          throwsA(isA<StateError>()),
        );

        verifyNever(mockTransactionDao.getCreditNotesByRelatedId(any));
        verifyNever(mockNumberingService.getNextNumber());
        verifyNever(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        );
      },
    );

    test(
      'rejects a cumulative over-refund for the same origin invoice item before sync',
      () async {
        final original = InvoiceEntity(
          id: 'inv-credit-origin-2',
          number: 'F001-000124',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );
        final originalItems = [
          InvoiceItemEntity(
            id: 'origin-line-2',
            invoiceId: original.id,
            productId: 'prod-2',
            productName: 'Product 2',
            quantity: 2,
            unitPrice: 50,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
          ),
        ];
        final priorCreditNote = InvoiceEntity(
          id: 'credit-note-prior',
          number: 'NC-0001',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'cashier-1',
          subtotal: -50,
          totalTax: -7.5,
          total: -57.5,
          syncStatus: 'pending',
          paymentStatus: 'paid',
          type: 'creditNote',
          relatedInvoiceId: original.id,
          originInvoiceId: original.id,
          refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
        );
        final priorCreditItems = [
          InvoiceItemEntity(
            id: 'credit-line-prior',
            invoiceId: priorCreditNote.id,
            productId: 'prod-2',
            productName: 'RETURN: Product 2',
            quantity: -1.5,
            unitPrice: 50,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: -11.25,
            total: -86.25,
            originInvoiceItemId: 'origin-line-2',
          ),
        ];

        when(
          mockInvoiceDao.getInvoiceById(original.id),
        ).thenAnswer((_) async => original);
        when(
          mockNumberingService.isRangeExhausted(),
        ).thenAnswer((_) async => false);
        when(
          mockItemDao.getItemsByInvoiceId(original.id),
        ).thenAnswer((_) async => originalItems);
        when(
          mockTransactionDao.getCreditNotesByRelatedId(original.id),
        ).thenAnswer((_) async => [priorCreditNote]);
        when(
          mockItemDao.getItemsByInvoiceId(priorCreditNote.id),
        ).thenAnswer((_) async => priorCreditItems);

        await expectLater(
          repository.createCreditNote(
            originalInvoiceId: original.id,
            reason: 'Second refund attempt',
            authorizedByUserId: 'manager-1',
            authorizedByRole: UserRole.manager,
            refundReasonPolicy: RefundReasonPolicy.restockOriginalBom,
            lines: const [
              CreditNoteRefundLine(
                originInvoiceItemId: 'origin-line-2',
                quantity: 1,
              ),
            ],
          ),
          throwsA(isA<StateError>()),
        );

        verifyNever(
          mockTransactionDao.executeSaleTransaction(
            any,
            any,
            any,
            any,
            any,
            any,
            any,
          ),
        );
      },
    );
  });

  group('B1a-4: shift (turno) membership at checkout', () {
    Invoice invoiceWithUser(String id, String userId) => Invoice(
          id: id,
          number: 'draft',
          createdAt: DateTime.parse('2026-02-01T12:00:00Z'),
          userId: userId,
          subtotal: 100,
          totalTax: 15,
          total: 115,
          paymentStatus: PaymentStatus.paid,
          syncStatus: SyncStatus.pending,
          type: InvoiceType.regular,
        );

    void arrangeHappyPath() {
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '001');
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});
    }

    InvoiceEntity capturedInvoice() {
      final result = verify(
        mockTransactionDao.executeSaleWithDgiTransaction(
          captureAny,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      );
      result.called(1);
      return result.captured.first as InvoiceEntity;
    }

    test(
        'records the open session id of the sale\'s own user and terminal as shiftId',
        () async {
      arrangeHappyPath();
      when(
        mockSessionDao.getActiveSessionForUserAndTerminal('user1', 'pos-user1'),
      ).thenAnswer(
        (_) async => CashierSessionEntity(
          id: 'shift-open-1',
          userId: 'user1',
          terminalId: 'pos-user1',
          openedAt: 100,
          isClosed: false,
        ),
      );

      await repository.saveSale(
        invoice: invoiceWithUser('inv-shift-1', 'user1'),
        items: const [],
        payments: [],
      );

      expect(capturedInvoice().shiftId, 'shift-open-1');
    });

    test('records a null shiftId when no matching open session exists',
        () async {
      arrangeHappyPath();

      await repository.saveSale(
        invoice: invoiceWithUser('inv-shift-2', 'user1'),
        items: const [],
        payments: [],
      );

      expect(capturedInvoice().shiftId, isNull);
    });

    test(
        'scopes the session lookup to the sale\'s own user and resolved terminal',
        () async {
      arrangeHappyPath();

      await repository.saveSale(
        invoice: invoiceWithUser('inv-shift-3', 'user1'),
        items: const [],
        payments: [],
      );

      // terminalId falls back to 'pos-<userId>' for the sale.
      verify(
        mockSessionDao.getActiveSessionForUserAndTerminal('user1', 'pos-user1'),
      ).called(1);
    });

    test('records the local calendar issue date of the sale at checkout',
        () async {
      arrangeHappyPath();

      // Local DateTime (not UTC-parsed): the fiscal day is the device-local
      // calendar date at issuance, stored now and never recomputed (D-12).
      await repository.saveSale(
        invoice: Invoice(
          id: 'inv-issue-date-1',
          number: 'draft',
          createdAt: DateTime(2026, 9, 23, 21, 40),
          userId: 'user1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          paymentStatus: PaymentStatus.paid,
          syncStatus: SyncStatus.pending,
          type: InvoiceType.regular,
        ),
        items: const [],
        payments: [],
      );

      expect(capturedInvoice().localIssueDate, '2026-09-23');
    });
  });

  group('B1r: fiscal header snapshot at checkout (D-13)', () {
    InvoiceEntity capturedSnapshotInvoice() {
      final result = verify(
        mockTransactionDao.executeSaleWithDgiTransaction(
          captureAny,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      );
      result.called(1);
      return result.captured.first as InvoiceEntity;
    }

    Invoice invoiceWithUser(String id, String userId) => Invoice(
          id: id,
          number: 'draft',
          createdAt: DateTime(2026, 9, 24, 12, 0),
          userId: userId,
          subtotal: 100,
          totalTax: 15,
          total: 115,
          paymentStatus: PaymentStatus.paid,
          syncStatus: SyncStatus.pending,
          type: InvoiceType.regular,
        );

    void arrangeSnapshotPath() {
      when(
        mockNumberingService.isRangeExhausted(),
      ).thenAnswer((_) async => false);
      when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '001');
      when(
        mockProcessInventoryUseCase.execute(any),
      ).thenAnswer((_) async => []);
      when(
        mockTransactionDao.executeSaleWithDgiTransaction(
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
        ),
      ).thenAnswer((_) async {});
      when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});
      when(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async {});
    }

    test('writes the header JSON from issuance-time config with fallback resolution',
        () async {
      // printer_header_* wins over the business-profile fallbacks.
      when(mockLocalConfigDao.getConfigByKey('printer_header_business_name'))
          .thenAnswer(
              (_) async => LocalConfigEntity(key: 'printer_header_business_name', value: 'Café Emisor S.A.'));
      when(mockLocalConfigDao.getConfigByKey('ruc')).thenAnswer(
          (_) async => LocalConfigEntity(key: 'ruc', value: 'A0011234567890'));
      when(mockLocalConfigDao.getConfigByKey('dgi_authorization_code'))
          .thenAnswer((_) async => LocalConfigEntity(
              key: 'dgi_authorization_code', value: 'AUT-DGI-2026-0001'));
      // JD-B-003: the regime is part of the snapshot.
      when(mockLocalConfigDao.getConfigByKey('tax_regime')).thenAnswer(
          (_) async => LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'));
      // Fallback path exercised: no printer_header_address, only 'address'.
      when(mockLocalConfigDao.getConfigByKey('address')).thenAnswer(
          (_) async => LocalConfigEntity(key: 'address', value: 'Calle Original 456'));

      arrangeSnapshotPath();
      await repository.saveSale(
        invoice: invoiceWithUser('inv-snap-1', 'user1'),
        items: const [],
        payments: [],
      );

      final persisted = capturedSnapshotInvoice();
      expect(persisted.fiscalHeaderSnapshot, isNotNull);
      final snapshot =
          jsonDecode(persisted.fiscalHeaderSnapshot!) as Map<String, dynamic>;
      expect(snapshot, {
        'businessName': 'Café Emisor S.A.',
        'ruc': 'A0011234567890',
        'address': 'Calle Original 456',
        'fiscalAuthorizationNumber': 'AUT-DGI-2026-0001',
        'taxRegime': 'REGIMEN_GENERAL',
      });
      // Blank/absent values are omitted, never fabricated.
      expect(snapshot.containsKey('phone'), isFalse);
    });

    test('stores null when the business has no header config at all',
        () async {
      arrangeSnapshotPath();

      await repository.saveSale(
        invoice: invoiceWithUser('inv-snap-2', 'user1'),
        items: const [],
        payments: [],
      );

      expect(capturedSnapshotInvoice().fiscalHeaderSnapshot, isNull);
    });
  });

  group('#548: full-column preservation on invoice rewrites', () {
    // Every column of the live `invoices` schema, seeded with a DISTINCT,
    // non-default value. A partial entity rebuild cannot reproduce these
    // values: non-nullable columns fall back to constructor defaults and
    // nullable ones to null, so any dropped column shows up as a value
    // change. The tripwire test pins this map to the real schema so the
    // next added column is covered automatically (dart:mirrors is not
    // available in Flutter, so the entity field list is mirrored here and
    // validated against PRAGMA table_info on every run).
    const seededRow = <String, Object>{
      'id': 'row-preservation-1',
      'invoice_number': '001-001-01-00000999',
      'created_at': 1700000000000,
      'user_id': 'cashier-preserve',
      'subtotal': 100.5,
      'total_tax': 15.75,
      'total': 116.25,
      'is_canceled': 0,
      'void_reason': 'seed-void-reason',
      'sync_status': 'synced',
      'payment_status': 'paid',
      'customer_id': 'cust-777',
      'global_tax_override': 1,
      'type': 'regular',
      'related_invoice_id': 'rel-888',
      'origin_invoice_id': 'origin-999',
      'refund_reason_policy': 'restockOriginalBom',
      'refund_reason_code': 'R-1',
      'authorized_by_user_id': 'manager-preserve',
      'authorized_by_role': 'manager',
      'terminal_id': 'term-preserve',
      'source_sequence': 42,
      'idempotency_key': 'sale:term-preserve:row-preservation-1',
      'payload_hash': 'hash-preserve',
      'inventory_policy_version': 'SALE_TIME_V1',
      'inventory_outcome': 'APPLIED_INVENTORY_APPLIED',
      'inventory_outcome_reason': 'frozen-sale',
      'bcn_official_rate': 40.1234,
      'commercial_rate': 38.9876,
      'total_usd': 3.21,
      'shift_id': 'shift-preserve',
      'local_issue_date': '2026-09-23',
      'fiscal_header_snapshot': '{"businessName":"Café Original"}',
    };

    late AppDatabase preservationDatabase;
    late SalesRepositoryImpl preservationRepository;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      preservationDatabase =
          await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

      // shift_id is a real FK target: seed the session so the row is valid
      // regardless of PRAGMA foreign_keys.
      await preservationDatabase.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-preserve',
          userId: 'cashier-preserve',
          terminalId: 'term-preserve',
          openedAt: 1700000000000,
          isClosed: false,
        ),
      );

      final db = preservationDatabase.database;
      await db.insert('invoices', seededRow);

      final mockAuditRepository = MockAuditRepository();
      when(
        mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
      ).thenAnswer((_) async => null);
      when(
        mockReverseInventoryUseCase.execute(any, any),
      ).thenAnswer((_) async => []);

      preservationRepository = SalesRepositoryImpl(
        database: preservationDatabase,
        invoiceDao: preservationDatabase.invoiceDao,
        itemDao: preservationDatabase.invoiceItemDao,
        paymentDao: preservationDatabase.paymentDao,
        transactionDao: preservationDatabase.salesTransactionDao,
        numberingService: mockNumberingService,
        movementEngine: mockMovementEngine,
        auditRepository: mockAuditRepository,
        processInventoryUseCase: mockProcessInventoryUseCase,
        reverseInventoryUseCase: mockReverseInventoryUseCase,
        inventoryRepository: mockInventoryRepository,
      );
    });

    tearDown(() async {
      await preservationDatabase.close();
    });

    Future<Map<String, Object?>?> readRow() async {
      final rows = await preservationDatabase.database.query(
        'invoices',
        where: 'id = ?',
        whereArgs: [seededRow['id']],
      );
      return rows.isEmpty ? null : rows.first;
    }

    Future<Set<String>> schemaColumns() async {
      final info = await preservationDatabase.database
          .rawQuery('PRAGMA table_info(invoices)');
      return info.map((row) => row['name'] as String).toSet();
    }

    /// Compares every column the operation is not allowed to change and
    /// reports ALL offenders at once, naming each fabricated column.
    void expectColumnsPreserved(
      Map<String, Object?> before,
      Map<String, Object?>? after,
      Set<String> allowedToChange,
    ) {
      expect(after, isNotNull);
      final mismatches = <String>[];
      for (final column in seededRow.keys.toSet().difference(allowedToChange)) {
        if (after![column] != before[column]) {
          mismatches.add(
            '$column: ${before[column]} -> ${after[column]}',
          );
        }
      }
      expect(
        mismatches,
        isEmpty,
        reason: 'invoice rewrite fabricated/lost column data (#548)',
      );
    }

    test('tripwire: seeded column list matches the live invoices schema',
        () async {
      expect(await schemaColumns(), seededRow.keys.toSet());
    });

    test('voidInvoice preserves all 31 columns it must not change', () async {
      final before = (await readRow())!;

      await preservationRepository.voidInvoice(
        seededRow['id']! as String,
        'Cambio de posición del pedido',
      );

      final after = await readRow();
      // Void semantics itself must still hold.
      expect(after!['is_canceled'], 1);
      expect(after['void_reason'], 'Cambio de posición del pedido');
      expect(after['sync_status'], 'pending');
      expectColumnsPreserved(before, after, {
        'is_canceled',
        'void_reason',
        'sync_status',
      });
    });

    test('markAsFailed preserves all 31 columns it must not change',
        () async {
      final before = (await readRow())!;

      await preservationRepository.markAsFailed(
        seededRow['id']! as String,
      );

      final after = await readRow();
      expect(after!['sync_status'], 'failed');
      expect(after['is_canceled'], 0);
      expect(after['void_reason'], 'seed-void-reason');
      expectColumnsPreserved(before, after, {'sync_status'});
    });
  });
}
