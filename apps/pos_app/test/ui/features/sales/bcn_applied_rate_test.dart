import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';

import '../../../presentation/features/sales/sale_view_model_test.mocks.dart';

/// T2b / #67: in BCN_OFFICIAL checkout mode the dialogs convert at
/// `vm.activeCheckoutRate` (the BCN rate) while the invoice persisted
/// `calc.commercialRate` (the configured commercial rate) and payments
/// wrote the configured commercial rate. The receipt prints
/// `invoice.commercialRate` as the exchange rate and `total_usd` is
/// derived from it, so in BCN mode the printed rate was not the charged
/// rate and the USD totals were wrong.
///
/// These tests pin the fix: the fiscal calculation is fed the APPLIED rate
/// (`activeCheckoutRate`), so `invoice.commercialRate`, `invoice.totalUsd`
/// and every persisted `Payment.exchangeRate` carry the conversion actually
/// charged, while `invoice.bcnOfficialRate` stays the BCN snapshot.
///
/// Discriminating values — deliberately different from the Invoice model
/// defaults (36.50 / 36.6241) and from each other: commercial 37.25, BCN
/// 36.80. An assertion on 36.80 in BCN mode can only hold if the applied
/// rate is really wired (a 37.25 leak means the commercial rate was
/// persisted instead), and the COMMERCIAL group can only hold if the
/// commercial rate is still wired when the mode is COMMERCIAL.
class FakeKitchenOrderService extends KitchenOrderService {
  FakeKitchenOrderService(super.database);

  @override
  Future<List<KitchenOrder>> sendDirectSaleToKitchen({
    required String invoiceId,
    required String invoiceNumber,
    required List<CartItem> items,
    String? buzzerNumber,
    String? customerName,
    String? waiterName,
    Map<String, String>? productCategories,
  }) async {
    return [];
  }
}

class FakeTenantConfigService extends TenantConfigService {
  FakeTenantConfigService(super.localConfigDao);

  @override
  Future<TenantConfig> getTenantConfig() async => const TenantConfig();

  @override
  Stream<TenantOperationMode> get onOperationModeChanged =>
      const Stream.empty();
}

class FakePrinterConfigService extends PrinterConfigService {
  FakePrinterConfigService(super.configDao);

  @override
  Future<PrinterConfig> getPrinterConfig() async => const PrinterConfig();

  @override
  Stream<PrinterConfig> get onConfigChanged => const Stream.empty();
}

extension _BcnReceiptFormat on ReceiptLayoutFormatter {
  String formatFor(Invoice invoice, {required List<Payment> payments}) {
    return formatReceiptDocumentText(
      ReceiptDocument.fromInvoice(
        invoice,
        items: const [],
        payments: payments,
        taxRegime: TaxRegime.regimenGeneral,
        isTaxExempt: true,
      ),
    );
  }
}

String _lineContaining(String text, String needle) {
  return text.split('\n').firstWhere((line) => line.contains(needle));
}

/// Taps [finder] and lets the real async work triggered by the submit run.
/// Copied from split_checkout_dialog_test.dart: the checkout submit path
/// performs real sqflite-ffi reads that do not progress under FakeAsync,
/// so the bounded wait must run inside `runAsync` (see that helper's full
/// rationale — do NOT simplify this into a bare tap + pumpAndSettle).
Future<void> tapAndSubmit(WidgetTester tester, Finder finder) async {
  await tester.runAsync(() async {
    await tester.tap(finder);
    await Future<void>.delayed(const Duration(milliseconds: 500));
  });
  await tester.pumpAndSettle();
}

