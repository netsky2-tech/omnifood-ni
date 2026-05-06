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
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';

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
    );
  });

  test('should use ProcessSaleInventoryUseCase to calculate movements and execute transaction', () async {
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

    when(mockNumberingService.isRangeExhausted()).thenAnswer((_) async => false);
    when(mockNumberingService.getNextNumber()).thenAnswer((_) async => '001');
    when(mockProcessInventoryUseCase.execute(any)).thenAnswer((_) async => movements);
    when(mockTransactionDao.executeSaleTransaction(any, any, any, any, any)).thenAnswer((_) async {});
    when(mockNumberingService.incrementNumber()).thenAnswer((_) async {});
    when(mockAuditRepository.log(any, metadata: anyNamed('metadata'))).thenAnswer((_) async {});

    // Act
    await repository.saveSale(
      invoice: invoice,
      items: items,
      payments: payments,
    );

    // Assert
    verify(mockProcessInventoryUseCase.execute(items)).called(1);
    verify(mockTransactionDao.executeSaleTransaction(
      any,
      any,
      any,
      any,
      argThat(predicate((List list) => list.length == 1)), // Verify movements are passed
    )).called(1);
  });
}
