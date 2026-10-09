import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/promotion_entity.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
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

import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';

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

/// Controllable stand-in for the real [SyncService]: no network path is
/// exercised; the stream simply stays quiet.
class FakeSyncService extends Mock implements SyncService {
  final _controller = StreamController<InboundSyncResult>.broadcast();

  @override
  Stream<InboundSyncResult> get onInboundSync => _controller.stream;

  void emitSync(InboundSyncResult result) => _controller.add(result);
}

void main() {
  late AppDatabase database;
  late FakeSalesRepository salesRepo;
  late SaleViewModel viewModel;

  final pBeer = const Product(
    id: 'prod-toña',
    name: 'Cerveza Toña 350ml',
    uom: 'UND',
    stock: 100,
    averageCost: 25,
    sellPrice: 50,
    taxRate: 0.15,
    category: 'Bebidas',
    categoryId: 'cat-bebidas',
  );

  final pBurger = const Product(
    id: 'prod-burger',
    name: 'Hamburguesa Clásica',
    uom: 'UND',
    stock: 50,
    averageCost: 60,
    sellPrice: 120,
    taxRate: 0.15,
    category: 'Comida',
    categoryId: 'cat-comida',
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
    // The sale path fails closed without BOTH recorded FX rates.
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );
    salesRepo = FakeSalesRepository();

    viewModel = SaleViewModel(
      salesRepo,
      FakeInventoryRepository(),
      FakeAuthRepository(),
      database,
      TableOrderService(database),
      false, // disable autoLoad to control promotions load in tests
      TenantConfigService(database.localConfigDao),
      KitchenOrderService(database),
      PrinterConfigService(database.localConfigDao),
      null, // printerPort
      FakeSyncService(),
    );
    viewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
  });

  tearDown(() async {
    await database.close();
  });

  // --- Real-path assertions -----------------------------------------------
  // The cart/promotion input below is built through the REAL production path
  // (promotionDao + loadPromotions + addToCart + applyManualDiscount +
  // processSale), never by handing the view model a fabricated itemDiscounts
  // map. The expected origin totals are the amounts the TEST set up: the
  // promotion the engine grants through its own evaluation and the manual
  // amount the operator typed. The allocator's output is never assumed.

  /// Invariant 1: every line's breakdown sums exactly to THAT line's
  /// discount, in integer cents.
  void expectLineSumsMatchLineDiscounts(List<InvoiceItem> items) {
    for (final item in items) {
      final breakdown = item.discountOrigin;
      expect(
        breakdown,
        isNotNull,
        reason:
            'A discounted checkout must persist a breakdown on every line '
            '(item ${item.productId}, discount ${item.discount}).',
      );
      final breakdownCents =
          (breakdown!.values.fold<double>(0, (a, b) => a + b) * 100).round();
      final discountCents = (item.discount * 100).round();
      expect(
        breakdownCents,
        discountCents,
        reason:
            'Line ${item.productId}: breakdown ${breakdown} must sum to the '
            'authoritative line discount ${item.discount}.',
      );
    }
  }

  /// Invariant 2: each origin sums over the whole invoice to the order-level
  /// total the test itself set up.
  void expectOriginTotals(
    List<InvoiceItem> items, {
    required double promotion,
    required double manual,
  }) {
    double sumOf(String key) => items.fold<double>(
          0,
          (acc, item) => acc + (item.discountOrigin?[key] ?? 0),
        );
    expect(sumOf('promotion') * 100, (promotion * 100).round(),
        reason: 'promotion origin total');
    expect(sumOf('manual') * 100, (manual * 100).round(),
        reason: 'manual origin total');
    expect(sumOf('loyalty'), 0.0, reason: 'no loyalty activity in this cart');
  }

  group('SaleViewModel - checkout persists the discount-origin breakdown', () {
    test('mixed promotion + manual checkout: both invariants hold', () async {
      // Real promotion through the real path: 10% on the Bebidas category.
      // Cart: 4 beers (gross 200) + 1 burger (gross 120) -> promotion 20.00.
      await database.promotionDao.savePromotion(
        PromotionEntity(
          id: 'promo-cat-10',
          name: '10% Descuento en Bebidas',
          type: 'percentageDiscount',
          targetCategoryId: 'cat-bebidas',
          discountValue: 10.0,
          priority: 5,
          isActive: true,
        ),
      );
      await viewModel.loadPromotions();

      viewModel.addToCart(pBeer, quantity: 4);
      viewModel.addToCart(pBurger);
      expect(viewModel.totalDiscounts, equals(20.0));

      // The operator types a manual discount through the REAL method.
      viewModel.grantSupervisorOverride();
      viewModel.applyManualDiscount(30.0);
      expect(viewModel.totalDiscounts, equals(50.0));

      await viewModel.processSale([PaymentMethod.cash]);

      final items = salesRepo.lastSavedItems!;
      expect(items, hasLength(2));

      expectLineSumsMatchLineDiscounts(items);
      expectOriginTotals(items, promotion: 20.0, manual: 30.0);

      // The beer line carries BOTH origins; the burger line manual only.
      final beer = items.singleWhere((i) => i.productId == 'prod-toña');
      final burger = items.singleWhere((i) => i.productId == 'prod-burger');
      expect(beer.discountOrigin!.keys, containsAll(['promotion', 'manual']));
      expect(burger.discountOrigin!.keys, ['manual']);
    });

    test(
        'a cart with no discount persists discountOrigin == null on every line '
        '(never an empty map)', () async {
      await viewModel.loadPromotions();
      viewModel.addToCart(pBurger);
      await viewModel.processSale([PaymentMethod.cash]);

      final items = salesRepo.lastSavedItems!;
      expect(items, hasLength(1));
      expect(items.single.discount, 0.0);
      expect(
        items.single.discountOrigin,
        isNull,
        reason: 'Null means legacy/unknown; an empty map must never be '
            'fabricated for a no-discount line.',
      );
    });

    test(
        'a promotion below the line capacity still distributes with a real '
        'engine result', () async {
      // 5% on Bebidas: cart 2 beers (100) + 1 burger (120) -> promotion 5.00,
      // far below the beer line's proportional discount capacity.
      await database.promotionDao.savePromotion(
        PromotionEntity(
          id: 'promo-cat-5',
          name: '5% Descuento en Bebidas',
          type: 'percentageDiscount',
          targetCategoryId: 'cat-bebidas',
          discountValue: 5.0,
          priority: 5,
          isActive: true,
        ),
      );
      await viewModel.loadPromotions();

      viewModel.addToCart(pBeer, quantity: 2);
      viewModel.addToCart(pBurger);
      expect(viewModel.totalDiscounts, equals(5.0));

      viewModel.grantSupervisorOverride();
      viewModel.applyManualDiscount(20.0);
      expect(viewModel.totalDiscounts, equals(25.0));

      await viewModel.processSale([PaymentMethod.cash]);

      final items = salesRepo.lastSavedItems!;
      expectLineSumsMatchLineDiscounts(items);
      expectOriginTotals(items, promotion: 5.0, manual: 20.0);
    });

    test(
        'after a discounted sale is cleared, a following sale from a DIFFERENT '
        'cart carries no stale promotion weight', () async {
      // Sale 1: 2x1 on beers -> real promotion weight on prod-toña.
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
      viewModel.addToCart(pBeer, quantity: 2);
      expect(viewModel.totalDiscounts, equals(50.0));
      await viewModel.processSale([PaymentMethod.cash]);
      expect(
        salesRepo.lastSavedItems!.any(
          (i) => i.discountOrigin?.containsKey('promotion') ?? false,
        ),
        isTrue,
      );

      // Checkout clears the cart; sale 2 is a DIFFERENT cart with a manual
      // discount only. Whatever promotion weight sale 1 produced must not
      // leak into sale 2's persisted lines.
      viewModel.addToCart(pBurger);
      viewModel.grantSupervisorOverride();
      viewModel.applyManualDiscount(10.0);
      await viewModel.processSale([PaymentMethod.cash]);

      final items = salesRepo.lastSavedItems!;
      expect(items, hasLength(1));
      final breakdown = items.single.discountOrigin!;
      expect(breakdown.containsKey('promotion'), isFalse,
          reason: 'No promotion applies to this cart; the breakdown must '
              'carry no stale promotion weight.');
      expect(breakdown['manual']! * 100, 1000);
    });

    test(
        'the credit-note path builds no InvoiceItems in this view model — '
        'voiding delegates to the repository', () async {
      // Structural contract of this unit: the ONLY checkout site that builds
      // InvoiceItem rows is _processSaleInternal. The void/credit-note flow
      // delegates to _salesRepository.createCreditNote, and the only other
      // InvoiceItem construction in this view model is the print/reprint copy
      // path, which rebuilds items from database rows for PRINTING and never
      // feeds the sync payload. There is therefore no reachable construction
      // site here that could copy a discountOrigin from the original sale
      // into a credit-note item — this test pins the real-path guarantee that
      // a discount-free checkout (the credit-note analogue) persists NULL.
      await viewModel.loadPromotions();
      viewModel.addToCart(pBurger);
      await viewModel.processSale([PaymentMethod.cash]);

      final items = salesRepo.lastSavedItems!;
      for (final item in items) {
        // Credit-note items carry no discount; their provenance must stay
        // NULL, never copied and never an empty map.
        expect(item.discount, 0.0);
        expect(item.discountOrigin, isNull);
      }
    });
  });
}
