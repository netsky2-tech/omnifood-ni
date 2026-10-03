import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/identity/supervisor_override_modal.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:pos_app/ui/widgets/app_drawer.dart';
import 'package:provider/provider.dart';

import 'sale_view_security_flows_test.mocks.dart';

/// T7 (unified close): the sale screen's ⋮ Cerrar Caja entry now runs the
/// Corte Z pre-gate + blind-count dialog from the ROOT CashShiftViewModel.
/// This stub replaces the database-backed VM so widget tests stay isolated.
class _StubSessionDao implements CashierSessionDao {
  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

class _StubMovementDao implements CashMovementDao {
  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

class _StubPaymentDao implements PaymentDao {
  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

class _StubCashShiftViewModel extends CashShiftViewModel {
  _StubCashShiftViewModel({this.stubbedPendingVouchers = 0})
      : super(
          sessionDao: _StubSessionDao(),
          movementDao: _StubMovementDao(),
          paymentDao: _StubPaymentDao(),
        );

  final int stubbedPendingVouchers;

  @override
  Future<void> init() async {}

  @override
  int get pendingVouchersCount => stubbedPendingVouchers;

  @override
  bool get hasPendingVouchers => stubbedPendingVouchers > 0;
}

@GenerateNiceMocks([
  MockSpec<SaleViewModel>(),
  MockSpec<AuthRepository>(),
  MockSpec<AuditRepository>(),
  MockSpec<SyncService>(),
])
void main() {
  late MockSaleViewModel mockViewModel;
  late MockAuthRepository mockAuthRepository;
  late MockAuditRepository mockAuditRepository;
  late MockSyncService mockSyncService;

  final activeSession = CashierSession(
    id: 'session-1',
    userId: 'cashier-1',
    openedAt: DateTime(2026, 1, 1),
    tipoModelo: CashSessionModel.cajaCentral,
    openingBalance: 100,
  );

  final currentUser = const User(
    id: 'cashier-1',
    name: 'Cashier',
    role: UserRole.cashier,
    isActive: true,
  );

  setUp(() {
    mockViewModel = MockSaleViewModel();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.filteredProducts).thenReturn([]);
    when(mockViewModel.cart).thenReturn([]);
    when(mockViewModel.canManageCashDrawer).thenReturn(true);
    when(mockViewModel.currentUserRole).thenReturn(UserRole.cashier);
    when(mockViewModel.total).thenReturn(0.0);
    when(mockViewModel.grandTotalWithTip).thenReturn(0.0);
    when(mockViewModel.tipAmount).thenReturn(0.0);
    when(mockViewModel.subtotal).thenReturn(0.0);
    when(mockViewModel.totalTax).thenReturn(0.0);
    when(mockViewModel.totalDiscounts).thenReturn(0.0);
    when(mockViewModel.isGlobalTaxExempt).thenReturn(false);
    when(mockViewModel.supportsTables).thenReturn(false);
    when(mockViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockViewModel.businessModeEvaluator).thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => currentUser);
    when(mockAuthRepository.getAllUsers()).thenAnswer((_) async => [currentUser]);
    when(mockAuditRepository.logForensic(any, metadata: anyNamed('metadata'), metodoAutorizacion: anyNamed('metodoAutorizacion'), usuarioAutorizadorId: anyNamed('usuarioAutorizadorId')))
        .thenAnswer((_) async {});
  });

