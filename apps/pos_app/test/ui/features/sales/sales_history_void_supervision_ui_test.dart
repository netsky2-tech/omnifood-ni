import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_modifier_entity.dart';
import 'package:pos_app/domain/models/config/supervision_policy.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/ui/features/identity/supervisor_override_modal.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'package:provider/provider.dart';

import 'sales_history_void_action_test.mocks.dart';

class FakeTenantConfigService extends TenantConfigService {
  final LocalConfigDao dao;
  FakeTenantConfigService(this.dao) : super(dao);
}

class FakeLocalConfigDao implements LocalConfigDao {
  final _storage = <String, LocalConfigEntity>{};

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async => _storage[key];

  @override
  Future<void> saveConfig(LocalConfigEntity entity) async {
    _storage[entity.key] = entity;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

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
  late TenantConfigService configService;

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
    configService = TenantConfigService(fakeLocalConfigDao);

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
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockHoldDao.getAllHoldTickets()).thenAnswer((_) async => []);
    when(mockPromoDao.getActivePromotions()).thenAnswer((_) async => []);
    when(mockPromoDao.getAllPromotions()).thenAnswer((_) async => []);
    when(mockItemDao.getItemsByInvoiceId(any)).thenAnswer((_) async => []);
    when(mockItemDao.getModifierRowsByInvoiceId(any))
        .thenAnswer((_) async => <InvoiceItemModifierEntity>[]);
    when(mockPaymentDao.getPaymentsByInvoiceId(any))
        .thenAnswer((_) async => []);
  });

  Invoice testInvoice({bool isCanceled = false, String userId = 'cajero-1'}) =>
      Invoice(
        id: 'inv-ui-10',
        number: '001-001-01-00000088',
        createdAt: DateTime.now(),
        userId: userId,
        subtotal: 200,
        totalTax: 30,
        total: 230,
        isCanceled: isCanceled,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

  void arrangeUser(UserRole role, {String id = 'cajero-1'}) {
    final user = User(
      id: id,
      name: role == UserRole.manager ? 'Roberto Manager' : 'Carlos Cajero',
      role: role,
      isActive: true,
      tenantId: 'tenant-test',
    );
    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => user);
    when(
      mockSessionDao.getActiveSessionForUserAndTerminal(any, any),
    ).thenAnswer(
      (inv) async => CashierSessionEntity(
        id: 'shift-1',
        userId: inv.positionalArguments[0] as String,
        terminalId: inv.positionalArguments[1] as String,
        openedAt: 1700000000000,
        isClosed: false,
      ),
    );
  }

  Future<SaleViewModel> pumpPanel(
    WidgetTester tester, {
    required Invoice invoice,
  }) async {
    final salesVm = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      null,
      true,
      configService,
      null,
      null,
      printer,
    );
    final historyVm = SalesHistoryViewModel(mockDb);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<AppDatabase>.value(value: mockDb),
          Provider<AuthRepository>.value(value: mockAuthRepo),
          Provider<TenantConfigService>.value(value: configService),
          ChangeNotifierProvider<SaleViewModel>.value(value: salesVm),
          ChangeNotifierProvider<SalesHistoryViewModel>.value(value: historyVm),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: InvoiceDetailsPanel(invoice: invoice),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return salesVm;
  }

  group('SalesHistoryView - Anulaciones con PIN de Supervisor Configurable', () {
    testWidgets(
        'Bajo Foodpark QSR (supervisorRequiredForVoid: false), cajero anula directamente sin pedir PIN',
        (tester) async {
      await configService.setOperationMode(TenantOperationMode.foodparkQsr);
      arrangeUser(UserRole.cashier);

      final invoice = testInvoice();
      when(mockInvoiceDao.getInvoiceById(invoice.id)).thenAnswer(
        (_) async => InvoiceEntity(
          id: invoice.id,
          number: invoice.number,
          createdAt: invoice.createdAt.millisecondsSinceEpoch,
          userId: invoice.userId,
          terminalId: 'pos-${invoice.userId}',
          shiftId: 'shift-1',
          subtotal: invoice.subtotal,
          totalTax: invoice.totalTax,
          total: invoice.total,
          isCanceled: false,
          paymentStatus: 'PAID',
          syncStatus: 'PENDING',
          type: 'REGULAR',
        ),
      );
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail'),
              supervisorId: anyNamed('supervisorId'),
              authMethod: anyNamed('authMethod')))
          .thenAnswer((_) async {});
      when(mockSalesRepo.getInvoiceById(invoice.id))
          .thenAnswer((_) async => invoice.copyWith(isCanceled: true));

      await pumpPanel(tester, invoice: invoice);

      // Presionar ANULAR FACTURA
      final voidButton = find.byKey(const Key('void_invoice_button'));
      expect(voidButton, findsOneWidget);
      await tester.tap(voidButton);
      await tester.pumpAndSettle();

      // Diálogo de motivo de anulación
      expect(find.text('Anular Factura'), findsOneWidget);
      // Seleccionar primer motivo (ERROR_DE_CAPTURA)
      await tester.tap(find.text('Error de captura').first);
      await tester.pumpAndSettle();

      // Confirmar anulación
      await tester.tap(find.byKey(const Key('confirm_void_button')));
      await tester.pumpAndSettle();

      // En Foodpark QSR NO debe abrirse modal de supervisor
      expect(find.byType(SupervisorOverrideModal), findsNothing);

      // voidInvoice fue invocado sin supervisorId
      verify(mockSalesRepo.voidInvoice(
        invoice.id,
        'ERROR_DE_CAPTURA',
        reasonDetail: null,
        supervisorId: null,
        authMethod: null,
      )).called(1);
    });

    testWidgets(
        'Bajo Restaurant (supervisorRequiredForVoid: true), cajero requiere PIN de supervisor para anular',
        (tester) async {
      await configService.setOperationMode(TenantOperationMode.restaurant);
      arrangeUser(UserRole.cashier);

      final invoice = testInvoice();
      when(mockInvoiceDao.getInvoiceById(invoice.id)).thenAnswer(
        (_) async => InvoiceEntity(
          id: invoice.id,
          number: invoice.number,
          createdAt: invoice.createdAt.millisecondsSinceEpoch,
          userId: invoice.userId,
          terminalId: 'pos-${invoice.userId}',
          shiftId: 'shift-1',
          subtotal: invoice.subtotal,
          totalTax: invoice.totalTax,
          total: invoice.total,
          isCanceled: false,
          paymentStatus: 'PAID',
          syncStatus: 'PENDING',
          type: 'REGULAR',
        ),
      );
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail'),
              supervisorId: anyNamed('supervisorId'),
              authMethod: anyNamed('authMethod')))
          .thenAnswer((_) async {});
      when(mockSalesRepo.getInvoiceById(invoice.id))
          .thenAnswer((_) async => invoice.copyWith(isCanceled: true));

      // Mock de autenticación para SupervisorOverrideModal
      when(mockAuthRepo.identifyByCredential(
        credential: anyNamed('credential'),
        policy: anyNamed('policy'),
        userId: anyNamed('userId'),
      )).thenAnswer((inv) async {
        final cred = inv.namedArguments[#credential] as String;
        if (cred == '9999') {
          return [
            const CredentialMatch(
              userId: 'manager-roberto',
              userName: 'Roberto Morales',
              userRole: 'MANAGER',
              isAuthorizingRole: true,
            ),
          ];
        }
        return [];
      });

      await pumpPanel(tester, invoice: invoice);

      // Presionar ANULAR FACTURA
      await tester.tap(find.byKey(const Key('void_invoice_button')));
      await tester.pumpAndSettle();

      // Seleccionar motivo
      await tester.tap(find.text('Error de captura').first);
      await tester.pumpAndSettle();

      // Confirmar anulación en el diálogo
      await tester.tap(find.byKey(const Key('confirm_void_button')));
      await tester.pumpAndSettle();

      // En Restaurant DEBE abrirse SupervisorOverrideModal
      expect(find.byType(SupervisorOverrideModal), findsOneWidget);

      // Ingresar PIN de supervisor 9999 en el campo del modal
      await tester.enterText(find.widgetWithText(TextField, 'Su PIN'), '9999');
      await tester.pumpAndSettle();

      // Presionar Autorizar
      await tester.tap(find.text('Autorizar'));
      await tester.pumpAndSettle();

      // Modal debe cerrarse y voidInvoice ser invocado con el ID del supervisor
      expect(find.byType(SupervisorOverrideModal), findsNothing);
      verify(mockSalesRepo.voidInvoice(
        invoice.id,
        'ERROR_DE_CAPTURA',
        reasonDetail: null,
        supervisorId: 'manager-roberto',
        authMethod: 'PIN',
      )).called(1);
    });

    testWidgets(
        'Bajo Restaurant, si el usuario autenticado ya es MANAGER, anula directo sin requerir PIN',
        (tester) async {
      await configService.setOperationMode(TenantOperationMode.restaurant);
      arrangeUser(UserRole.manager, id: 'manager-roberto');

      final invoice = testInvoice();
      when(mockInvoiceDao.getInvoiceById(invoice.id)).thenAnswer(
        (_) async => InvoiceEntity(
          id: invoice.id,
          number: invoice.number,
          createdAt: invoice.createdAt.millisecondsSinceEpoch,
          userId: invoice.userId,
          terminalId: 'pos-${invoice.userId}',
          shiftId: 'shift-1',
          subtotal: invoice.subtotal,
          totalTax: invoice.totalTax,
          total: invoice.total,
          isCanceled: false,
          paymentStatus: 'PAID',
          syncStatus: 'PENDING',
          type: 'REGULAR',
        ),
      );
      when(mockSalesRepo.voidInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail'),
              supervisorId: anyNamed('supervisorId'),
              authMethod: anyNamed('authMethod')))
          .thenAnswer((_) async {});
      when(mockSalesRepo.getInvoiceById(invoice.id))
          .thenAnswer((_) async => invoice.copyWith(isCanceled: true));

      await pumpPanel(tester, invoice: invoice);

      await tester.tap(find.byKey(const Key('void_invoice_button')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Error de captura').first);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('confirm_void_button')));
      await tester.pumpAndSettle();

      // No se solicita modal a quien ya es Manager
      expect(find.byType(SupervisorOverrideModal), findsNothing);

      verify(mockSalesRepo.voidInvoice(
        invoice.id,
        'ERROR_DE_CAPTURA',
        reasonDetail: null,
        supervisorId: null,
        authMethod: null,
      )).called(1);
    });
  });
}
