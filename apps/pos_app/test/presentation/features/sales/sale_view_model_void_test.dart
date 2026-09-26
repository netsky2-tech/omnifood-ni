import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'dart:convert';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';

import 'sale_view_model_void_test.mocks.dart';

@GenerateMocks([
  SalesRepository,
  InventoryRepository,
  AuthRepository,
  AppDatabase,
  CashierSessionDao,
  InvoiceDao,
  InvoiceItemDao,
  PaymentDao,
  HoldTicketDao,
  PromotionDao,
])
void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockCashierSessionDao mockSessionDao;
  late MockInvoiceDao mockInvoiceDao;
  late MockInvoiceItemDao mockItemDao;
  late MockPaymentDao mockPaymentDao;
  late MockHoldTicketDao mockHoldDao;
  late MockPromotionDao mockPromoDao;
  late FakeLocalConfigDao fakeLocalConfigDao;
  late MockPrinterAdapter printer;

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockSessionDao = MockCashierSessionDao();
    mockInvoiceDao = MockInvoiceDao();
    mockItemDao = MockInvoiceItemDao();
    mockPaymentDao = MockPaymentDao();
    fakeLocalConfigDao = FakeLocalConfigDao();
    printer = MockPrinterAdapter();

    when(mockDb.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDb.invoiceDao).thenReturn(mockInvoiceDao);
    when(mockDb.invoiceItemDao).thenReturn(mockItemDao);
    when(mockDb.paymentDao).thenReturn(mockPaymentDao);
    when(mockDb.localConfigDao).thenReturn(fakeLocalConfigDao);
    mockHoldDao = MockHoldTicketDao();
    mockPromoDao = MockPromotionDao();
    when(mockDb.holdTicketDao).thenReturn(mockHoldDao);
    when(mockDb.promotionDao).thenReturn(mockPromoDao);
    fakeLocalConfigDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
    );
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => null);
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockSessionDao.getActiveSessionForUserAndTerminal(any, any))
        .thenAnswer((_) async => null);
    when(mockHoldDao.getAllHoldTickets()).thenAnswer((_) async => []);
    when(mockPromoDao.getActivePromotions()).thenAnswer((_) async => []);
    when(mockPromoDao.getAllPromotions()).thenAnswer((_) async => []);
  });

  SaleViewModel buildViewModel() => SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
        null, // table order service
        true, // auto load
        FakeTenantConfigService(fakeLocalConfigDao),
        FakeKitchenOrderService(mockDb),
        null, // printer config service -> default, backed by the fake DAO
        printer,
      );

  String localDay(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  InvoiceEntity invoiceEntity({
    String userId = 'u-1',
    String? shiftId = 'shift-1',
    String? localIssueDate,
    DateTime? createdAt,
  }) =>
      InvoiceEntity(
        id: 'inv-void-target',
        number: '001-001-01-00000077',
        createdAt:
            (createdAt ?? DateTime.now()).millisecondsSinceEpoch,
        userId: userId,
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: false,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        shiftId: shiftId,
        localIssueDate: localIssueDate,
      );

  void arrangeAuthenticatedCashier() {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Carla Cajera',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-test',
      ),
    );
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal('u-1', 'pos-u-1'),
    ).thenAnswer(
      (_) async => CashierSessionEntity(
        id: 'shift-1',
        userId: 'u-1',
        terminalId: 'pos-u-1',
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
  }

  void arrangeCommittedVoid() {
    when(mockSalesRepo.voidInvoice(any, any,
        reasonDetail: anyNamed('reasonDetail'))).thenAnswer((_) async {});
    when(mockSalesRepo.getInvoiceById('inv-void-target')).thenAnswer(
      (_) async => Invoice(
        id: 'inv-void-target',
        number: '001-001-01-00000077',
        createdAt: DateTime.now(),
        userId: 'u-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: true,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      ),
    );
    when(mockItemDao.getItemsByInvoiceId('inv-void-target'))
        .thenAnswer((_) async => []);
    when(mockPaymentDao.getPaymentsByInvoiceId('inv-void-target'))
        .thenAnswer((_) async => []);
  }

  group('B1a-2 slice 2: voidInvoice under the D-15 guard', () {
    test('denies another cashier\'s invoice with the specific message (AC)',
        () async {
      arrangeAuthenticatedCashier();
      when(mockInvoiceDao.getInvoiceById('inv-void-target'))
          .thenAnswer((_) async => invoiceEntity(userId: 'u-2'));
      final vm = buildViewModel();

      final ok = await vm.voidInvoice('inv-void-target', 'OTRO');

      expect(ok, isFalse);
      expect(vm.errorMessage, VoidDecision.deniedOwnInvoice.uiMessage);
      verifyNever(mockSalesRepo.voidInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
    });

    test('denies cross-day voids with the D-14 admin-flow message (AC)',
        () async {
      arrangeAuthenticatedCashier();
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      when(mockInvoiceDao.getInvoiceById('inv-void-target')).thenAnswer(
        (_) async => invoiceEntity(
          localIssueDate: localDay(yesterday),
          createdAt: yesterday,
        ),
      );
      final vm = buildViewModel();

      final ok = await vm.voidInvoice('inv-void-target', 'OTRO');

      expect(ok, isFalse);
      expect(vm.errorMessage, VoidDecision.deniedCrossDay.uiMessage);
      verifyNever(mockSalesRepo.voidInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
    });

    test('denies another shift with the shift message', () async {
      arrangeAuthenticatedCashier();
      when(mockInvoiceDao.getInvoiceById('inv-void-target')).thenAnswer(
        (_) async => invoiceEntity(
          shiftId: 'shift-previous',
          localIssueDate: localDay(DateTime.now()),
        ),
      );
      final vm = buildViewModel();

      final ok = await vm.voidInvoice('inv-void-target', 'OTRO');

      expect(ok, isFalse);
      expect(vm.errorMessage, VoidDecision.deniedOtherShift.uiMessage);
    });

    test('waiter is denied with the permission message', () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-9',
          name: 'Waiter',
          role: UserRole.waiter,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      when(
        mockSessionDao.getActiveSessionForUserAndTerminal('u-9', 'pos-u-9'),
      ).thenAnswer((_) async => null);
      when(mockInvoiceDao.getInvoiceById('inv-void-target'))
          .thenAnswer((_) async => invoiceEntity());
      final vm = buildViewModel();

      final ok = await vm.voidInvoice('inv-void-target', 'OTRO');

      expect(ok, isFalse);
      expect(vm.errorMessage, VoidDecision.deniedNotPermitted.uiMessage);
      verifyNever(mockSalesRepo.voidInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
    });

    test('happy path: commits once with the structured reason and prints '
        'the ANULADO copy naming the voider (AC-2, AC-9, AC-10)', () async {
      arrangeAuthenticatedCashier();
      when(mockInvoiceDao.getInvoiceById('inv-void-target')).thenAnswer(
        (_) async =>
            invoiceEntity(localIssueDate: localDay(DateTime.now())),
      );
      arrangeCommittedVoid();
      final vm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      await vm.loadCompanyTaxRegime();

      final ok = await vm.voidInvoice('inv-void-target', 'CLIENTE_DESISTE',
          reasonDetail: 'Se fue sin consumir');

      expect(ok, isTrue);
      expect(vm.errorMessage, isNull);
      verify(mockSalesRepo.voidInvoice('inv-void-target', 'CLIENTE_DESISTE',
          reasonDetail: 'Se fue sin consumir')).called(1);
      // AC-10: the print path IS invoked on void.
      expect(printer.printHistory, hasLength(1));
      final printed = printer.printHistory.single.printedText ?? '';
      expect(printed, contains('DOCUMENTO ANULADO'));
      // AC-9: the printed copy carries the VOIDER's identity.
      expect(printed, contains('Carla Cajera'));
      expect(vm.lastVoidPrintSucceeded, isTrue);
    });

    test('print failure is honest: the void still commits and the UI is '
        'told the copy did not print (AC-10 honesty)', () async {
      arrangeAuthenticatedCashier();
      when(mockInvoiceDao.getInvoiceById('inv-void-target')).thenAnswer(
        (_) async =>
            invoiceEntity(localIssueDate: localDay(DateTime.now())),
      );
      arrangeCommittedVoid();
      printer.shouldFail = true;
      final vm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      await vm.loadCompanyTaxRegime();

      final ok = await vm.voidInvoice('inv-void-target', 'ERROR_DE_CAPTURA');

      expect(ok, isTrue, reason: 'the void itself committed locally');
      expect(vm.lastVoidPrintSucceeded, isFalse);
    });

    test('repository StateError (double void) surfaces the honest generic '
        'message', () async {
      arrangeAuthenticatedCashier();
      when(mockInvoiceDao.getInvoiceById('inv-void-target')).thenAnswer(
        (_) async =>
            invoiceEntity(localIssueDate: localDay(DateTime.now())),
      );
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail')))
          .thenThrow(StateError('already canceled'));
      final vm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      await vm.loadCompanyTaxRegime();

      final ok = await vm.voidInvoice('inv-void-target', 'OTRO');

      expect(ok, isFalse);
      expect(vm.errorMessage, 'No se pudo anular la factura.');
    });

    test('canVoidInvoice resolves through SalesPermission, not role labels',
        () async {
      // cashier: holds voidOwnCurrentShiftSale -> enabled.
      arrangeAuthenticatedCashier();
      final cashierVm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      expect(cashierVm.canVoidInvoice, isTrue);

      // waiter: no void capability -> disabled.
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-9',
          name: 'Waiter',
          role: UserRole.waiter,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      final waiterVm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      expect(waiterVm.canVoidInvoice, isFalse);

      // owner: holds voidAnyInvoice -> enabled.
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-2',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      final ownerVm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      expect(ownerVm.canVoidInvoice, isTrue);
    });
  });
  group('B1r/JD-A-002: the session carries the sale terminal', () {
    test('openSession persists the resolved deviceId, not a model default',
        () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-1',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      when(mockSessionDao.insertSession(any)).thenAnswer((_) async {});

      // Realistic device identity, not a shared fake constant.
      const deviceId = 'SUNMI-V2S-7F3A';
      final vm = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
        null,
        true,
        FakeTenantConfigService(fakeLocalConfigDao),
        FakeKitchenOrderService(mockDb),
        null, // printer config service
        printer,
        null, // sync service
        null, // promotions engine
        null, // loyalty service
        deviceId,
      );

      await vm.openSession(100);

      final captured =
          verify(mockSessionDao.insertSession(captureAny)).captured.single
              as CashierSessionEntity;
      expect(captured.terminalId, deviceId);
    });
  });

  group('B1r slice 2: reprintInvoice from the immutable snapshot', () {
    const snapshotHeader = {
      'businessName': 'Café Original',
      'ruc': 'A0011234567890',
      'fiscalAuthorizationNumber': 'AUT-DGI-2026-0001',
      'taxRegime': 'REGIMEN_GENERAL',
    };

    void arrangeReprintableOwner({bool printerFails = false}) {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-2',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      printer.shouldFail = printerFails;
      when(mockItemDao.getItemsByInvoiceId(any)).thenAnswer((_) async => []);
      when(mockPaymentDao.getPaymentsByInvoiceId(any))
          .thenAnswer((_) async => []);
      when(
        mockSalesRepo.prepareReprintInvoice(
          'inv-void-target',
          'PAPEL_ATASCADO',
          reasonDetail: anyNamed('reasonDetail'),
        ),
      ).thenAnswer(
        (_) async => ReprintPreparation(
          invoice: Invoice(
            id: 'inv-void-target',
            number: '001-001-01-00000077',
            createdAt: DateTime(2026, 9, 24, 12, 0),
            userId: 'u-1',
            subtotal: 100,
            totalTax: 15,
            total: 115,
            isCanceled: true,
            paymentStatus: PaymentStatus.paid,
            syncStatus: SyncStatus.pending,
            type: InvoiceType.regular,
          ),
          fiscalHeader: snapshotHeader,
          taxRegime: TaxRegime.regimenGeneral,
          items: const [],
          payments: const [],
        ),
      );
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail')))
          .thenAnswer((_) async {});
    }

    test('prints the canceled document with ANULADO and REIMPRESIÓN together '
        'and the snapshot header (D-13 heart through the VM)', () async {
      arrangeReprintableOwner();
      final vm = buildViewModel();
      await vm.loadCompanyTaxRegime();

      final ok = await vm.reprintInvoice('inv-void-target', 'PAPEL_ATASCADO',
          reasonDetail: 'Segunda impresión');
      expect(ok, isTrue);
      if (!vm.lastReprintPrintSucceeded) {
        fail('print failed: ' + (vm.lastPrintError ?? 'null') +
            ' history=' + printer.printHistory.length.toString());
      }
      expect(vm.errorMessage, isNull);
      expect(vm.lastReprintPrintSucceeded, isTrue);
      expect(printer.printHistory, hasLength(1));
      final printed = printer.printHistory.single.printedText ?? '';
      expect(printed, contains('*** DOCUMENTO ANULADO ***'));
      expect(printed, contains('*** REIMPRESIÓN ***'));
      // D-13 heart: the paper carries the SNAPSHOT header, not live config.
      expect(printed, contains('Café Original'));
      expect(printed, contains('AUT-DGI-2026-0001'));
    });

    test('R2-5: a COMPLETE snapshot reprints with ABSENT live tax_regime '
        '(purest D-13 heart)', () async {
      arrangeReprintableOwner();
      // A fresh config store with NO tax_regime row: the live regime is
      // genuinely absent. The snapshot must govern anyway (JD-B-003/R2-5).
      final freshConfigDao = FakeLocalConfigDao();
      freshConfigDao.saveConfig(
        LocalConfigEntity(key: 'tax_regime', value: ''),
      );
      final vm = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
        null,
        true,
        FakeTenantConfigService(freshConfigDao),
        FakeKitchenOrderService(mockDb),
        PrinterConfigService(freshConfigDao),
        printer,
      );
      expect(vm.companyTaxRegime, isNull,
          reason: 'precondition: the live regime is absent');

      final ok = await vm.reprintInvoice('inv-void-target', 'PAPEL_ATASCADO',
          reasonDetail: 'Segunda impresión');

      expect(ok, isTrue);
      expect(vm.lastReprintPrintSucceeded, isTrue);
      expect(printer.printHistory, hasLength(1));
      final printed = printer.printHistory.single.printedText ?? '';
      expect(printed, contains('*** REIMPRESIÓN ***'));
      // The snapshot regime renders: REGIMEN_GENERAL, not the CUOTA FIJA
      // that any live fallback would fabricate.
      expect(printed, contains('REGIMEN: GENERAL'));
      expect(printed, isNot(contains('REGIMEN: CUOTA FIJA')));
      expect(printed, contains('Café Original'));
    });

    test('denies a waiter with the permission message, engine untouched',
        () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-9',
          name: 'Waiter',
          role: UserRole.waiter,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      final vm = buildViewModel();

      final ok = await vm.reprintInvoice('inv-void-target', 'OTRO');

      expect(ok, isFalse);
      expect(vm.errorMessage, 'No tiene permiso para reimprimir comprobantes.');
      verifyNever(mockSalesRepo.prepareReprintInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
    });

    test('snapshot-unavailable denial maps to the actionable Spanish message',
        () async {
      when(mockAuthRepo.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-2',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
          tenantId: 'tenant-test',
        ),
      );
      when(
        mockSalesRepo.prepareReprintInvoice(any, any,
            reasonDetail: anyNamed('reasonDetail')),
      ).thenThrow(
        StateError(
          'REPRINT_SNAPSHOT_UNAVAILABLE: invoice predates the fiscal header snapshot',
        ),
      );
      final vm = buildViewModel();

      final ok = await vm.reprintInvoice('inv-void-target', 'VERIFICACION');

      expect(ok, isFalse);
      expect(vm.errorMessage, reprintSnapshotUnavailableMessage);
    });

    test('a failed print keeps the accepted reprint and reports it honestly',
        () async {
      arrangeReprintableOwner(printerFails: true);
      final vm = buildViewModel();
      await Future<void>.delayed(Duration.zero);
      await vm.loadCompanyTaxRegime();

      final ok = await vm.reprintInvoice('inv-void-target', 'PAPEL_ATASCADO');

      expect(ok, isTrue, reason: 'the request was accepted and audited');
      expect(vm.lastReprintPrintSucceeded, isFalse);
    });
  });

}



class FakeTenantConfigService extends TenantConfigService {
  FakeTenantConfigService(super.localConfigDao);

  @override
  Future<TenantConfig> getTenantConfig() async => const TenantConfig();

  @override
  Stream<TenantOperationMode> get onOperationModeChanged =>
      const Stream.empty();
}

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
  }) async =>
      const [];
}

class FakeLocalConfigDao extends Mock implements LocalConfigDao {
  final Map<String, String> _configs = {};

  @override
  Future<String?> getConfigValue(String? key) async => _configs[key];

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final val = _configs[key];
    if (val == null) return null;
    return LocalConfigEntity(key: key, value: val);
  }

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    _configs[config.key] = config.value;
  }
}
