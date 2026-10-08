import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

/// Issue #785 (legacy-path parity): a sale resumed from a hold ticket must
/// dispatch to the kitchen KDS exactly like a direct counter sale, through
/// the same single dispatch point, so the two commit paths cannot drift.

class RecordedKitchenDispatch {
  final String invoiceId;
  final String invoiceNumber;
  final List<CartItem> items;
  final String? buzzerNumber;
  final String? customerName;
  final String? waiterName;

  const RecordedKitchenDispatch({
    required this.invoiceId,
    required this.invoiceNumber,
    required this.items,
    required this.buzzerNumber,
    required this.customerName,
    required this.waiterName,
  });
}

class RecordingKitchenOrderService extends KitchenOrderService {
  final List<RecordedKitchenDispatch> calls = [];
  final List<String> relabeledTicketIds = [];

  RecordingKitchenOrderService(super.database);

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
    calls.add(
      RecordedKitchenDispatch(
        invoiceId: invoiceId,
        invoiceNumber: invoiceNumber,
        items: List<CartItem>.from(items),
        buzzerNumber: buzzerNumber,
        customerName: customerName,
        waiterName: waiterName,
      ),
    );
    return [];
  }

  @override
  Future<void> updateTicketInvoiceNumber({
    required String ticketId,
    required String invoiceNumber,
  }) async {
    relabeledTicketIds.add(ticketId);
  }
}

class RecordingTableOrderService extends TableOrderService {
  final List<String> liquidatedTicketIds = [];

  RecordingTableOrderService(super.database);

  @override
  Future<HoldTicket> parkOrder({
    String? id,
    String? tableId,
    String? areaId,
    required String name,
    String? waiterId,
    String? waiterName,
    int guestCount = 1,
    bool isGlobalTaxExempt = false,
    required List<CartItem> items,
  }) async {
    return HoldTicket(
      id: id ?? 'ticket-parked',
      name: name,
      items: List<CartItem>.from(items),
      createdAt: DateTime.now(),
      tableId: tableId,
      areaId: areaId,
      waiterId: waiterId,
      waiterName: waiterName,
      guestCount: guestCount,
      isGlobalTaxExempt: isGlobalTaxExempt,
    );
  }

  @override
  Future<HoldTicket> replaceOrderItems({
    required String ticketId,
    required String name,
    required List<CartItem> items,
    required int expectedVersion,
  }) async {
    return HoldTicket(
      id: ticketId,
      name: name,
      items: List<CartItem>.from(items),
      createdAt: DateTime.now(),
      version: expectedVersion + 1,
    );
  }

  @override
  Future<List<HoldTicket>> getAllOpenOrders() async => [];

  @override
  Future<void> liquidateOrder(String ticketId) async {
    liquidatedTicketIds.add(ticketId);
  }
}

class FakeSalesRepository extends Fake implements SalesRepository {
  /// Issue #795/U2: the real repository assigns the DGI sequential number
  /// inside the saveSale fiscal transaction, so the persisted invoice NEVER
  /// keeps the in-memory 'PENDING' placeholder.
  static const String realInvoiceNumber = '001-001-01-00000005';

  Invoice? savedInvoice;
  List<InvoiceItem>? savedItems;
  List<Payment>? savedPayments;

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
    FulfillmentCheckoutContext? fulfillmentContext,
  }) async {
    // Simulate the fiscal transaction: the persisted invoice carries the
    // real sequential number, while the in-memory one still says 'PENDING'.
    savedInvoice = invoice.copyWith(number: realInvoiceNumber);
    savedItems = items;
    savedPayments = payments;
  }

  @override
  Future<Invoice?> getInvoiceById(String id) async {
    return savedInvoice?.id == id ? savedInvoice : null;
  }
}

class FakeInventoryRepository extends Fake implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => [];
}

class FakeAuthRepository extends Fake implements AuthRepository {
  User? currentUser;