void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late FakeKitchenOrderService fakeKitchenOrderService;
  late FakeTenantConfigService fakeTenantConfigService;
  late FakePrinterConfigService fakePrinterConfigService;
  late AppDatabase database;
  late SaleViewModel saleViewModel;

  Future<void> seedRates({required bool bcnMode}) async {
    // Non-default, mutually distinct values (Invoice defaults are
    // 36.50 / 36.6241 — seeding those could not tell correct wiring from a
    // default leaking through).
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: 'commercial_exchange_rate',
        value: '37.25',
      ),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.80'),
    );
    if (bcnMode) {
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'checkout_fx_mode', value: 'BCN_OFFICIAL'),
      );
    }
  }

  Future<void> buildViewModel() async {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    fakeKitchenOrderService = FakeKitchenOrderService(database);
    fakeTenantConfigService = FakeTenantConfigService(database.localConfigDao);
    fakePrinterConfigService = FakePrinterConfigService(database.localConfigDao);

    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Carlos Cajero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockInventoryRepo.getProductById(any)).thenAnswer((_) async => null);
    when(mockSalesRepo.saveSale(
      invoice: anyNamed('invoice'),
      items: anyNamed('items'),
      payments: anyNamed('payments'),
    )).thenAnswer((_) async {});

    saleViewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      database,
      null,
      false,
      fakeTenantConfigService,
      fakeKitchenOrderService,
      fakePrinterConfigService,
      MockPrinterAdapter(),
    );
    saleViewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);

    // Same resolution path production uses before the checkout dialog opens.
    await saleViewModel.loadExchangeRates();

    // Tax exempt for a clean C$ 1000.00 total.
    saleViewModel.toggleGlobalTaxExempt();
    saleViewModel.addToCart(
      const Product(
        id: 'p1',
        name: 'Plato Familiar',
        uom: 'UND',
        stock: 10,
        averageCost: 500,
        sellPrice: 1000.0,
      ),
    );
  }

  Widget createWidgetUnderTest() {
    return MaterialApp(
      home: ChangeNotifierProvider<SaleViewModel>.value(
        value: saleViewModel,
        child: const Scaffold(
          body: Center(
            child: SizedBox(
              width: 800,
              height: 900,
              child: MultiCurrencyCheckoutDialog(),
            ),
          ),
        ),
      ),
    );
  }

  (Invoice, List<Payment>) captureSavedSale() {
    final captured = verify(
      mockSalesRepo.saveSale(
        invoice: captureAnyNamed('invoice'),
        items: anyNamed('items'),
        payments: captureAnyNamed('payments'),
      ),
    ).captured;
    return (captured[0] as Invoice, captured[1] as List<Payment>);
  }

  void setUpViewport(WidgetTester tester) {
    tester.view.physicalSize = const Size(1024, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());
  }

  group('BCN_OFFICIAL mode — the persisted rate is the applied rate', () {
    setUp(() async {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      await seedRates(bcnMode: true);
      await buildViewModel();
    });

    tearDown(() async {
      saleViewModel.dispose();
      await database.close();
    });

    test(
      'default processSale persists the applied rate on the invoice and on every payment',
      () async {
        await saleViewModel.processSale([PaymentMethod.cash, PaymentMethod.card]);

        final (invoice, payments) = captureSavedSale();

        expect(invoice.total, 1000.0);
        // The conversion actually charged is the BCN rate — NOT the 37.25
        // commercial configuration.
        expect(invoice.commercialRate, 36.80);
        // The BCN configuration snapshot is preserved on its own column.
        expect(invoice.bcnOfficialRate, 36.80);
        // totalUsd follows the applied conversion: 1000 / 36.80 = 27.17.
        expect(invoice.totalUsd, 27.17);

        expect(payments, isNotEmpty);
        for (final payment in payments) {
          expect(
            payment.exchangeRate,
            36.80,
            reason:
                'payment ${payment.method} must carry the applied rate, not '
                'the configured commercial rate',
          );
        }
      },
    );

    testWidgets(
      'single cash checkout persists the applied rate and the receipt prints it',
      (tester) async {
        setUpViewport(tester);
        await tester.pumpWidget(createWidgetUnderTest());
        await tester.pumpAndSettle();

        await tapAndSubmit(tester, find.text('COBRAR'));

        final (invoice, payments) = captureSavedSale();

        expect(invoice.commercialRate, 36.80);
        expect(invoice.bcnOfficialRate, 36.80);
        expect(invoice.totalUsd, 27.17);
        expect(payments.single.exchangeRate, 36.80);

        // The printed Tipo de Cambio / USD block must match the charge.
        final receipt = ReceiptLayoutFormatter.format80mm()
            .formatFor(invoice, payments: payments);
        expect(_lineContaining(receipt, 'T/C USD:'), contains('36.80'));
        expect(_lineContaining(receipt, 'TOTAL USD:'), contains('27.17'));
      },
    );

    testWidgets(
      'card tender in USD persists the applied rate',
      (tester) async {
        setUpViewport(tester);
        await tester.pumpWidget(createWidgetUnderTest());
        await tester.pumpAndSettle();

        // Select USD while the cash panel owns the currency selector.
        await tester.tap(find.widgetWithText(ChoiceChip, 'USD (\$)'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(ChoiceChip, 'Tarjeta'));
        await tester.pumpAndSettle();

        await tapAndSubmit(tester, find.text('COBRAR'));

        final (invoice, payments) = captureSavedSale();
        expect(invoice.commercialRate, 36.80);
        expect(payments.single.method, PaymentMethod.card);
        expect(payments.single.exchangeRate, 36.80);
      },
    );

    testWidgets(
      'QR tender in USD persists the applied rate',
      (tester) async {
        setUpViewport(tester);
        await tester.pumpWidget(createWidgetUnderTest());
        await tester.pumpAndSettle();

        await tester.tap(find.widgetWithText(ChoiceChip, 'USD (\$)'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(ChoiceChip, 'QR / Transfer'));
        await tester.pumpAndSettle();

        await tapAndSubmit(tester, find.text('COBRAR'));

        final (invoice, payments) = captureSavedSale();
        expect(invoice.commercialRate, 36.80);
        expect(payments.single.method, PaymentMethod.qr);
        expect(payments.single.exchangeRate, 36.80);
      },
    );

    testWidgets(
      'split payment in USD persists the applied rate',
      (tester) async {
        setUpViewport(tester);
        await tester.pumpWidget(createWidgetUnderTest());
        await tester.pumpAndSettle();

        await tester.tap(find.text('Pago Dividido'));
        await tester.pumpAndSettle();

        await tester.tap(find.widgetWithText(ChoiceChip, 'USD (\$)'));
        await tester.pumpAndSettle();
        // 30 USD covers C$ 1000 at the applied 36.80 rate (C$ 1104 tendered).
        await tester.enterText(
          find.byKey(const Key('split_tender_amount_field')),
          '30.00',
        );
        await tester.pumpAndSettle();

        await tester.ensureVisible(find.text('Agregar Pago'));
        await tester.tap(find.text('Agregar Pago'));
        await tester.pumpAndSettle();

        final finalizeBtn = find.text('FINALIZAR VENTA');
        await tester.ensureVisible(finalizeBtn);
        await tapAndSubmit(tester, finalizeBtn);

        final (invoice, payments) = captureSavedSale();
        expect(invoice.commercialRate, 36.80);
        expect(payments.single.currency, 'USD');
        expect(payments.single.exchangeRate, 36.80);
      },
    );
  });

  group('COMMERCIAL mode — behaviour is unchanged', () {
    setUp(() async {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      // No checkout_fx_mode row: the mode defaults to COMMERCIAL.
      await seedRates(bcnMode: false);
      await buildViewModel();
    });

    tearDown(() async {
      saleViewModel.dispose();
      await database.close();
    });

    testWidgets(
      'single cash checkout keeps the commercial rate on the invoice and the payment',
      (tester) async {
        setUpViewport(tester);
        await tester.pumpWidget(createWidgetUnderTest());
        await tester.pumpAndSettle();

        await tapAndSubmit(tester, find.text('COBRAR'));

        final (invoice, payments) = captureSavedSale();

        expect(invoice.total, 1000.0);
        // The commercial configuration is the applied rate in COMMERCIAL mode.
        expect(invoice.commercialRate, 37.25);
        expect(invoice.bcnOfficialRate, 36.80);
        // 1000 / 37.25 = 26.85.
        expect(invoice.totalUsd, 26.85);
        expect(payments.single.exchangeRate, 37.25);

        final receipt = ReceiptLayoutFormatter.format80mm()
            .formatFor(invoice, payments: payments);
        expect(_lineContaining(receipt, 'T/C USD:'), contains('37.25'));
        expect(_lineContaining(receipt, 'TOTAL USD:'), contains('26.85'));
      },
    );
  });
}
