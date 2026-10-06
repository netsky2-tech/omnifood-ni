import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

/// D-7: end-to-end money trace for a tipped sale.
///
/// Fiscal design (DGI INV-16.1, AD-10): `invoice.total` is the TAXABLE
/// total and EXCLUDES the voluntary tip; the tip travels as its own
/// snapshot columns. The operator-confirmed amount (`grandTotalWithTip`)
/// must be what the collected PAYMENTS charge — no undercharge, no leak
/// into the taxable base.
class FakeSalesRepository implements SalesRepository {
  Invoice? lastSavedInvoice;
  List<InvoiceItem>? lastSavedItems;
  List<Payment>? lastSavedPayments;

  @override
  Future<void> saveSale({
    FulfillmentCheckoutContext? fulfillmentContext,
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {
    lastSavedInvoice = invoice;
    lastSavedItems = items;
    lastSavedPayments = payments;
  }

  @override
  Future<Invoice?> getInvoiceById(String id) async => lastSavedInvoice;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeInventoryRepository implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeAuthRepository implements AuthRepository {
  @override
  Future<User?> getCurrentUser() async => const User(
        id: 'cashier-001',
        name: 'Cajero Principal',
        email: 'cajero@omnifood.ni',
        role: UserRole.cashier,
        isActive: true,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late AppDatabase database;
  late FakeSalesRepository salesRepo;
  late SaleViewModel viewModel;

  const product = Product(
    id: 'prod-dinner',
    name: 'Cena Completa',
    uom: 'UND',
    stock: 10,
    averageCost: 40,
    sellPrice: 100.0,
    taxRate: 0.15,
    category: 'Comida',
  );

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    salesRepo = FakeSalesRepository();

    viewModel = SaleViewModel(
      salesRepo,
      FakeInventoryRepository(),
      FakeAuthRepository(),
      database,
      TableOrderService(database),
      false, // disable autoLoad
      TenantConfigService(database.localConfigDao),
      KitchenOrderService(database),
      PrinterConfigService(database.localConfigDao),
    );
    viewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
    await viewModel.loadExchangeRates();
    viewModel.addToCart(product);

    expect(viewModel.subtotal, 100.0);
    expect(viewModel.totalTax, 15.0);
    expect(viewModel.total, 115.0);
  });

  tearDown(() async {
    await database.close();
  });

  group('D-7 tipped checkout money trace', () {
    test(
      '10% tip: invoice stamps the tip snapshot, total stays fiscal '
      '(INV-16.1) and the collected payment equals grandTotalWithTip',
      () async {
        viewModel.setTip(tipType: TipType.suggestedTenPercent);

        // Tip preview hops on the view model.
        expect(viewModel.tipType, TipType.suggestedTenPercent);
        expect(viewModel.tipAmount, 10.0);
        expect(viewModel.grandTotalWithTip, 125.0);

        await viewModel.processSale([PaymentMethod.cash]);

        final invoice = salesRepo.lastSavedInvoice!;
        final payments = salesRepo.lastSavedPayments!;

        // HOP 1 — tip snapshot travels with the fiscal document (AD-10).
        expect(invoice.tipAmountNio, 10.0);
        expect(invoice.tipAmountUsd, closeTo(10.0 / 36.50, 0.01));
        expect(invoice.tipPercentage, 10.0);
        expect(invoice.tipEligibleBaseNio, 100.0);

        // HOP 2 — the taxable total EXCLUDES the voluntary tip (INV-16.1).
        expect(invoice.subtotal, 100.0);
        expect(invoice.totalTax, 15.0);
        expect(invoice.total, 115.0);

        // HOP 3 — the money actually collected equals what the operator
        // confirmed (115 fiscal + 10 tip = 125). No undercharge.
        expect(payments, hasLength(1));
        expect(payments.single.amount, 125.0);
        expect(payments.single.amountNio, 125.0);
      },
    );

    test(
      'clearing the tip returns every number to the no-tip state',
      () async {
        viewModel.setTip(tipType: TipType.suggestedTenPercent);
        expect(viewModel.tipAmount, 10.0);

        viewModel.clearTip();

        expect(viewModel.tipType, TipType.none);
        expect(viewModel.tipAmount, 0.0);
        expect(viewModel.grandTotalWithTip, 115.0);

        await viewModel.processSale([PaymentMethod.cash]);

        final invoice = salesRepo.lastSavedInvoice!;
        final payments = salesRepo.lastSavedPayments!;

        expect(invoice.tipAmountNio, isNull);
        expect(invoice.tipAmountUsd, isNull);
        expect(invoice.tipPercentage, isNull);
        expect(invoice.tipEligibleBaseNio, isNull);
        expect(invoice.total, 115.0);
        expect(payments.single.amountNio, 115.0);
      },
    );

    test(
      'a fixed NIO tip is stamped and charged exactly',
      () async {
        viewModel.setTip(
          tipType: TipType.fixedAmountNio,
          fixedAmount: 50.0,
        );
        expect(viewModel.tipAmount, 50.0);
        expect(viewModel.grandTotalWithTip, 165.0);

        await viewModel.processSale([PaymentMethod.cash]);

        final invoice = salesRepo.lastSavedInvoice!;
        final payments = salesRepo.lastSavedPayments!;

        expect(invoice.tipAmountNio, 50.0);
        expect(invoice.tipPercentage, closeTo(50.0, 0.01));
        expect(invoice.total, 115.0);
        expect(payments.single.amountNio, 165.0);
      },
    );

    test(
      'the tip never leaks into the next sale: clearCart resets it',
      () async {
        viewModel.setTip(tipType: TipType.suggestedTenPercent);
        expect(viewModel.tipAmount, 10.0);

        viewModel.clearCart();

        expect(viewModel.tipType, TipType.none);
        expect(viewModel.tipAmount, 0.0);
        // Cart is empty after clearCart, so there is nothing to charge.
        expect(viewModel.grandTotalWithTip, 0.0);
      },
    );
  });
}
