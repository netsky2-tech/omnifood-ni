import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/promotion_entity.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

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
  late FakeInventoryRepository inventoryRepo;
  late FakeAuthRepository authRepo;
  late SaleViewModel viewModel;

  final pBeer = const Product(
    id: 'prod-toña',
    name: 'Cerveza Toña 350ml',
    uom: 'UND',
    stock: 100,
    averageCost: 25,
    sellPrice: 50,
    category: 'Bebidas',
  );

  final pBurger = const Product(
    id: 'prod-burger',
    name: 'Hamburguesa Clásica',
    uom: 'UND',
    stock: 50,
    averageCost: 60,
    sellPrice: 120,
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
      false, // disable autoLoad to control promotions load in tests
      TenantConfigService(database.localConfigDao),
      KitchenOrderService(database),
      PrinterConfigService(database.localConfigDao),
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('SaleViewModel - Automatic Promotions Integration Flow', () {
    test('aplica promoción 2x1 en cerveza al agregar 2 unidades al carrito', () async {
      await database.promotionDao.savePromotion(
        PromotionEntity(
          id: 'promo-2x1',
          name: '2x1 en Cervezas Toña',
          type: 'buyXGetYFree',
          targetProductId: 'prod-toña',
          buyQuantity: 1,
          getQuantity: 1,
          priority: 10,
          isActive: true,
        ),
      );

      await viewModel.loadPromotions();

      // 1. Agregar 1 cerveza -> 50 C$, 0 desc
      viewModel.addToCart(pBeer);
      expect(viewModel.totalDiscounts, equals(0.0));
      expect(viewModel.subtotal, equals(50.0));

      // 2. Agregar 2da cerveza -> 2x1 se activa (50 C$ de descuento)
      viewModel.addToCart(pBeer);
      expect(viewModel.totalDiscounts, equals(50.0));
      expect(viewModel.subtotal, equals(50.0)); // 100 bruto - 50 desc = 50 neto

      // 3. Agregar hamburguesa (120 C$)
      viewModel.addToCart(pBurger);
      expect(viewModel.totalDiscounts, equals(50.0));
      expect(viewModel.subtotal, equals(170.0)); // 220 bruto - 50 desc = 170 neto
    });

    test('aplica descuento de categoría porcentual dinámico (10% en Bebidas)', () async {
      await database.promotionDao.savePromotion(
        PromotionEntity(
          id: 'promo-cat-10',
          name: '10% Descuento en Bebidas',
          type: 'percentageDiscount',
          targetCategoryId: 'Bebidas',
          discountValue: 10.0, // 10%
          priority: 5,
          isActive: true,
        ),
      );

      await viewModel.loadPromotions();

      // 4 Cervezas a C$ 50 = C$ 200 -> Descuento 10% = C$ 20
      viewModel.addToCart(pBeer, quantity: 4);

      expect(viewModel.totalDiscounts, equals(20.0));
      expect(viewModel.subtotal, equals(180.0)); // 200 - 20 = 180 neto
      expect(viewModel.totalTax, closeTo(27.0, 0.01)); // 15% de 180 = 27
      expect(viewModel.total, closeTo(207.0, 0.01)); // 180 + 27 = 207
    });

    test('recalcula y revierte descuento si los ítems son removidos del carrito', () async {
      await database.promotionDao.savePromotion(
        PromotionEntity(
          id: 'promo-2x1',
          name: '2x1 en Cervezas Toña',
          type: 'buyXGetYFree',
          targetProductId: 'prod-toña',
          buyQuantity: 1,
          getQuantity: 1,
          isActive: true,
        ),
      );

      await viewModel.loadPromotions();

      viewModel.addToCart(pBeer, quantity: 2);
      expect(viewModel.totalDiscounts, equals(50.0));

      // Reducir a 1 unidad
      viewModel.updateQuantity(pBeer.id, 1);
      expect(viewModel.totalDiscounts, equals(0.0));
      expect(viewModel.subtotal, equals(50.0));
    });

    test('processSale genera factura DGI con montos netos y descuentos preservados', () async {
      await database.promotionDao.savePromotion(
        PromotionEntity(
          id: 'promo-burger-20',
          name: '20% en Hamburguesas',
          type: 'percentageDiscount',
          targetProductId: 'prod-burger',
          discountValue: 20.0,
          isActive: true,
        ),
      );

      await viewModel.loadPromotions();
      viewModel.addToCart(pBurger, quantity: 2); // 240 bruto - 48 desc = 192 neto

      await viewModel.processSale([PaymentMethod.cash]);

      expect(salesRepo.lastSavedInvoice, isNotNull);
      final invoice = salesRepo.lastSavedInvoice!;
      expect(invoice.subtotal, equals(192.0));
      expect(invoice.totalTax, closeTo(28.80, 0.01)); // 15% de 192
      expect(invoice.total, closeTo(220.80, 0.01));
    });
  });
}
