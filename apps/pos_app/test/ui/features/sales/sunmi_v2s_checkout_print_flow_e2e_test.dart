import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sunmi_v2s_checkout_print_flow_e2e_test.mocks.dart';

@GenerateNiceMocks([
  MockSpec<SalesRepository>(),
  MockSpec<InventoryRepository>(),
  MockSpec<AuthRepository>(),
  MockSpec<AppDatabase>(),
  MockSpec<PrinterConfigService>(),
  MockSpec<InvoiceItemDao>(),
  MockSpec<PaymentDao>(),
])
void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockPrinterConfigService mockConfigService;
  late MockPrinterAdapter mockPrinter;
  late SaleViewModel viewModel;

  final currentUser = const User(
    id: 'cashier-v2s',
    name: 'Cajero Sunmi',
    role: UserRole.cashier,
    isActive: true,
  );

  final activeSession = CashierSession(
    id: 'session-sunmi-1',
    userId: 'cashier-v2s',
    openedAt: DateTime(2026, 8, 26, 8, 0),
    tipoModelo: CashSessionModel.cajaCentral,
    openingBalance: 500,
    openingBalanceNio: 500,
  );

  final testProduct = const Product(
    id: 'prod-burger',
    name: 'Hamburguesa Especial',
    sellPrice: 150.0,
    averageCost: 60.0,
    uom: 'Unidad',
    stock: 50.0,
    sku: 'HMB-01',
    category: 'Comida',
  );

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockConfigService = MockPrinterConfigService();
    mockPrinter = MockPrinterAdapter();

    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => currentUser);
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => [testProduct]);
    when(mockConfigService.getPrinterConfig()).thenAnswer(
      (_) async => const PrinterConfig(
        driverType: PrinterDriverType.sunmiV2s,
        autoPrintInvoice: true,
        autoPrintKitchen: true,
        openDrawerOnCash: true,
        headerBusinessName: 'OMNIFOOD SUNMI E2E',
        headerRuc: 'J0310000000001',
      ),
    );

    // Save sale mock behaviour
    when(mockSalesRepo.saveSale(
      invoice: anyNamed('invoice'),
      items: anyNamed('items'),
      payments: anyNamed('payments'),
    )).thenAnswer((_) async {});

    when(mockSalesRepo.getInvoiceById(any)).thenAnswer((inv) {
      final id = inv.positionalArguments.first as String;
      return Future.value(
        Invoice(
          id: id,
          number: '001-001-01-00009999',
          createdAt: DateTime.now(),
          userId: 'cashier-v2s',
          subtotal: 130.43,
          totalTax: 19.57,
          total: 150.0,
        ),
      );
    });

    viewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      false, // disable autoLoad for explicit test state
      null,
      null,
      mockConfigService,
      mockPrinter,
    );
  });

  tearDown(() {
    viewModel.dispose();
  });

  Widget buildE2EApp() {
    return ChangeNotifierProvider<SaleViewModel>.value(
      value: viewModel,
      child: const MaterialApp(
        home: SaleView(),
      ),
    );
  }

  group('Sunmi V2s Checkout & Auto-Print Flow E2E Tests (Slice 7.4)', () {
    testWidgets('cash checkout on Sunmi V2s (360x720) saves sale, opens drawer and auto-prints DGI receipt', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      // Setup state
      viewModel.addToCart(testProduct);
      expect(viewModel.cart.length, 1);
      expect(viewModel.total, 172.5); // 150 + 15% IVA

      // Process sale with Cash
      await viewModel.processSale(
        [PaymentMethod.cash],
        buzzerNumber: '7',
        customerName: 'Cliente E2E',
      );

      // 1. Verify SQLite persistence called
      verify(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).called(1);

      // 2. Verify cash drawer kick executed
      expect(mockPrinter.cashDrawerKickCount, 1);

      // 3. Verify invoice printed
      expect(mockPrinter.printHistory.length, greaterThanOrEqualTo(1));
      final invoicePrint = mockPrinter.printHistory.firstWhere(
        (p) => p.printedText?.contains('OMNIFOOD SUNMI E2E') ?? false,
      );
      expect(invoicePrint.printedText, contains('001-001-01-00009999'));
      expect(invoicePrint.printedText, contains('Hamburguesa'));
      expect(invoicePrint.printedText, contains('REGIMEN: GENERAL'));

      // 4. Verify cart cleared
      expect(viewModel.cart, isEmpty);
      expect(viewModel.lastPrintError, isNull);
    });

    testWidgets('printer failure / out of paper does NOT block or abort SQLite sale transaction (Offline-First D1)', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      // Set printer out of paper
      mockPrinter.currentStatus = PrinterStatus.outOfPaper;

      viewModel.addToCart(testProduct);

      // Process sale
      await viewModel.processSale([PaymentMethod.cash]);

      // Verify sale is STILL saved in SQLite (accounting integrity preserved)
      verify(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).called(1);

      // Verify cart cleared
      expect(viewModel.cart, isEmpty);

      // Verify non-blocking error reported
      expect(viewModel.lastPrintError, isNotNull);
      expect(viewModel.lastPrintError, contains('papel'));
    });

    testWidgets('split checkout with card and cashUSD triggers multi-tender DGI print', (tester) async {
      viewModel.addToCart(testProduct);

      final splitPayments = [
        const Payment(
          id: 'pay-usd',
          invoiceId: '',
          method: PaymentMethod.cash,
          amount: 2.0,
          currency: 'USD',
          amountNio: 73.0,
          changeGiven: 0.0,
        ),
        const Payment(
          id: 'pay-card',
          invoiceId: '',
          method: PaymentMethod.card,
          amount: 99.5,
          bankPos: 'BAC',
          cardBrand: 'VISA',
          voucherCode: 'AUTH5544',
          last4: '9988',
        ),
      ];

      await viewModel.processSale(
        [PaymentMethod.cash, PaymentMethod.card],
        customPayments: splitPayments,
      );

      // Verify sale persisted
      verify(mockSalesRepo.saveSale(
        invoice: anyNamed('invoice'),
        items: anyNamed('items'),
        payments: anyNamed('payments'),
      )).called(1);

      // Verify print history reflects split payment
      final invoicePrint = mockPrinter.printHistory.firstWhere(
        (p) => p.printedText?.contains('OMNIFOOD SUNMI E2E') ?? false,
      );
      expect(invoicePrint.printedText, contains('Efectivo USD:'));
      expect(invoicePrint.printedText, contains('VISA (BAC):'));
      expect(invoicePrint.printedText, contains('AUTH5544'));
    });

    testWidgets('manual reprintLastInvoice sends ticket to printer', (tester) async {
      // Mock invoice items & payments DAO calls
      final mockItemDao = MockInvoiceItemDao();
      final mockPaymentDao = MockPaymentDao();
      when(mockDb.invoiceItemDao).thenReturn(mockItemDao);
      when(mockDb.paymentDao).thenReturn(mockPaymentDao);
      when(mockItemDao.getItemsByInvoiceId(any)).thenAnswer((_) async => []);
      when(mockPaymentDao.getPaymentsByInvoiceId(any)).thenAnswer((_) async => []);

      viewModel.addToCart(testProduct);
      await viewModel.processSale([PaymentMethod.cash]);

      mockPrinter.printHistory.clear();

      final reprintOk = await viewModel.reprintLastInvoice();
      expect(reprintOk, isTrue);
      expect(mockPrinter.printHistory.length, 1);
      expect(mockPrinter.lastPrintedText, contains('OMNIFOOD SUNMI E2E'));
    });
  });
}
