import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';

import 'sales_history_void_action_test.mocks.dart';

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
  late MockPrinterAdapter printer;
  late FakeLocalConfigDao fakeLocalConfigDao;

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockSessionDao = MockCashierSessionDao();
    mockInvoiceDao = MockInvoiceDao();
    mockItemDao = MockInvoiceItemDao();
    mockPaymentDao = MockPaymentDao();
    mockHoldDao = MockHoldTicketDao();
    mockPromoDao = MockPromotionDao();
    printer = MockPrinterAdapter();
    fakeLocalConfigDao = FakeLocalConfigDao();
    fakeLocalConfigDao.saveConfig(
      LocalConfigEntity(key: 'tax_regime', value: 'CUOTA_FIJA'),
    );

    when(mockDb.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDb.invoiceDao).thenReturn(mockInvoiceDao);
    when(mockDb.invoiceItemDao).thenReturn(mockItemDao);
    when(mockDb.paymentDao).thenReturn(mockPaymentDao);
    when(mockDb.localConfigDao).thenReturn(fakeLocalConfigDao);
    when(mockDb.holdTicketDao).thenReturn(mockHoldDao);
    when(mockDb.promotionDao).thenReturn(mockPromoDao);
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => null);
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockSessionDao.getActiveSessionForUserAndTerminal(any, any))
        .thenAnswer((_) async => null);
    when(mockHoldDao.getAllHoldTickets()).thenAnswer((_) async => []);
    when(mockPromoDao.getActivePromotions()).thenAnswer((_) async => []);
    when(mockPromoDao.getAllPromotions()).thenAnswer((_) async => []);
    when(mockItemDao.getItemsByInvoiceId(any)).thenAnswer((_) async => []);
    when(mockPaymentDao.getPaymentsByInvoiceId(any))
        .thenAnswer((_) async => []);
  });

  Invoice invoice({bool isCanceled = false, String userId = 'u-1'}) =>
      Invoice(
        id: 'inv-ui-1',
        number: '001-001-01-00000055',
        createdAt: DateTime(2026, 9, 24, 12, 0),
        userId: userId,
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: isCanceled,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

  void arrangeUser(UserRole role, {String id = 'u-1'}) {
    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => User(
        id: id,
        name: 'Operador',
        role: role,
        isActive: true,
        tenantId: 'tenant-test',
      ),
    );
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal(id, 'pos-$id'),
    ).thenAnswer(
      (_) async => CashierSessionEntity(
        id: 'shift-1',
        userId: id,
        terminalId: 'pos-$id',
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
  }

  Future<SaleViewModel> pumpPanel(
    WidgetTester tester, {
    required Invoice panelInvoice,
  }) async {
    final salesVm = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      true,
      FakeTenantConfigService(fakeLocalConfigDao),
      FakeKitchenOrderService(mockDb),
      null,
      printer,
    );
    final historyVm = SalesHistoryViewModel(mockDb);
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<SaleViewModel>.value(value: salesVm),
          ChangeNotifierProvider<SalesHistoryViewModel>.value(value: historyVm),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: InvoiceDetailsPanel(invoice: panelInvoice),
          ),
        ),
      ),
    );
    // Let the constructor's initial role load settle.
    await tester.pumpAndSettle();
    return salesVm;
  }

  group('AC-1: the ANULAR action follows the SalesPermission resolver', () {
    testWidgets('cashier sees it enabled (own-current-shift capability)',
        (tester) async {
      arrangeUser(UserRole.cashier);
      await pumpPanel(tester, panelInvoice: invoice());

      final button = find.byKey(const Key('void_invoice_button'));
      expect(button, findsOneWidget);
      final outlined =
          tester.widget<OutlinedButton>(find.byKey(const Key('void_invoice_button')));
      expect(outlined.onPressed, isNotNull);
    });

    testWidgets('owner sees it enabled (void.any capability)', (tester) async {
      arrangeUser(UserRole.owner);
      await pumpPanel(tester, panelInvoice: invoice());

      final outlined = tester.widget<OutlinedButton>(
        find.byKey(const Key('void_invoice_button')),
      );
      expect(outlined.onPressed, isNotNull);
    });

    testWidgets('waiter never sees it enabled (D-10: no void capability)',
        (tester) async {
      arrangeUser(UserRole.waiter);
      await pumpPanel(tester, panelInvoice: invoice());

      final outlined = tester.widget<OutlinedButton>(
        find.byKey(const Key('void_invoice_button')),
      );
      expect(outlined.onPressed, isNull);
    });
  });

  group('AC-3: a canceled invoice cannot be voided again', () {
    testWidgets('canceled invoices render no ANULAR action', (tester) async {
      arrangeUser(UserRole.owner);
      await pumpPanel(tester, panelInvoice: invoice(isCanceled: true));

      expect(find.byKey(const Key('void_invoice_button')), findsNothing);
      // The REALIZAR DEVOLUCIÓN action is equally absent (same rule).
      expect(find.text('REALIZAR DEVOLUCIÓN'), findsNothing);
      expect(find.text('ANULADA'), findsOneWidget);
    });
  });

  group('AC-2: the view model is invoked exactly once with a reason', () {
    testWidgets('confirm requires a selection before enabling ANULAR',
        (tester) async {
      arrangeUser(UserRole.owner);
      final vm = await pumpPanel(tester, panelInvoice: invoice());

      await tester.tap(find.byKey(const Key('void_invoice_button')));
      await tester.pumpAndSettle();

      final confirm = find.byKey(const Key('confirm_void_button'));
      expect(
        tester.widget<ElevatedButton>(confirm).onPressed,
        isNull,
        reason: 'no reason selected yet: the client-side mirror of the '
            'repository boundary keeps ANULAR disabled',
      );

      // #587 WU3: reason options render Spanish labels from the centralized
      // map; the raw controlled codes never reach the dialog.
      expect(find.text('Error de captura'), findsOneWidget);
      expect(find.text('ERROR_DE_CAPTURA'), findsNothing);

      await tester.tap(find.text('Error de captura'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<ElevatedButton>(confirm).onPressed,
        isNotNull,
      );
      // Sanity: nothing was committed by merely selecting a reason.
      verifyNever(mockSalesRepo.voidInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
      expect(vm.lastVoidPrintSucceeded, isFalse);
    });

    testWidgets(
        'confirm invokes the view model exactly once with the selected code',
        (tester) async {
      arrangeUser(UserRole.owner);
      when(mockInvoiceDao.getInvoiceById('inv-ui-1'))
          .thenAnswer((_) async => invoiceEntityForGuard(userId: 'u-1'));
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail')))
          .thenAnswer((_) async {});
      when(mockSalesRepo.getInvoiceById(any))
          .thenAnswer((_) async => invoice(isCanceled: true));
      when(mockInvoiceDao.getAllInvoices()).thenAnswer((_) async => []);
      final vm = await pumpPanel(tester, panelInvoice: invoice());
      await vm.loadCompanyTaxRegime();

      await tester.tap(find.byKey(const Key('void_invoice_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ticket duplicado'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Detalle (opcional)'),
        'Emitido dos veces por error',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_void_button')));
      await tester.pumpAndSettle();

      verify(mockSalesRepo.voidInvoice('inv-ui-1', 'TICKET_DUPLICADO',
              reasonDetail: 'Emitido dos veces por error'))
          .called(1);
    });

    testWidgets('success closes the dialog and refreshes the list',
        (tester) async {
      arrangeUser(UserRole.owner);
      when(mockInvoiceDao.getInvoiceById('inv-ui-1'))
          .thenAnswer((_) async => invoiceEntityForGuard(userId: 'u-1'));
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail')))
          .thenAnswer((_) async {});
      when(mockSalesRepo.getInvoiceById(any))
          .thenAnswer((_) async => invoice(isCanceled: true));
      when(mockInvoiceDao.getAllInvoices()).thenAnswer((_) async => []);
      final vm = await pumpPanel(tester, panelInvoice: invoice());
      await vm.loadCompanyTaxRegime();

      await tester.tap(find.byKey(const Key('void_invoice_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cliente desiste'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_void_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('confirm_void_button')), findsNothing,
          reason: 'the dialog closed on success');
      expect(find.text('Factura anulada. Se imprimió el comprobante ANULADO.'),
          findsOneWidget);
      verify(mockInvoiceDao.getAllInvoices()).called(greaterThanOrEqualTo(1));
    });

    testWidgets(
        'denial keeps the dialog open with the guard message and does not reload',
        (tester) async {
      arrangeUser(UserRole.cashier);
      // The invoice belongs to another cashier: deniedOwnInvoice.
      when(mockInvoiceDao.getInvoiceById('inv-ui-1'))
          .thenAnswer((_) async => invoiceEntityForGuard(userId: 'u-2'));
      final vm = await pumpPanel(tester, panelInvoice: invoice());

      await tester.tap(find.byKey(const Key('void_invoice_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Otro'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_void_button')));
      await tester.pumpAndSettle();

      // Dialog stays open; the specific guard message is shown.
      expect(find.byKey(const Key('confirm_void_button')), findsOneWidget);
      expect(find.text(VoidDecision.deniedOwnInvoice.uiMessage),
          findsOneWidget);
      verifyNever(mockSalesRepo.voidInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
      verifyNever(mockInvoiceDao.getAllInvoices());
      // The typed reason is preserved: the selection is still active.
      // The typed reason survives the denial: the radio selection is still
      // the OTRO code. (Generic widgets need the type argument in find.)
      expect(
        tester
            .widget<RadioListTile<String>>(
              find.ancestor(
                of: find.text('Otro'),
                matching: find.byType(RadioListTile<String>),
              ),
            )
            .groupValue,
        'OTRO',
      );
    });
  });
}

InvoiceEntity invoiceEntityForGuard({required String userId}) =>
    InvoiceEntity(
      id: 'inv-ui-1',
      number: '001-001-01-00000055',
      createdAt: DateTime.now().millisecondsSinceEpoch,
      userId: userId,
      subtotal: 100,
      totalTax: 15,
      total: 115,
      isCanceled: false,
      syncStatus: 'synced',
      paymentStatus: 'paid',
      type: 'regular',
      shiftId: 'shift-1',
      localIssueDate:
          '${DateTime.now().year.toString().padLeft(4, '0')}-'
          '${DateTime.now().month.toString().padLeft(2, '0')}-'
          '${DateTime.now().day.toString().padLeft(2, '0')}',
    );

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
