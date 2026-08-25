import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/sales/currency_checkout_calculator.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/data/daos/sales/sales_transaction_dao.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'multi_currency_checkout_e2e_test.mocks.dart';

@GenerateMocks([
  AuditRepository,
  InventoryRepository,
  ProcessSaleInventoryUseCase,
  ReverseSaleInventoryUseCase,
  SalesTransactionDao,
  DgiNumberingService,
  MovementEngine,
  AuthRepository,
])
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
  late SalesRepositoryImpl salesRepository;
  late SaleViewModel saleViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // 1. Seed Initial Exchange Rates in SQLite
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
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
    when(mockNumberingService.isRangeExhausted()).thenAnswer((_) async => false);
    var seq = 1;
    when(mockNumberingService.getNextNumber()).thenAnswer(
      (_) async => '001-001-01-${(seq++).toString().padLeft(8, '0')}',
    );
    when(mockTransactionDao.getNextInvoiceSourceSequence(any))
        .thenAnswer((_) async => seq);

    // Transaction DAO executes and persists real entities in SQLite
    when(mockTransactionDao.executeSaleTransaction(any, any, any, any, any, any, any))
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
        id: 'u-cashier-1',
        name: 'Carlos Cajero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );

    salesRepository = SalesRepositoryImpl(
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
    );

    saleViewModel = SaleViewModel(
      salesRepository,
      mockInventoryRepo,
      mockAuthRepo,
      database,
    );

    await saleViewModel.loadExchangeRates();
    // Allow async constructor fires to finish
    await Future.delayed(const Duration(milliseconds: 50));
  });

  tearDown(() async {
    await database.close();
  });

  group('Multi-Currency Checkout E2E Integration Suite', () {
    test('Scenario 1: Tender in NIO, cash change in NIO, and net cash drawer tracking', () async {
      // 1. Add product to cart: C$ 350.00 NIO (tax exempt for round amount check)
      saleViewModel.toggleGlobalTaxExempt();
      saleViewModel.addToCart(
        const Product(
          id: 'prod-cafe',
          name: 'Café Grano 1lb',
          uom: 'UND',
          stock: 10,
          averageCost: 200.0,
          sellPrice: 350.00,
          category: 'Bebidas',
        ),
      );
      expect(saleViewModel.total, 350.00);

      // 2. Calculator generates breakdown for C$ 500 NIO tendered
      final calc = CurrencyCheckoutCalculator(
        commercialRate: saleViewModel.commercialRate,
        bcnOfficialRate: saleViewModel.bcnOfficialRate,
      );
      final breakdown = calc.calculateTender(
        totalNio: 350.00,
        tenderAmount: 500.00,
        tenderCurrency: 'NIO',
        changeCurrencyPreference: 'NIO',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.changeNio, 150.00);

      final payment = Payment(
        id: 'pay-001',
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: breakdown.tenderAmount,
        currency: breakdown.tenderCurrency,
        exchangeRate: saleViewModel.commercialRate,
        amountNio: breakdown.tenderAmountNio,
        changeGiven: breakdown.effectiveChange,
        changeCurrency: breakdown.changeCurrency,
        createdAt: DateTime.now(),
      );

      // 3. Process Sale
      await saleViewModel.processSale([PaymentMethod.cash], customPayments: [payment]);

      // 4. Verify Invoice & Payment in SQLite
      final invoices = await database.invoiceDao.getAllInvoices();
      expect(invoices.length, 1);
      final inv = invoices.first;
      expect(inv.total, 350.00);
      expect(inv.commercialRate, 36.50);
      expect(inv.bcnOfficialRate, 36.6241);
      expect(inv.totalUsd, 9.59); // 350 / 36.50 = 9.589 -> 9.59

      final payments = await database.paymentDao.getPaymentsByInvoiceId(inv.id);
      expect(payments.length, 1);
      final pay = payments.first;
      expect(pay.method, 'cash');
      expect(pay.amount, 500.00);
      expect(pay.currency, 'NIO');
      expect(pay.amountNio, 500.00);
      expect(pay.changeGiven, 150.00);
      expect(pay.changeCurrency, 'NIO');

      // 5. Verify Cash drawer expected accumulation = Net Cash Received (500 - 150 = C$ 350)
      expect(saleViewModel.sessionExpected[PaymentMethod.cash], 350.00);
    });

    test('Scenario 2: Tender in USD (\$20 bill), change given in NIO, correct FX snapshot', () async {
      // 1. Add products to cart: C$ 500.00 NIO
      saleViewModel.toggleGlobalTaxExempt();
      saleViewModel.addToCart(
        const Product(
          id: 'prod-desayuno',
          name: 'Desayuno Típico',
          uom: 'UND',
          stock: 20,
          averageCost: 100.0,
          sellPrice: 250.00,
          category: 'Comida',
        ),
      );
      saleViewModel.addToCart(
        const Product(
          id: 'prod-desayuno',
          name: 'Desayuno Típico',
          uom: 'UND',
          stock: 20,
          averageCost: 100.0,
          sellPrice: 250.00,
          category: 'Comida',
        ),
      );
      expect(saleViewModel.total, 500.00);

      // 2. Customer pays with a \$20 USD bill ($20 * 36.50 = C$ 730 NIO)
      // Change in NIO = 730 - 500 = C$ 230 NIO
      final calc = CurrencyCheckoutCalculator(
        commercialRate: saleViewModel.commercialRate,
        bcnOfficialRate: saleViewModel.bcnOfficialRate,
      );
      final breakdown = calc.calculateTender(
        totalNio: 500.00,
        tenderAmount: 20.00,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'NIO',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.tenderAmountNio, 730.00);
      expect(breakdown.changeNio, 230.00);
      expect(breakdown.effectiveChange, 230.00);
      expect(breakdown.changeCurrency, 'NIO');

      final payment = Payment(
        id: 'pay-usd-01',
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: breakdown.tenderAmount,
        currency: breakdown.tenderCurrency,
        exchangeRate: saleViewModel.commercialRate,
        amountNio: breakdown.tenderAmountNio,
        changeGiven: breakdown.effectiveChange,
        changeCurrency: breakdown.changeCurrency,
        createdAt: DateTime.now(),
      );

      // 3. Process Sale
      await saleViewModel.processSale([PaymentMethod.cash], customPayments: [payment]);

      // 4. Verify in DB
      final invoices = await database.invoiceDao.getAllInvoices();
      final inv = invoices.last;
      expect(inv.total, 500.00);
      expect(inv.commercialRate, 36.50);
      expect(inv.bcnOfficialRate, 36.6241);
      expect(inv.totalUsd, 13.70); // 500 / 36.50 = 13.698 -> 13.70

      final payments = await database.paymentDao.getPaymentsByInvoiceId(inv.id);
      final pay = payments.first;
      expect(pay.method, 'cash');
      expect(pay.amount, 20.00);
      expect(pay.currency, 'USD');
      expect(pay.exchangeRate, 36.50);
      expect(pay.amountNio, 730.00);
      expect(pay.changeGiven, 230.00);
      expect(pay.changeCurrency, 'NIO');

      // Net cash added to drawer = 730 - 230 = C$ 500.00
      expect(saleViewModel.sessionExpected[PaymentMethod.cash], 500.00);
    });

    test('Scenario 3: Tender in USD (\$50 bill) with change given in USD (\$30 USD)', () async {
      // 1. Total C$ 730.00 NIO ($20.00 USD)
      saleViewModel.toggleGlobalTaxExempt();
      saleViewModel.addToCart(
        const Product(
          id: 'prod-cena',
          name: 'Cena Gourmet',
          uom: 'UND',
          stock: 10,
          averageCost: 400.0,
          sellPrice: 730.00,
          category: 'Comida',
        ),
      );
      expect(saleViewModel.total, 730.00);

      // 2. Customer pays $50 USD and requests change in USD
      final calc = CurrencyCheckoutCalculator(
        commercialRate: saleViewModel.commercialRate,
        bcnOfficialRate: saleViewModel.bcnOfficialRate,
      );
      final breakdown = calc.calculateTender(
        totalNio: 730.00,
        tenderAmount: 50.00,
        tenderCurrency: 'USD',
        changeCurrencyPreference: 'USD',
      );

      expect(breakdown.isSufficient, isTrue);
      expect(breakdown.tenderAmountNio, 1825.00); // 50 * 36.50
      expect(breakdown.changeUsd, 30.00); // (1825 - 730) / 36.50 = 1095 / 36.50 = $30.00
      expect(breakdown.effectiveChange, 30.00);
      expect(breakdown.changeCurrency, 'USD');

      final payment = Payment(
        id: 'pay-usd-change-usd',
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: breakdown.tenderAmount,
        currency: breakdown.tenderCurrency,
        exchangeRate: saleViewModel.commercialRate,
        amountNio: breakdown.tenderAmountNio,
        changeGiven: breakdown.effectiveChange,
        changeCurrency: breakdown.changeCurrency,
        createdAt: DateTime.now(),
      );

      await saleViewModel.processSale([PaymentMethod.cash], customPayments: [payment]);

      final invoices = await database.invoiceDao.getAllInvoices();
      final inv = invoices.last;
      expect(inv.total, 730.00);
      expect(inv.totalUsd, 20.00);

      final payments = await database.paymentDao.getPaymentsByInvoiceId(inv.id);
      final pay = payments.first;
      expect(pay.amount, 50.00);
      expect(pay.currency, 'USD');
      expect(pay.changeGiven, 30.00);
      expect(pay.changeCurrency, 'USD');
    });

    test('Scenario 4: Electronic card payment in NIO does not affect cash drawer expected', () async {
      saleViewModel.toggleGlobalTaxExempt();
      saleViewModel.addToCart(
        const Product(
          id: 'prod-card',
          name: 'Smoothie Frutos Rojos',
          uom: 'UND',
          stock: 15,
          averageCost: 80.0,
          sellPrice: 180.00,
          category: 'Bebidas',
        ),
      );

      await saleViewModel.processSale([PaymentMethod.card]);

      final invoices = await database.invoiceDao.getAllInvoices();
      final inv = invoices.last;
      expect(inv.total, 180.00);

      final payments = await database.paymentDao.getPaymentsByInvoiceId(inv.id);
      final pay = payments.first;
      expect(pay.method, 'card');
      expect(pay.amount, 180.00);
      expect(pay.currency, 'NIO');
      expect(pay.changeGiven, 0.0);

      // Card expected updated, Cash expected remains 0
      expect(saleViewModel.sessionExpected[PaymentMethod.card], 180.00);
      expect(saleViewModel.sessionExpected[PaymentMethod.cash], 0.00);
    });

    test('Scenario 5: Fiscal Immutability: changing exchange rate later does not mutate historical invoice', () async {
      // 1. Create invoice with original commercial rate = 36.50
      saleViewModel.toggleGlobalTaxExempt();
      saleViewModel.addToCart(
        const Product(
          id: 'prod-immutable',
          name: 'Almuerzo Ejecutivo',
          uom: 'UND',
          stock: 20,
          averageCost: 150.0,
          sellPrice: 365.00,
          category: 'Comida',
        ),
      );
      await saleViewModel.processSale([PaymentMethod.cash]);

      final invoicesBefore = await database.invoiceDao.getAllInvoices();
      final originalInvoice = invoicesBefore.first;
      expect(originalInvoice.commercialRate, 36.50);
      expect(originalInvoice.bcnOfficialRate, 36.6241);
      expect(originalInvoice.totalUsd, 10.00);

      // 2. Merchant changes commercial exchange rate to 37.00 and BCN to 36.80
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '37.00'),
      );
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.80'),
      );

      // Reload rates in ViewModel
      await saleViewModel.loadExchangeRates();
      expect(saleViewModel.commercialRate, 37.00);
      expect(saleViewModel.bcnOfficialRate, 36.80);

      // 3. Check historical invoice from database — must NOT be affected!
      final reloadedInvoice = await database.invoiceDao.getInvoiceById(originalInvoice.id);
      expect(reloadedInvoice, isNotNull);
      expect(reloadedInvoice!.commercialRate, 36.50);
      expect(reloadedInvoice.bcnOfficialRate, 36.6241);
      expect(reloadedInvoice.totalUsd, 10.00);
    });
  });
}
