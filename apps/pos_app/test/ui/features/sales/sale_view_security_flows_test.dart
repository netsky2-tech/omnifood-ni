import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/identity/supervisor_override_modal.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_security_flows_test.mocks.dart';

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
    when(mockViewModel.sessionExpected).thenReturn({
      PaymentMethod.cash: 100,
      PaymentMethod.card: 0,
      PaymentMethod.qr: 0,
    });
    when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => currentUser);
    when(mockAuthRepository.getAllUsers()).thenAnswer((_) async => [currentUser]);
    when(mockAuditRepository.logForensic(any, metadata: anyNamed('metadata'), metodoAutorizacion: anyNamed('metodoAutorizacion'), usuarioAutorizadorId: anyNamed('usuarioAutorizadorId')))
        .thenAnswer((_) async {});
  });

  Widget buildTestApp() {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
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
      metadata: 'close_box',
      metodoAutorizacion: 'PIN',
      usuarioAutorizadorId: 'supervisor-1',
    )).called(1);

    expect(find.text('Cierre de Caja - Arqueo'), findsOneWidget);
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
      metadata: 'close_box',
      metodoAutorizacion: 'TOTP',
      usuarioAutorizadorId: 'supervisor-totp',
    )).called(1);

    expect(find.text('Cierre de Caja - Arqueo'), findsOneWidget);
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
      metadata: argThat(contains('manual_drawer_open:Cambio para cliente'), named: 'metadata'),
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
      metadata: 'manual_discount',
      metodoAutorizacion: 'PIN',
      usuarioAutorizadorId: 'supervisor-1',
    )).called(1);
  });

  testWidgets('disables open cash action on box opening screen for waiter role', (tester) async {
    when(mockViewModel.activeSession).thenReturn(null);
    when(mockViewModel.canManageCashDrawer).thenReturn(false);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    final openCashButton = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'ABRIR CAJA'));
    expect(openCashButton.onPressed, isNull);

    await tester.tap(find.text('ABRIR CAJA'));
    await tester.pumpAndSettle();
    verifyNever(mockViewModel.openSession(any));
  });

}