  @override
  Future<User?> getCurrentUser() async => currentUser;
}

class FakeProductDao extends Fake implements ProductDao {
  final Map<String, ProductEntity> products = {};

  @override
  Future<ProductEntity?> findProductById(String id) async => products[id];
}

class FakeAuthorityProjectionDao extends Fake
    implements AuthorityProjectionDao {
  final Map<String, List<AuthorityRecipeVersionEntity>> versions = {};

  @override
  Future<List<AuthorityRecipeVersionEntity>> findActivePublishedVersions(
    String tenantId,
    String productId,
    String saleTime,
  ) async => versions[productId] ?? [];

  @override
  Future<List<AuthorityRecipeVersionComponentEntity>> findComponentsByVersion(
    String tenantId,
    String versionId,
  ) async => const [];

  @override
  Future<AuthorityInsumoEntity?> findInsumoById(
    String tenantId,
    String id,
  ) async => null;
}

class FakeLocalConfigDao extends Fake implements LocalConfigDao {
  // #67/T2a: the sale path fails closed without BOTH recorded FX rates, so
  // the checkout fixture seeds them.
  final Map<String, String> _configs = {
    'commercial_exchange_rate': '36.50',
    'bcn_official_exchange_rate': '36.6241',
  };

  @override
  Future<String?> getConfigValue(String? key) async => _configs[key];

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final value = _configs[key];
    if (value == null) return null;
    return LocalConfigEntity(key: key, value: value);
  }
}

class FakeAppDatabase extends Fake implements AppDatabase {
  final FakeProductDao _productDao = FakeProductDao();
  final FakeAuthorityProjectionDao _authorityDao = FakeAuthorityProjectionDao();
  final FakeLocalConfigDao _localConfigDao = FakeLocalConfigDao();

  @override
  ProductDao get productDao => _productDao;

  @override
  AuthorityProjectionDao get authorityProjectionDao => _authorityDao;

  @override
  LocalConfigDao get localConfigDao => _localConfigDao;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeSalesRepository fakeSalesRepo;
  late FakeAuthRepository fakeAuthRepo;
  late FakeAppDatabase fakeDb;
  late RecordingKitchenOrderService recordingKitchenService;
  late RecordingTableOrderService recordingTableOrderService;
  late SaleViewModel viewModel;

  const product = Product(
    id: 'prod-burger',
    sku: 'BURGER-1',
    name: 'Burger',
    uom: 'UNIT',
    sellPrice: 100.0,
    stock: 10,
    averageCost: 40.0,
    productType: 'SIMPLE',
  );

  setUp(() {
    fakeSalesRepo = FakeSalesRepository();
    fakeAuthRepo = FakeAuthRepository();
    fakeDb = FakeAppDatabase();

    fakeAuthRepo.currentUser = const User(
      id: 'user-cashier-1',
      name: 'Cashier 1',
      role: UserRole.cashier,
      isActive: true,
      tenantId: 'tenant-test',
    );

    recordingKitchenService = RecordingKitchenOrderService(fakeDb);
    recordingTableOrderService = RecordingTableOrderService(fakeDb);

    viewModel = SaleViewModel(
      fakeSalesRepo,
      FakeInventoryRepository(),
      fakeAuthRepo,
      fakeDb,
      recordingTableOrderService,
      false,
      null,
      recordingKitchenService,
    );
    viewModel.setCompanyTaxRegime(TaxRegime.regimenGeneral);
  });

