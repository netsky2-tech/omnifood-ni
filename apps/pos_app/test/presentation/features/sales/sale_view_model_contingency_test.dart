import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class _FakeSalesRepository implements SalesRepository {
  Invoice? lastSavedInvoice;

  @override
  Future<void> saveSale({
    FulfillmentCheckoutContext? fulfillmentContext,
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {
    lastSavedInvoice = invoice;
  }

  @override
  Future<Invoice?> getInvoiceById(String id) async => lastSavedInvoice;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInventoryRepository implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthRepository implements AuthRepository {
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
  late _FakeSalesRepository salesRepo;
  late MockPrinterAdapter printer;
  late SaleViewModel viewModel;

  const product = Product(
    id: 'prod-1',
    name: 'Gallo Pinto',
    uom: 'UND',
    stock: 10,
    averageCost: 30,
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
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'auto_print_invoice', value: 'true'),
    );

    salesRepo = _FakeSalesRepository();
    printer = MockPrinterAdapter();

    viewModel = SaleViewModel(
      salesRepo,
      _FakeInventoryRepository(),
      _FakeAuthRepository(),
      database,
      TableOrderService(database),
      false,
      TenantConfigService(database.localConfigDao),
      KitchenOrderService(database),
      PrinterConfigService(database.localConfigDao),
      printer,
    );
    await viewModel.loadExchangeRates();
  });

  tearDown(() async {
    await database.close();
  });

  test('DT 09-2007 3.3.b: contingency back-entry prints ORIGINAL and COPIA (2 print jobs) and clears state after checkout',
      () async {
    viewModel.addToCart(product);
    viewModel.setContingencyManualReference(
      series: 'MAN-001',
      number: '000042',
      issuedAt: '2026-11-27',
    );
    expect(viewModel.hasContingencyManualReference, isTrue);

    await viewModel.processSale([PaymentMethod.cash]);

    expect(salesRepo.lastSavedInvoice, isNotNull);
    expect(salesRepo.lastSavedInvoice!.contingencyManualSeries, 'MAN-001');
    expect(salesRepo.lastSavedInvoice!.contingencyManualNumber, '000042');
    expect(salesRepo.lastSavedInvoice!.contingencyManualIssuedAt, '2026-11-27');

    expect(printer.printHistory, hasLength(2));
    expect(printer.printHistory[0].printedText, contains('ORIGINAL'));
    expect(printer.printHistory[0].printedText, contains('INGRESO POR CONTINGENCIA'));
    expect(printer.printHistory[0].printedText, contains('MAN-001-000042'));
    expect(
      printer.printHistory[1].printedText!.replaceAll(RegExp(r'\s+'), ' '),
      contains('COPIA - ADJUNTAR COPIA MANUAL'),
    );
    expect(printer.printHistory[1].printedText, contains('INGRESO POR CONTINGENCIA'));

    // Contingency state cleared after checkout
    expect(viewModel.hasContingencyManualReference, isFalse);
    expect(viewModel.contingencyManualSeries, isNull);
  });

  test('non-contingency checkout dispatches 1 print job (preserves existing behavior)',
      () async {
    viewModel.addToCart(product);

    await viewModel.processSale([PaymentMethod.cash]);

    expect(printer.printHistory, hasLength(1));
    expect(printer.printHistory.single.printedText, isNot(contains('INGRESO POR CONTINGENCIA')));
  });
}
