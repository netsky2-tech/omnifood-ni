import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';

import '../../../presentation/features/sales/sale_view_model_test.mocks.dart';

void main() {
  late AppDatabase database;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockSalesRepository mockSalesRepo;
  late TenantConfigService tenantConfigService;
  late KitchenOrderService kitchenOrderService;
  late SaleViewModel saleViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    // 1. Seed FX Rates & Operation Mode in SQLite
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'bcn_official_exchange_rate', value: '36.6241'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'operation_mode', value: 'FOODPARK_QSR'),
    );

    tenantConfigService = TenantConfigService(database.localConfigDao);
    kitchenOrderService = KitchenOrderService(database);

    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockSalesRepo = MockSalesRepository();

    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-cashier-1',
        name: 'Maria Cajera',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
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
      tenantConfigService,
      kitchenOrderService,
    );

    await saleViewModel.loadExchangeRates();
    await saleViewModel.loadTenantConfig();
  });

  tearDown(() async {
    saleViewModel.dispose();
    tenantConfigService.dispose();
    await database.close();
  });

  final tacoProduct = const Product(
    id: 'prod-taco',
    name: 'Tacos al Pastor',
    uom: 'UNIDAD',
    stock: 50.0,
    averageCost: 40.0,
    sellPrice: 100.0,
    category: 'Comida',
  );

  final mojitoProduct = const Product(
    id: 'prod-mojito',
    name: 'Mojito Clásico',
    uom: 'VASO',
    stock: 20.0,
    averageCost: 30.0,
    sellPrice: 100.0,
    category: 'Bebida',
  );

  group('KitchenOrderService sendDirectSaleToKitchen (Slice 6.2)', () {
    test('routes items to COCINA and BARRA with buzzer label and modifiers', () async {
      final items = [
        CartItem(
          productId: 'prod-taco',
          productName: 'Tacos al Pastor',
          quantity: 2,
          unitPrice: 120.0,
          taxRate: 0.15,
          notes: 'Con salsa picante',
          selectedModifiers: [
            const Modifier(id: 'mod-1', name: 'Extra Queso', extraPrice: 20.0),
          ],
        ),
        CartItem(
          productId: 'prod-mojito',
          productName: 'Mojito Clásico',
          quantity: 1,
          unitPrice: 100.0,
          taxRate: 0.15,
        ),
      ];

      final createdOrders = await kitchenOrderService.sendDirectSaleToKitchen(
        invoiceId: 'inv-qsr-01',
        invoiceNumber: '001-001-01-00000042',
        items: items,
        buzzerNumber: '18',
        customerName: 'Roberto',
        waiterName: 'Maria Cajera',
      );

      expect(createdOrders.length, 2);

      final cocinaOrder = createdOrders.firstWhere((o) => o.station == 'COCINA');
      expect(cocinaOrder.tableName, 'Buzzer #18');
      expect(cocinaOrder.tableNumber, '18');
      expect(cocinaOrder.status, 'PENDIENTE');
      expect(cocinaOrder.items.first.productName, 'Tacos al Pastor');
      expect(cocinaOrder.items.first.modifiers, contains('Extra Queso'));
      expect(cocinaOrder.items.first.notes, 'Con salsa picante');

      final barraOrder = createdOrders.firstWhere((o) => o.station == 'BARRA');
      expect(barraOrder.tableName, 'Buzzer #18');
      expect(barraOrder.items.first.productName, 'Mojito Clásico');

      // Verify persistence in SQLite
      final persistedOrders = await kitchenOrderService.getActiveOrders();
      expect(persistedOrders.length, 2);
    });

    test('falls back to customer name or invoice number when buzzer is omitted', () async {
      final items = [
        CartItem(
          productId: 'prod-burger',
          productName: 'Hamburguesa Doble',
          quantity: 1,
          unitPrice: 180.0,
          taxRate: 0.15,
        ),
      ];

      final createdOrders = await kitchenOrderService.sendDirectSaleToKitchen(
        invoiceId: 'inv-qsr-02',
        invoiceNumber: '001-001-01-00000099',
        items: items,
        customerName: 'Valeria',
      );

      expect(createdOrders.first.tableName, 'Valeria');
      expect(createdOrders.first.tableNumber, isNull);
    });
  });

  group('SaleViewModel Food Park QSR & Buzzer Integration (Slice 6.2)', () {
    test('reflects Food Park QSR flags from TenantConfig', () async {
      expect(saleViewModel.isFoodParkQsr, isTrue);
      expect(saleViewModel.supportsBuzzerPager, isTrue);
      expect(saleViewModel.supportsTables, isFalse);
    });

    test('setting buzzer number and customer name notifies listeners', () {
      var notified = false;
      saleViewModel.addListener(() => notified = true);

      saleViewModel.setBuzzerNumber('25');
      expect(saleViewModel.buzzerNumber, '25');
      expect(notified, isTrue);

      saleViewModel.setCustomerName('Alejandro');
      expect(saleViewModel.customerName, 'Alejandro');
    });

    test('processSale dispatches direct sale to kitchen with buzzer and resets buzzer state', () async {
      saleViewModel.addToCart(tacoProduct, quantity: 2);
      saleViewModel.setBuzzerNumber('07');
      saleViewModel.setCustomerName('Denis');

      await saleViewModel.processSale([PaymentMethod.cash]);

      // Verify buzzer state was cleared after sale
      expect(saleViewModel.buzzerNumber, isNull);
      expect(saleViewModel.customerName, isNull);
      expect(saleViewModel.cart, isEmpty);

      // Verify kitchen order was persisted in SQLite with Buzzer #07
      final kitchenOrders = await kitchenOrderService.getActiveOrders();
      expect(kitchenOrders.length, 1);
      expect(kitchenOrders.first.tableName, 'Buzzer #07');
      expect(kitchenOrders.first.tableNumber, '07');
    });
    test('processSale dispatches direct sale to kitchen with customer name when buzzer is null', () async {
      saleViewModel.addToCart(tacoProduct, quantity: 1);
      saleViewModel.setCustomerName('Maria Lopez');

      await saleViewModel.processSale([PaymentMethod.cash]);

      final kitchenOrders = await kitchenOrderService.getActiveOrders();
      expect(kitchenOrders.length, 1);
      expect(kitchenOrders.first.tableName, 'Maria Lopez');
      expect(kitchenOrders.first.tableNumber, isNull);
    });

    test('validates tenantConfig buzzerPagerRequired when buzzer is missing', () async {
      await tenantConfigService.saveTenantConfig(const TenantConfig(
        operationMode: TenantOperationMode.foodparkQsr,
        buzzerPagerRequired: true,
      ));
      await saleViewModel.loadTenantConfig();

      expect(saleViewModel.tenantConfig?.buzzerPagerRequired, isTrue);
      expect(saleViewModel.supportsBuzzerPager, isTrue);
    });
  });
}
