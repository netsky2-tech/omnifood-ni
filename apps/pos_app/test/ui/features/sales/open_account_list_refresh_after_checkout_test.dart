// K1 (open-accounts follow-up from device verification): billing a recalled
// account must remove it from the operator's open-accounts list immediately.
//
// On hardware the operator recalled "Cuenta A", charged it, and the account
// was STILL listed as open afterwards. The DB row is correctly deleted by
// `liquidateOrder` in the checkout path, but the in-memory `_holdTickets`
// list — the one the recall dialog renders — is never refreshed there. The
// stale entry invites a second checkout of an account that no longer exists
// (double billing), which is exactly the money risk this slice is closing.
//
// Uses the checked-in generated mocks from multi_currency_checkout_e2e_test
// (same wiring as restaurant_flow_e2e_test.dart).
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

import 'multi_currency_checkout_e2e_test.mocks.dart';

void main() {
  late AppDatabase database;
  late MockAuditRepository mockAuditRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockProcessSaleInventoryUseCase mockProcessUseCase;
  late MockReverseSaleInventoryUseCase mockReverseUseCase;
  late MockSalesTransactionDao mockTransactionDao;
  late MockDgiNumberingService mockNumberingService;
  late MockMovementEngine mockMovementEngine;
  late MockAuthRepository mockAuthRepo;
  late TableOrderService tableOrderService;
  late SaleViewModel saleViewModel;

  const Product espresso = Product(
    id: 'prod-espresso',
    sku: 'ESP-01',
    name: 'Espresso Doble',
    uom: 'UND',
    stock: 50,
    averageCost: 20.0,
    sellPrice: 80.0,
    taxRate: 0.15,
  );

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );

    final now = DateTime.now().millisecondsSinceEpoch;
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-k1-1',
        userId: 'u-cashier-k1',
        terminalId: 'POS-K1-01',
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 2000.0,
        openingBalanceUsd: 50.0,
        isClosed: false,
        syncStatus: 'synced',
      ),
    );

    mockAuditRepo = MockAuditRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockProcessUseCase = MockProcessSaleInventoryUseCase();
    mockReverseUseCase = MockReverseSaleInventoryUseCase();
    mockTransactionDao = MockSalesTransactionDao();
    mockNumberingService = MockDgiNumberingService();
    mockMovementEngine = MockMovementEngine();
    mockAuthRepo = MockAuthRepository();

    when(mockAuditRepo.log(any)).thenAnswer((_) async {});
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getProductById(any)).thenAnswer((_) async => null);
    when(mockProcessUseCase.execute(any)).thenAnswer((_) async => []);

    var seq = 1;
    when(mockNumberingService.getNextNumber()).thenAnswer(
      (_) async => '001-001-01-${(seq++).toString().padLeft(8, '0')}',
    );
    when(mockTransactionDao.getNextInvoiceSourceSequence(any))
        .thenAnswer((_) async => seq);

    when(mockTransactionDao
            .executeSaleWithDgiTransaction(any, any, any, any, any, any, any, any))
        .thenAnswer((invocation) async {
      final inv = invocation.positionalArguments[0] as InvoiceEntity;
      final items = invocation.positionalArguments[1] as List<InvoiceItemEntity>;
      final payments = invocation.positionalArguments[3] as List<PaymentEntity>;
      await database.invoiceDao.insertInvoice(inv);
      await database.invoiceItemDao.insertItems(items);
      await database.paymentDao.insertPayments(payments);
    });

    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-cashier-k1',
        name: 'Maxwell Orozco',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    tableOrderService = TableOrderService(database);

    saleViewModel = SaleViewModel(
      SalesRepositoryImpl(
        database: database,
        invoiceDao: database.invoiceDao,
        itemDao: database.invoiceItemDao,
        paymentDao: database.paymentDao,
        transactionDao: mockTransactionDao,
        numberingService: mockNumberingService,
        movementEngine: mockMovementEngine,
        auditRepository: mockAuditRepo,
        processInventoryUseCase: mockProcessUseCase,
        reverseInventoryUseCase: mockReverseUseCase,
        inventoryRepository: mockInventoryRepo,
      ),
      mockInventoryRepo,
      mockAuthRepo,
      database,
      tableOrderService,
      false,
    );
    saleViewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
    await saleViewModel.loadHoldTickets();
  });

  tearDown(() async {
    saleViewModel.dispose();
    await database.close();
  });

  test('billing a recalled account removes it from the open-accounts list',
      () async {
    // Park "Cuenta A", then recall it exactly as the operator does on device.
    saleViewModel.addToCart(espresso);
    await saleViewModel.holdCurrentTicket('Cuenta A');
    expect(saleViewModel.holdTickets, hasLength(1));

    await saleViewModel.recallTicket(saleViewModel.holdTickets.single);
    expect(saleViewModel.activeLoadedHoldTicket, isNotNull);
    expect(saleViewModel.holdTickets, hasLength(1),
        reason: 'the account is still open while it sits in the cart');

    // Charge it.
    await saleViewModel.processSale([PaymentMethod.cash]);

    // The sale committed and the account row is gone from SQLite...
    final invoices = await database.invoiceDao.getAllInvoices();
    expect(invoices, hasLength(1), reason: 'the checkout must have issued one invoice');
    expect(await database.holdTicketDao.getAllHoldTickets(), isEmpty,
        reason: 'liquidateOrder already deleted the account from the DB');

    // ...so the list the operator sees must agree with the DB.
    expect(saleViewModel.holdTickets, isEmpty,
        reason: 'a billed account must not stay listed as open: the operator '
            'would recall and re-charge an account that no longer exists');
  });
}