  group('issue #785 — hold-ticket checkout kitchen dispatch parity', () {
    test(
      'RED: a sale resumed from a hold ticket dispatches to kitchen with the cart items and the issued invoice',
      () async {
        // 1. Build a cart and park it as a hold ticket.
        viewModel.addToCart(product);
        await viewModel.holdCurrentTicket('Mesa 1');
        expect(viewModel.cart, isEmpty);

        // 2. Recall the ticket exactly as the UI recall path does — this
        //    must set _activeLoadedHoldTicket.
        final ticket = HoldTicket(
          id: 'ticket-1',
          name: 'Mesa 1',
          items: const [],
          createdAt: DateTime.now(),
        );
        // The recalled cart is the ticket's stored contents; park one item.
        final loadedTicket = ticket.copyWith(
          items: [
            CartItem(
              productId: product.id,
              productName: product.name,
              quantity: 1,
              unitPrice: product.sellPrice,
              taxRate: product.effectiveTaxRate,
            ),
          ],
        );
        await viewModel.recallTicket(loadedTicket);
        expect(viewModel.activeLoadedHoldTicket, isNotNull);
        expect(viewModel.cart, hasLength(1));

        // 3. Commit the sale.
        await viewModel.processSale([PaymentMethod.cash]);

        // 4. The kitchen must have received exactly one dispatch carrying
        //    the cart and the issued invoice identity.
        expect(recordingKitchenService.calls, hasLength(1));
        final call = recordingKitchenService.calls.single;
        final invoice = fakeSalesRepo.savedInvoice;
        expect(invoice, isNotNull);
        expect(invoice!.number, FakeSalesRepository.realInvoiceNumber);
        // Issue #795/U2: the kitchen must receive the COMMITTED fiscal
        // number, never the in-memory 'PENDING' placeholder.
        expect(call.invoiceNumber, FakeSalesRepository.realInvoiceNumber);
        expect(call.invoiceNumber, isNot('PENDING'));
        expect(call.invoiceId, invoice.id);
        expect(call.items, hasLength(1));
        expect(call.items.single.productId, product.id);
        expect(call.buzzerNumber, isNull);
        expect(call.customerName, isNull);
        expect(call.waiterName, 'Cashier 1');

        // 4b. Issue #795/U2: the committed number is also relayed to any
        //     pre-existing 'PENDING'-labeled comanda for this invoice.
        expect(recordingKitchenService.relabeledTicketIds, [invoice.id]);

        // 5. Dispatch precedes liquidation: the hold ticket is liquidated
        //    after the kitchen comanda exists.
        expect(recordingTableOrderService.liquidatedTicketIds, ['ticket-1']);
      },
    );

    test(
      'parity: a direct (no hold) sale dispatches with the same argument shape',
      () async {
        viewModel.addToCart(product);
        await viewModel.processSale([PaymentMethod.cash]);

        expect(recordingKitchenService.calls, hasLength(1));
        final call = recordingKitchenService.calls.single;
        final invoice = fakeSalesRepo.savedInvoice;
        expect(invoice, isNotNull);
        expect(invoice!.number, FakeSalesRepository.realInvoiceNumber);
        // Issue #795/U2: direct sales get the real number too.
        expect(call.invoiceNumber, FakeSalesRepository.realInvoiceNumber);
        expect(call.invoiceNumber, isNot('PENDING'));
        expect(call.invoiceId, invoice.id);
        expect(call.items, hasLength(1));
        expect(call.items.single.productId, product.id);
        expect(call.waiterName, 'Cashier 1');
        expect(recordingTableOrderService.liquidatedTicketIds, isEmpty);
      },
    );

    test(
      'regression guard: a hold sale with an EMPTY cart must not dispatch',
      () async {
        // Recall a hold ticket with no stored items — the cart stays empty.
        final emptyTicket = HoldTicket(
          id: 'ticket-empty',
          name: 'Mesa 2',
          items: const [],
          createdAt: DateTime.now(),
        );
        await viewModel.recallTicket(emptyTicket);
        expect(viewModel.activeLoadedHoldTicket, isNotNull);
        expect(viewModel.cart, isEmpty);

        try {
          await viewModel.processSale([PaymentMethod.cash]);
        } catch (_) {
          // An empty-cart sale may be rejected downstream; the invariant
          // under test is only that the kitchen never receives a dispatch.
        }

        expect(recordingKitchenService.calls, isEmpty);
      },
    );
  });
}
