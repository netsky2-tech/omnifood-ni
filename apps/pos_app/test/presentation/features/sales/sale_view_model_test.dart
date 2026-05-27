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

  test('openSession persists CARTERA_MESERO model', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Waiter',
        role: UserRole.waiter,
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

  test('finalizeSale in CARTERA_MESERO tracks only cash expected', () async {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Waiter',
        role: UserRole.waiter,
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

    await viewModel.finalizeSale([PaymentMethod.cash, PaymentMethod.card]);

    expect(viewModel.sessionExpected[PaymentMethod.cash], greaterThan(100));
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
}
