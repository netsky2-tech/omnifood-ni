import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'sale_view_model_test.mocks.dart';
import 'package:mockito/annotations.dart';

@GenerateMocks([
  SalesRepository,
  InventoryRepository,
  AuthRepository,
  AppDatabase,
  CashierSessionDao,
  HoldTicketDao,
  PromotionDao,
])
void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockCashierSessionDao mockSessionDao;
  late MockHoldTicketDao mockHoldDao;
  late MockPromotionDao mockPromoDao;
  late SaleViewModel viewModel;

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockSessionDao = MockCashierSessionDao();
    mockHoldDao = MockHoldTicketDao();
    mockPromoDao = MockPromotionDao();

    when(mockDb.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDb.holdTicketDao).thenReturn(mockHoldDao);
    when(mockDb.promotionDao).thenReturn(mockPromoDao);
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => null);

    // Initial loads
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockSessionDao.getActiveSession()).thenAnswer((_) async => null);
    when(mockHoldDao.getAllHoldTickets()).thenAnswer((_) async => []);
    when(mockPromoDao.getActivePromotions()).thenAnswer((_) async => []);

    viewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
    );
  });

  test('Initial state should be empty', () {
    expect(viewModel.cart, isEmpty);
    expect(viewModel.total, 0.0);
    expect(viewModel.activeSession, isNull);
  });

  test('openSession persists CARTERA_MESERO model for cashier role', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});

    await viewModel.openSession(
      200,
      tipoModelo: CashSessionModel.carteraMesero,
    );

    final captured = verify(mockSessionDao.insertSession(captureAny)).captured.single as CashierSessionEntity;
    expect(captured.tipoModelo, 'CARTERA_MESERO');
  });

  test('openSession denies waiter role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );

    await viewModel.openSession(200, tipoModelo: CashSessionModel.carteraMesero);

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSessionDao.insertSession(any));
  });

  test('finalizeSale in CARTERA_MESERO tracks only cash expected', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});
    when(mockSalesRepo.saveSale(invoice: anyNamed('invoice'), items: anyNamed('items'), payments: anyNamed('payments')))
        .thenAnswer((_) async {});

    await viewModel.openSession(100, tipoModelo: CashSessionModel.carteraMesero);
    viewModel.addToCart(
      Product(
        id: 'p1',
        sku: 'SKU-1',
        name: 'Prod',
        uom: 'unit',
        sellPrice: 100,
        stock: 10,
        averageCost: 10,
      ),
    );

    final totalBeforeFinalize = viewModel.total;

    await viewModel.finalizeSale([PaymentMethod.cash, PaymentMethod.card]);

    expect(
      viewModel.sessionExpected[PaymentMethod.cash],
      closeTo(100 + (totalBeforeFinalize / 2), 0.0001),
    );
    expect(viewModel.sessionExpected[PaymentMethod.card], 0.0);
  });

  test('finalizeSale in CAJA_CENTRAL tracks cash and card expected totals', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});
    when(mockSalesRepo.saveSale(invoice: anyNamed('invoice'), items: anyNamed('items'), payments: anyNamed('payments')))
        .thenAnswer((_) async {});

    await viewModel.openSession(100, tipoModelo: CashSessionModel.cajaCentral);
    viewModel.addToCart(
      Product(
        id: 'p1',
        sku: 'SKU-1',
        name: 'Prod',
        uom: 'unit',
        sellPrice: 100,
        stock: 10,
        averageCost: 10,
      ),
    );

    await viewModel.finalizeSale([PaymentMethod.cash, PaymentMethod.card]);

    expect(viewModel.sessionExpected[PaymentMethod.cash], greaterThan(100));
    expect(viewModel.sessionExpected[PaymentMethod.card], greaterThan(0));
  });

  test('processReturn denies cashier role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    await viewModel.processReturn('INV-001', 'Error de cobro');

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSalesRepo.getInvoiceByNumber(any));
  });

  test('voidInvoice denies cashier role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Cashier',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    await viewModel.voidInvoice('invoice-1', 'anulacion');

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSalesRepo.voidInvoice(any, any));
  });

  test('voidInvoice denies waiter role with generic message', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-2',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );

    await viewModel.voidInvoice('invoice-2', 'anulacion');

    expect(viewModel.errorMessage, 'Acceso denegado.');
    verifyNever(mockSalesRepo.voidInvoice(any, any));
  });

  test('voidInvoice allows manager role and calls repository', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-3',
        name: 'Manager',
        role: UserRole.manager,
        isActive: true,
      ),
    );
    when(mockSalesRepo.voidInvoice('invoice-3', 'anulacion manager'))
        .thenAnswer((_) async {});

    await viewModel.voidInvoice('invoice-3', 'anulacion manager');

    verify(mockSalesRepo.voidInvoice('invoice-3', 'anulacion manager')).called(1);
    expect(viewModel.errorMessage, isNull);
  });

  test('canManageCashDrawer is false for waiter role', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-2',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );

    final waiterViewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
    );
    await Future<void>.delayed(Duration.zero);

    expect(waiterViewModel.canManageCashDrawer, isFalse);
  });

  group('Supervisor Override', () {
    test('isSupervisorOverrideActive is initially false', () {
      expect(viewModel.isSupervisorOverrideActive, isFalse);
    });

    test('grantSupervisorOverride sets state to true', () {
      viewModel.grantSupervisorOverride();
      expect(viewModel.isSupervisorOverrideActive, isTrue);
    });

    test('applyManualDiscount denies cashier without override', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );

      final cashierViewModel = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
      );
      await Future<void>.delayed(Duration.zero);

      cashierViewModel.applyManualDiscount(10.0);

      expect(cashierViewModel.errorMessage, 'Acceso denegado.');
      expect(cashierViewModel.totalDiscounts, 0.0);
    });

    test('applyManualDiscount allows cashier with override', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );

      final cashierViewModel = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
      );
      await Future<void>.delayed(Duration.zero);

      cashierViewModel.grantSupervisorOverride();
      cashierViewModel.applyManualDiscount(10.0);

      expect(cashierViewModel.errorMessage, isNull);
      expect(cashierViewModel.totalDiscounts, 10.0);
    });

    test('override is consumed after finalizeSale and requires re-authorization for next restricted action', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});
      when(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).thenAnswer((_) async {});

      final cashierViewModel = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
      );
      await Future<void>.delayed(Duration.zero);

      await cashierViewModel.openSession(100, tipoModelo: CashSessionModel.cajaCentral);
      cashierViewModel.addToCart(
        Product(
          id: 'p1',
          sku: 'SKU-1',
          name: 'Prod',
          uom: 'unit',
          sellPrice: 100,
          stock: 10,
          averageCost: 10,
        ),
      );

      cashierViewModel.grantSupervisorOverride();
      cashierViewModel.applyManualDiscount(10.0);
      expect(cashierViewModel.totalDiscounts, 10.0);
      expect(cashierViewModel.isSupervisorOverrideActive, isTrue);

      await cashierViewModel.finalizeSale([PaymentMethod.cash]);
      expect(cashierViewModel.isSupervisorOverrideActive, isFalse);

      cashierViewModel.applyManualDiscount(5.0);
      expect(cashierViewModel.errorMessage, 'Acceso denegado.');
      expect(cashierViewModel.totalDiscounts, 0.0);
    });
  });
}
