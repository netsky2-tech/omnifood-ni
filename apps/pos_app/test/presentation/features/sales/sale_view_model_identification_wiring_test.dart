import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/customer_identification_adapters.dart';
import 'package:pos_app/data/daos/customer/customer_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';

import 'sale_view_model_loyalty_wiring_test.mocks.dart';

/// Local config DAO stub: the plain-constructor initializer list touches
/// `database.localConfigDao` but never calls into it with autoLoad disabled.
class _StubLocalConfigDao extends Mock implements LocalConfigDao {}

/// Production wiring test for finding M11 (slice 8b).
///
/// Before this slice, the plain `SaleViewModel` constructor hard-coded
/// `_identificationService = null`, so `identifyCustomer` returned null for
/// EVERY input in production — manual code entry included. These tests prove
/// that the plain constructor (the one main.dart uses) now accepts and uses
/// a real `CustomerIdentificationService` with the real adapter chain.
void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockCustomerDao mockCustomerDao;

  const testCustomerCode = 'ABC123';

  final testCustomerEntity = CustomerEntity(
    id: 'c-1',
    name: 'Carlos Test',
    phone: '87654321',
    email: null,
    address: null,
    pointsBalance: 0.0,
    isActive: true,
    customerCode: testCustomerCode,
    createdAt: DateTime.now().millisecondsSinceEpoch,
    updatedAt: DateTime.now().millisecondsSinceEpoch,
  );

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockCustomerDao = MockCustomerDao();

    when(mockDb.customerDao).thenReturn(mockCustomerDao);
    when(mockDb.localConfigDao).thenReturn(_StubLocalConfigDao());
  });

  /// Builds the VM exactly the way main.dart does: the PLAIN constructor,
  /// with the identification adapter chain injected as the last argument.
  SaleViewModel buildProductionStyleViewModel({
    CustomerIdentificationService? identificationService,
  }) {
    return SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      TableOrderService(mockDb),
      false, // autoLoad: false — no repository stubbing needed here.
      null, // tenantConfigService
      null, // kitchenOrderService
      null, // printerConfigService
      null, // printerPort
      null, // syncService
      null, // promotionsEngine
      null, // loyaltyService
      '', // terminalId
      identificationService, // M11: last positional arg, as in main.dart
    );
  }

  CustomerIdentificationService buildRealAdapterChain() {
    return CustomerIdentificationService([
      QrIdentificationAdapter(mockCustomerDao),
      CustomerCodeIdentificationAdapter(mockCustomerDao),
      PhoneIdentificationAdapter(mockCustomerDao),
      SearchIdentificationAdapter(mockCustomerDao),
    ]);
  }

  test(
      'plain production constructor accepts the identification service and '
      'identifies a customer from a QR payload (NHL1: prefix)', () async {
    when(mockCustomerDao.getCustomerByCode(any))
        .thenAnswer((_) async => testCustomerEntity);

    final vm = buildProductionStyleViewModel(
      identificationService: buildRealAdapterChain(),
    );

    final customer = await vm.identifyCustomer('NHL1:$testCustomerCode');

    expect(customer, isNotNull);
    expect(customer!.id, 'c-1');
    // Customer got selected as a side effect of identification.
    expect(vm.selectedCustomer?.id, 'c-1');
  });

  test(
      'existing manual code entry now reaches the adapter chain in the '
      'production wiring path (M11 gap closed for manual entry too)',
      () async {
    when(mockCustomerDao.getCustomerByCode(any))
        .thenAnswer((_) async => testCustomerEntity);

    final vm = buildProductionStyleViewModel(
      identificationService: buildRealAdapterChain(),
    );

    final customer = await vm.identifyCustomer(testCustomerCode);

    expect(customer, isNotNull);
    expect(customer!.id, 'c-1');
  });

  test('unrecognized codes surface as null to the dialog error state',
      () async {
    when(mockCustomerDao.getCustomerByCode(any)).thenAnswer((_) async => null);
    when(mockCustomerDao.getCustomerByPhone(any))
        .thenAnswer((_) async => null);
    when(mockCustomerDao.searchCustomers(any, any))
        .thenAnswer((_) async => []);

    final vm = buildProductionStyleViewModel(
      identificationService: buildRealAdapterChain(),
    );

    final customer = await vm.identifyCustomer('NHL1:ZZZ999');

    expect(customer, isNull);
  });

  test(
      'without an injected service the legacy behavior is unchanged: '
      'identifyCustomer returns null', () async {
    final vm = buildProductionStyleViewModel();

    final customer = await vm.identifyCustomer('NHL1:$testCustomerCode');

    expect(customer, isNull);
    verifyNever(mockCustomerDao.getCustomerByCode(any));
  });
}