  Widget buildTestApp({CashShiftViewModel? cashViewModel}) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        ChangeNotifierProvider<CashShiftViewModel>.value(
          value: cashViewModel ?? _StubCashShiftViewModel(),
        ),
        Provider<AuthRepository>.value(value: mockAuthRepository),
        Provider<AuditRepository>.value(value: mockAuditRepository),
        Provider<SyncService>.value(value: mockSyncService),
      ],
      child: const MaterialApp(home: SaleView()),
    );
  }

  testWidgets('presents supervisor override modal before close-box restricted action', (tester) async {
    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Cerrar Caja'));
    await tester.pumpAndSettle();

    expect(find.text('Autorización de supervisor'), findsOneWidget);

    final fields = find.descendant(
      of: find.byType(AlertDialog).first,
      matching: find.byType(TextField),
    );
    await tester.enterText(fields.at(0), 'supervisor-1');
    await tester.enterText(fields.at(1), '1234');
    await tester.tap(find.text('Autorizar'));
    await tester.pumpAndSettle();

    verify(mockAuthRepository.authorizeOverride(
      supervisorId: 'supervisor-1',
      pin: '1234',
      totpCode: null,
    )).called(1);
    verify(mockAuditRepository.logForensic(
      'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
      metadata: argThat(contains('close_box'), named: 'metadata'),
      metodoAutorizacion: 'PIN',
      usuarioAutorizadorId: 'supervisor-1',
    )).called(1);

    // T7 (unified close): the supervisor override now opens the Corte Z
    // blind-count dialog, not the retired weak arqueo dialog.
    expect(find.text('Arqueo Ciego y Cierre de Turno'), findsOneWidget);
    expect(find.text('Cierre de Caja - Arqueo'), findsNothing);
  });

  testWidgets('pending card vouchers block the close from the sale-screen entry too', (tester) async {
    // The voucher gate used to be reachable only through Control de Caja;
    // the ⋮ entry was a side door around it. T7 routes both through the
    // same Corte Z pre-gate.
    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.pumpWidget(buildTestApp(
      cashViewModel: _StubCashShiftViewModel(stubbedPendingVouchers: 2),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Cerrar Caja'));
    await tester.pumpAndSettle();

    expect(find.text('Autorización de supervisor'), findsOneWidget);
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'ID supervisor';
    }), 'supervisor-1');
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'PIN';
    }), '1234');
    await tester.tap(find.text('Autorizar'));
    await tester.pumpAndSettle();

    expect(find.text('Bloqueo de Corte Z Fiscal'), findsOneWidget);
    expect(find.text('IR A RECONCILIACIÓN'), findsOneWidget);
    expect(find.text('Arqueo Ciego y Cierre de Turno'), findsNothing);
  });

  testWidgets('checkout dialog renders Spanish payment method labels, not raw enum names', (tester) async {
    when(mockViewModel.total).thenReturn(115.0);
    when(mockViewModel.grandTotalWithTip).thenReturn(115.0);
    when(mockViewModel.tipAmount).thenReturn(0.0);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        ],
        child: const MaterialApp(
          home: Scaffold(body: CheckoutDialog()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Efectivo'), findsOneWidget);
    expect(find.text('Tarjeta'), findsOneWidget);
    expect(find.text('Código QR'), findsOneWidget);
    expect(find.text('CASH'), findsNothing);
    expect(find.text('CARD'), findsNothing);
    expect(find.text('QR'), findsNothing);
  });

  testWidgets('authorizes close-box restricted action offline using TOTP and preserves audit callback path', (tester) async {
    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Cerrar Caja'));
    await tester.pumpAndSettle();

    expect(find.text('Autorización de supervisor'), findsOneWidget);
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'ID supervisor';
    }), 'supervisor-totp');

    await tester.tap(find.byType(DropdownButtonFormField<SupervisorAuthorizationMethod>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('TOTP').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'Código TOTP';
    }), '654321');
    await tester.tap(find.text('Autorizar'));
    await tester.pumpAndSettle();

    verify(mockAuthRepository.authorizeOverride(
      supervisorId: 'supervisor-totp',
      pin: null,
      totpCode: '654321',
    )).called(1);
    verify(mockAuditRepository.logForensic(
      'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
      metadata: argThat(contains('close_box'), named: 'metadata'),
      metodoAutorizacion: 'TOTP',
      usuarioAutorizadorId: 'supervisor-totp',
    )).called(1);

    expect(find.text('Arqueo Ciego y Cierre de Turno'), findsOneWidget);
    expect(find.text('Cierre de Caja - Arqueo'), findsNothing);
  });

  testWidgets('requires supervisor + justification and logs DRAWER_OPENED_MANUALLY', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.tap(find.byTooltip('Abrir Gaveta Manual'));
    await tester.pumpAndSettle();

    expect(find.text('Justificación requerida'), findsOneWidget);
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'Motivo de apertura manual';
    }), 'Cambio para cliente');
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();

    expect(find.text('Autorización de supervisor'), findsOneWidget);
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'ID supervisor';
    }), 'supervisor-1');
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'PIN';
    }), '1234');
    await tester.tap(find.text('Autorizar'));
    await tester.pumpAndSettle();

    verify(mockAuditRepository.logForensic(
      'DRAWER_OPENED_MANUALLY',
      metadata: argThat(contains('manual_drawer_open'), named: 'metadata'),
      metodoAutorizacion: 'PIN',
      usuarioAutorizadorId: 'supervisor-1',
    )).called(1);
  });

  testWidgets('triggers supervisor modal for gated manual discount action', (tester) async {
    when(mockViewModel.cart).thenReturn([
      CartItem(
        productId: 'p-1',
        productName: 'Producto',
        quantity: 1,
        unitPrice: 20,
        taxRate: 0.15,
      ),
    ]);
    when(mockViewModel.errorMessage).thenReturn('Acceso denegado.');
    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('DESCUENTO MANUAL'));
    await tester.pumpAndSettle();

    expect(find.text('Descuento manual'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, '10');
    await tester.tap(find.text('Aplicar'));
    await tester.pumpAndSettle();

    expect(find.text('Autorización de supervisor'), findsOneWidget);
  });

  testWidgets('authorizes discount override and retries discount with one-transaction VM semantics', (tester) async {
    when(mockViewModel.cart).thenReturn([
      CartItem(
        productId: 'p-1',
        productName: 'Producto',
        quantity: 1,
        unitPrice: 20,
        taxRate: 0.15,
      ),
    ]);
    when(mockViewModel.errorMessage).thenReturn('Acceso denegado.');
    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('DESCUENTO MANUAL'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '10');
    await tester.tap(find.text('Aplicar'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'ID supervisor';
    }), 'supervisor-1');
    await tester.enterText(find.byWidgetPredicate((widget) {
      return widget is TextField && widget.decoration?.labelText == 'PIN';
    }), '1234');
    await tester.tap(find.text('Autorizar'));
    await tester.pumpAndSettle();

    verify(mockViewModel.applyManualDiscount(10.0)).called(2);
    verify(mockViewModel.grantSupervisorOverride()).called(1);
    verify(mockAuditRepository.logForensic(
      'SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT',
      metadata: argThat(contains('manual_discount'), named: 'metadata'),
      metodoAutorizacion: 'PIN',
      usuarioAutorizadorId: 'supervisor-1',
    )).called(1);
  });

  testWidgets('disables open cash action on box opening screen for waiter role', (tester) async {
    when(mockViewModel.activeSession).thenReturn(null);
    when(mockViewModel.currentUserRole).thenReturn(UserRole.waiter);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    final openCashButton = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'ABRIR CAJA'));
    expect(openCashButton.onPressed, isNull);

    await tester.tap(find.text('ABRIR CAJA'));
    await tester.pumpAndSettle();
    verifyNever(mockViewModel.openSession(any));
  });

  testWidgets('keeps sales shell drawer accessible when there is no active session', (tester) async {
    when(mockViewModel.activeSession).thenReturn(null);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(find.byType(Scaffold), findsOneWidget);
    expect(find.text('APERTURA DE CAJA'), findsOneWidget);

    final scaffoldState = tester.state<ScaffoldState>(find.byType(Scaffold));
    scaffoldState.openDrawer();
    await tester.pumpAndSettle();

    expect(find.byType(AppDrawer), findsOneWidget);
    expect(find.text('INVENTARIO'), findsOneWidget);
    expect(find.text('Inventario BOH'), findsOneWidget);
  });

  testWidgets('allows cashier to open session from box opening screen', (tester) async {
    when(mockViewModel.activeSession).thenReturn(null);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    final openCashButton = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'ABRIR CAJA'));
    expect(openCashButton.onPressed, isNotNull);

    await tester.tap(find.text('ABRIR CAJA'));
    await tester.pump();

    // D-21: the box-opening screen now sends both floats; empty fields
    // parse to 0.0 for each currency.
    verify(mockViewModel.openSession(0, balanceUsd: 0.0)).called(1);
  });

}
