import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/daos/sales/sales_transaction_dao.dart';
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
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/domain/models/audit_log.dart';

import 'sales_repository_impl_test.mocks.dart';

@GenerateMocks([
  AppDatabase,
  InvoiceDao,
  InvoiceItemDao,
  PaymentDao,
  SalesTransactionDao,
  DgiNumberingService,
  MovementEngine,
  AuditRepository,
  ProcessSaleInventoryUseCase,
  ReverseSaleInventoryUseCase,
  InventoryRepository,
])
void main() {
  late SalesRepositoryImpl repository;
  late MockAppDatabase mockDatabase;
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

  setUp(() {
    mockDatabase = MockAppDatabase();
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
      await repository.saveSale(
        invoice: invoice,
        items: items,
        payments: payments,
      );

      // Assert
      verify(mockProcessInventoryUseCase.execute(any)).called(1);
      verify(
        mockTransactionDao.executeSaleTransaction(
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
        when(
          mockReverseInventoryUseCase.execute(any, any),
        ).thenThrow(
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
          mockTransactionDao.executeVoidTransaction(any, any, any, any),
        );
        // The invoice must NOT have been persisted as canceled.
        verifyNever(
          mockInvoiceDao.updateInvoice(
            argThat(
              predicate<InvoiceEntity>((e) => e.isCanceled),
            ),
          ),
        );
        // No audit log for a voided sale should be written on failure.
        verifyNever(
          mockAuditRepository.log('SALE_VOIDED', metadata: anyNamed('metadata')),
        );
        // No pre-built audit entry either, since the reversal threw first.
        verifyNever(
          mockAuditRepository.prepareLog(any, metadata: anyNamed('metadata')),
        );
      },
    );

    test('delegates cancellation, reversal and audit to a single atomic @transaction when reversal succeeds', () async {
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
        metadata: '{"invoice_id": "inv-void-ok", "reason": "voided by manager"}',
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
        mockTransactionDao.executeVoidTransaction(any, any, any, any),
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
        ),
      ).captured;
      expect(captured.length, 4);
      final movements = captured[0] as List;
      expect(movements, isEmpty); // no BOM on this line
      final canceled = captured[1] as InvoiceEntity;
      expect(canceled.id, 'inv-void-ok');
      expect(canceled.isCanceled, isTrue);
      final audit = captured[2] as AuditLogEntity;
      expect(audit.action, 'SALE_VOIDED');
      expect(audit.entryHash, 'hash-7');
      expect(audit.remoteRefUuid, isNotEmpty); // mapped to a fresh entity
      expect(captured[3] as bool, isFalse); // production never forces a failure

      // The repo must NOT perform any separate, non-atomic writes: it
      // delegates everything to the @transaction. A direct invoiceDao /
      // auditRepository.log call would split the unit and re-open the
      // partial-state blocker.
      verifyNever(mockInvoiceDao.updateInvoice(any));
      verifyNever(
        mockAuditRepository.log(any, metadata: anyNamed('metadata')),
      );
    });

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
          mockTransactionDao.executeVoidTransaction(any, any, any, any),
        ).thenThrow(StateError('simulated insumo stock update failure'));

        await expectLater(
          repository.voidInvoice('inv-void-fail', 'manager void'),
          throwsA(isA<StateError>()),
        );

        // The atomic wrapper was the ONLY write path attempted.
        verify(
          mockTransactionDao.executeVoidTransaction(any, any, any, any),
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
}
