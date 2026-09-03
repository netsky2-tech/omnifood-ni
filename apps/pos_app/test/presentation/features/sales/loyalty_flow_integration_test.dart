import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

class FakeSalesRepository implements SalesRepository {
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
  late FakeInventoryRepository inventoryRepo;
  late FakeAuthRepository authRepo;
  late SaleViewModel viewModel;

  final pBurger = const Product(
    id: 'prod-burger',
    name: 'Hamburguesa Gigante',
    uom: 'UND',
    stock: 50,
    averageCost: 60,
    sellPrice: 200,
    category: 'Comida',
  );

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    salesRepo = FakeSalesRepository();
    inventoryRepo = FakeInventoryRepository();
    authRepo = FakeAuthRepository();

    viewModel = SaleViewModel(
      salesRepo,
      inventoryRepo,
      authRepo,
      database,
      TableOrderService(database),
      false,
      TenantConfigService(database.localConfigDao),
      KitchenOrderService(database),
      PrinterConfigService(database.localConfigDao),
      null,
      null,
      null,
      const LoyaltyService(
        earnRate: 0.1, // 1 pt por cada 10 NIO
        redeemRate: 0.1, // 1 pt = 0.10 NIO (100 pts = 10 NIO)
        minPointsToRedeem: 10.0,
      ),
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('SaleViewModel - Loyalty Points FOH & Checkout Flow', () {
    test('valida y aplica redención de puntos en el carrito', () async {
      const customer = Customer(
        id: 'c-100',
        name: 'Ana Solís',
        taxId: '001-120595-0005B',
        pointsBalance: 250.0,
      );

      viewModel.addToCart(pBurger); // 200 NIO
      viewModel.selectCustomer(customer);

      // Redimir 100 puntos -> C$ 10 de descuento
      final res = viewModel.applyLoyaltyPoints(100.0);
      expect(res.isValid, isTrue);
      expect(viewModel.pointsToRedeem, equals(100.0));
      expect(viewModel.loyaltyDiscount, equals(10.0));
      expect(viewModel.subtotal, equals(190.0)); // 200 - 10 = 190
    });

    test('rechaza redención si excede los puntos disponibles del cliente', () {
      const customer = Customer(
        id: 'c-100',
        name: 'Ana Solís',
        pointsBalance: 50.0,
      );

      viewModel.addToCart(pBurger);
      viewModel.selectCustomer(customer);

      final res = viewModel.applyLoyaltyPoints(100.0); // Pide 100 pero solo tiene 50
      expect(res.isValid, isFalse);
      expect(res.errorMessage, contains('Saldo de puntos insuficiente'));
      expect(viewModel.pointsToRedeem, equals(0.0));
    });

    test('processSale ejecuta redención y acumulación atómica en el ledger SQLite', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      // 1. Guardar cliente en SQLite con 200 puntos
      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: 'c-ana',
          name: 'Ana Solís',
          taxId: '001-120595-0005B',
          phone: '87654321',
          email: 'ana@gmail.com',
          address: 'Managua',
          pointsBalance: 200.0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        ),
      );

      final customer = const Customer(
        id: 'c-ana',
        name: 'Ana Solís',
        pointsBalance: 200.0,
      );

      viewModel.addToCart(pBurger); // 200 NIO
      viewModel.selectCustomer(customer);

      // Redimir 100 puntos (C$ 10 de descuento) -> Subtotal neto = 190 NIO
      viewModel.applyLoyaltyPoints(100.0);

      await viewModel.processSale([PaymentMethod.cash]);

      // Verificar que el subtotal facturado reflejó la redención
      expect(salesRepo.lastSavedInvoice?.subtotal, equals(190.0));

      // Verificar transacciones registradas en el ledger de Floor SQLite
      final transactions = await database.customerPointTransactionDao
          .getTransactionsByCustomer('c-ana');

      // Deben existir 2 transacciones: REDEEM (-100 pts) y EARN (+19 pts sobre 190 NIO)
      expect(transactions.length, equals(2));

      final redeemTx = transactions.firstWhere((t) => t.type == 'redeem');
      expect(redeemTx.points, equals(-100.0));
      expect(redeemTx.balanceAfter, equals(100.0));

      final earnTx = transactions.firstWhere((t) => t.type == 'earn');
      expect(earnTx.points, equals(19.0)); // 10% de 190
      expect(earnTx.balanceAfter, equals(119.0));

      // Verificar que el saldo en la tabla customers quedó en 119.0
      final updatedCust = await database.customerDao.getCustomerById('c-ana');
      expect(updatedCust?.pointsBalance, equals(119.0));
    });
  });
}
