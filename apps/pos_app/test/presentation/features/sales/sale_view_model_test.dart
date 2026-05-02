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
}
