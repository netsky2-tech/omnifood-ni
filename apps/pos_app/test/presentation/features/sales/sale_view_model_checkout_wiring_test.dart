import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

class FakeSalesRepository extends Fake implements SalesRepository {
  Invoice? savedInvoice;
  List<InvoiceItem>? savedItems;
  List<Payment>? savedPayments;

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {
    savedInvoice = invoice;
    savedItems = items;
    savedPayments = payments;
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

class FakeAuthorityProjectionDao extends Fake implements AuthorityProjectionDao {
  final Map<String, List<AuthorityRecipeVersionEntity>> versions = {};
  final Map<String, List<AuthorityRecipeVersionComponentEntity>> components = {};
  final Map<String, AuthorityInsumoEntity> insumos = {};

  @override
  Future<List<AuthorityRecipeVersionEntity>> findActivePublishedVersions(
    String tenantId,
    String productId,
    String saleTime,
  ) async =>
      versions[productId] ?? [];

  @override
  Future<List<AuthorityRecipeVersionComponentEntity>> findComponentsByVersion(
    String tenantId,
    String versionId,
  ) async =>
      components[versionId] ?? [];

  @override
  Future<AuthorityInsumoEntity?> findInsumoById(
    String tenantId,
    String id,
  ) async =>
      insumos[id];
}

class FakeLocalConfigDao extends Fake implements LocalConfigDao {
  @override
  Future<String?> getConfigValue(String? key) async => null;
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
  late FakeSalesRepository fakeSalesRepo;
  late FakeInventoryRepository fakeInventoryRepo;
  late FakeAuthRepository fakeAuthRepo;
  late FakeAppDatabase fakeDb;
  late SaleViewModel viewModel;

  setUp(() {
    fakeSalesRepo = FakeSalesRepository();
    fakeInventoryRepo = FakeInventoryRepository();
    fakeAuthRepo = FakeAuthRepository();
    fakeDb = FakeAppDatabase();

    fakeAuthRepo.currentUser = const User(
      id: 'user-cashier-1',
      name: 'Cashier 1',
      role: UserRole.cashier,
      isActive: true,
      tenantId: 'tenant-test',
    );

    viewModel = SaleViewModel(
      fakeSalesRepo,
      fakeInventoryRepo,
      fakeAuthRepo,
      fakeDb,
      null,
      false,
    );
  });

  test('SaleViewModel.processSale prepares SALE_TIME_V1 authority snapshots before saveSale', () async {
    // 1. Setup cart with a prepared product
    final product = Product(
      id: 'prod-burger',
      sku: 'BURGER-1',
      name: 'Burger',
      uom: 'UNIT',
      sellPrice: 100.0,
      stock: 10,
      averageCost: 40.0,
      productType: 'PREPARED',
    );
    viewModel.addToCart(product);

    // 2. Seed product in FakeProductDao
    fakeDb._productDao.products['prod-burger'] = ProductEntity(
      id: 'prod-burger',
      name: 'Burger',
      uom: 'UNIT',
      stock: 10.0,
      averageCost: 40.0,
      sellPrice: 100.0,
      productType: 'PREPARED',
      tenantId: 'tenant-test',
    );

    // 3. Seed authority facts in FakeAuthorityProjectionDao
    fakeDb._authorityDao.versions['prod-burger'] = [
      const AuthorityRecipeVersionEntity(
        tenantId: 'tenant-test',
        id: 'rv-1',
        productId: 'prod-burger',
        versionNumber: 1,
        isActive: true,
        publicationState: 'PUBLISHED',
        effectiveFrom: '2026-01-01T00:00:00Z',
        yieldQuantity: 1.0,
        technicalShrinkPct: 0.0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      ),
    ];

    fakeDb._authorityDao.components['rv-1'] = [
      const AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-test',
        id: 'comp-1',
        versionId: 'rv-1',
        ordinal: 0,
        insumoId: 'ins-beef',
        grossQuantity: 0.2,
        technicalShrinkPct: 0.0,
        ingredientType: 'DIRECT',
        componentName: 'Beef',
      ),
    ];

    fakeDb._authorityDao.insumos['ins-beef'] = const AuthorityInsumoEntity(
      tenantId: 'tenant-test',
      id: 'ins-beef',
      name: 'Beef',
      uom: 'KG',
    );

    // 4. Execute processSale
    await viewModel.processSale([PaymentMethod.cash]);

    // 5. Verify saveSale received SALE_TIME_V1 prepared invoice and items
    final savedInvoice = fakeSalesRepo.savedInvoice;
    final savedItems = fakeSalesRepo.savedItems;

    expect(savedInvoice, isNotNull);
    expect(savedInvoice!.inventoryPolicyVersion, 'SALE_TIME_V1');
    expect(savedInvoice.inventoryOutcome, 'APPLIED');

    expect(savedItems, isNotNull);
    expect(savedItems!.length, 1);
    expect(savedItems.first.inventorySnapshotVersion, 'SALE_TIME_V1');
    expect(savedItems.first.inventorySnapshot, isNotNull);
    expect(savedItems.first.inventorySnapshot!.disposition.name, 'recipe');
    expect(savedItems.first.inventorySnapshot!.bindings.length, 1);
    expect(savedItems.first.inventorySnapshot!.bindings.first.insumoId, 'ins-beef');
  });
}
