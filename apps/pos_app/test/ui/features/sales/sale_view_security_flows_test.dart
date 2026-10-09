import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/domain/models/sales/promotion.dart';
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
  _StubCashShiftViewModel({
    this.stubbedPendingVouchers = 0,
    this.stubbedOpenAccounts = const [],
  }) : super(
          sessionDao: _StubSessionDao(),
          movementDao: _StubMovementDao(),
          paymentDao: _StubPaymentDao(),
        );

  final int stubbedPendingVouchers;
  final List<HoldTicket> stubbedOpenAccounts;

  @override
  Future<void> init() async {}

  @override
  int get pendingVouchersCount => stubbedPendingVouchers;

  @override
  bool get hasPendingVouchers => stubbedPendingVouchers > 0;

  // T8 (cuentas abiertas): the stub answers the same getters the block
  // dialog and the gate read, mirroring the pendingVouchers stubbing above.
  // The stubbed state is fully declared here — nothing is unverifiable —
  // so the pre-gate treats it as a verified read.
  @override
  bool get openAccountsVerified => true;

  @override
  List<HoldTicket> get openAccounts => stubbedOpenAccounts;

  @override
  bool get hasOpenAccounts => stubbedOpenAccounts.isNotEmpty;

  @override
  int get openAccountsCount => stubbedOpenAccounts.length;

  @override
  double get openAccountsTotalNio => stubbedOpenAccounts.fold(
      0.0, (sum, t) => sum + t.items.fold(0.0, (s, i) => s + i.grossAmount));
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

  testWidgets(
    'CartSummary reports the discount breakdown honestly and reconciles with TOTAL (SOHO-P3)',
    (tester) async {
      when(mockViewModel.cart).thenReturn([
        const CartItem(
          productId: 'p-1',
          productName: 'Producto 1',
          quantity: 1,
          unitPrice: 155,
          taxRate: 0.15,
        ),
      ]);
      // Components: manual 30 + promo 15 + loyalty 10 = totalDiscounts 55.
      // Gross row prints subtotal + totalDiscounts = 160.00; IVA 24.00;
      // TOTAL must reconcile: 160 - 30 - 15 - 10 + 24 = 129.00.
      when(mockViewModel.subtotal).thenReturn(105.0);
      when(mockViewModel.totalDiscounts).thenReturn(55.0);
      when(mockViewModel.manualDiscount).thenReturn(30.0);
      when(mockViewModel.promoDiscounts).thenReturn(15.0);
      when(mockViewModel.loyaltyDiscount).thenReturn(10.0);
      when(mockViewModel.totalTax).thenReturn(24.0);
      when(mockViewModel.total).thenReturn(129.0);
      when(mockViewModel.grossSubtotal).thenReturn(160.0);
      when(mockViewModel.companyTaxRegime).thenReturn(null);

      // The default 800x600 test surface renders the cart panel ~335px wide;
      // under the Ahem test font every glyph is fontSize wide, which overflows
      // rows that fit easily with real fonts. Halve the text scale for layout.
      tester.platformDispatcher.textScaleFactorTestValue = 0.5;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(find.text('Descuento manual'), findsOneWidget);
      expect(find.text('-C\$ 30.00'), findsOneWidget);
      expect(find.text('Promociones'), findsOneWidget);
      expect(find.text('-C\$ 15.00'), findsOneWidget);
      expect(find.text('Descuento por puntos'), findsOneWidget);
      expect(find.text('-C\$ 10.00'), findsOneWidget);
      // The aggregate row that misreported manual discounts as promotions is
      // gone.
      expect(find.text('Descuentos (Promos)'), findsNothing);

      // Display reconciliation: the printed gross row (subtotal +
      // totalDiscounts = 160.00) minus the three rendered discount rows plus
      // the rendered IVA row must equal the printed TOTAL (129.00). Without
      // the loyalty row this panel no longer adds up to TOTAL.
      expect(find.text('C\$ 160.00'), findsOneWidget);
      expect(find.text('C\$ 24.00'), findsOneWidget);
      expect(find.text('C\$ 129.00'), findsOneWidget);
      const renderedDiscounts = 30.0 + 15.0 + 10.0;
      const expectedTotal = 160.0 - renderedDiscounts + 24.0;
      expect(expectedTotal, 129.0);
    },
  );

  testWidgets(
    'CartSummary prints the TRUE gross and TOTAL 0 when the discount aggregate is clamped (SOHO-P3)',
    (tester) async {
      when(mockViewModel.cart).thenReturn([
        const CartItem(
          productId: 'p-1',
          productName: 'Producto 1',
          quantity: 1,
          unitPrice: 155,
          taxRate: 0.15,
        ),
      ]);
      // Stale redemption after the cart shrank: the raw aggregate (205)
      // exceeds the true gross (200); the fiscal calculator clamps it, so
      // subtotal and total collapse to 0. The gross row must still print the
      // TRUE gross, not subtotal + totalDiscounts (the lying 205.00).
      when(mockViewModel.grossSubtotal).thenReturn(200.0);
      when(mockViewModel.subtotal).thenReturn(0.0);
      when(mockViewModel.totalDiscounts).thenReturn(205.0);
      when(mockViewModel.manualDiscount).thenReturn(15.0);
      when(mockViewModel.promoDiscounts).thenReturn(100.0);
      when(mockViewModel.loyaltyDiscount).thenReturn(90.0);
      when(mockViewModel.totalTax).thenReturn(0.0);
      when(mockViewModel.total).thenReturn(0.0);
      when(mockViewModel.companyTaxRegime).thenReturn(null);

      tester.platformDispatcher.textScaleFactorTestValue = 0.5;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(find.text('Descuento manual'), findsOneWidget);
      expect(find.text('-C\$ 15.00'), findsOneWidget);
      expect(find.text('Promociones'), findsOneWidget);
      expect(find.text('-C\$ 100.00'), findsOneWidget);
      expect(find.text('Descuento por puntos'), findsOneWidget);
      expect(find.text('-C\$ 90.00'), findsOneWidget);

      // The gross row is the source of truth.
      expect(find.text('C\$ 200.00'), findsOneWidget);
      expect(find.text('C\$ 205.00'), findsNothing);

      // TOTAL is clamped to 0, and the rendered rows expose the
      // over-discount: 200 - (15 + 100 + 90) = -5, i.e. no positive amount
      // can reconcile; the discount rows plus IVA (hidden, 0) reconcile
      // against the true gross only through the clamp.
      expect(find.text('C\$ 0.00'), findsOneWidget);
      const overDiscount = 200.0 - (15.0 + 100.0 + 90.0);
      expect(overDiscount <= 0, isTrue);
    },
  );

  testWidgets(
    'manual discount prompt shows the configured cap BEFORE typing (SOHO-P3 S1b)',
    (tester) async {
      when(mockViewModel.cart).thenReturn([
        const CartItem(
          productId: 'p-1',
          productName: 'Producto 1',
          quantity: 1,
          unitPrice: 155,
          taxRate: 0.15,
        ),
      ]);
      // The view refreshes the caps (D-5 style freshness) before opening the
      // prompt, then renders the effective limit next to the amount field.
      when(mockViewModel.loadDiscountCaps()).thenAnswer((_) async {});
      when(mockViewModel.manualDiscountLimitLabel)
          .thenReturn('Límite de descuento manual: C\$ 40.00 (por monto)');

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('DESCUENTO MANUAL'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('manual_discount_limit_label')), findsOneWidget);
      expect(find.textContaining('Límite de descuento manual'), findsOneWidget);
      // The prompt still offers the existing flow (amount field + Aplicar).
      expect(find.text('Monto de descuento'), findsOneWidget);
      expect(find.text('Aplicar'), findsOneWidget);
    },
  );

  group('manual discount prompt carries the cap verdict inline (device defect)', () {
    // Device-reported defect (P3): the operator typed C$ 30 on a C$ 230 cart
    // with caps C$ 50 / 10% configured; the refusal reached only the
    // ScaffoldMessenger SnackBar behind the cart bottom sheet, so nothing
    // appeared anywhere and the dialog closed. The prompt itself must now
    // carry the verdict INLINE and stay open, evaluating the amount with the
    // SAME rule the view model enforces (DiscountPolicyService + the view
    // model's exposed caps/subtotal/accumulated discount).
    const expectedRejection =
        'Descuento no permitido: el límite manual es C\$ 23.00 (10% del subtotal, política del negocio por porcentaje).';

    void stubCaps() {
      when(mockViewModel.cart).thenReturn([
        const CartItem(
          productId: 'p-1',
          productName: 'Producto 1',
          quantity: 1,
          unitPrice: 230,
          taxRate: 0,
        ),
      ]);
      when(mockViewModel.loadDiscountCaps()).thenAnswer((_) async {});
      when(mockViewModel.maxDiscountAmountCap).thenReturn(50.0);
      when(mockViewModel.maxDiscountPercentCap).thenReturn(10.0);
      when(mockViewModel.grossSubtotal).thenReturn(230.0);
      when(mockViewModel.manualDiscount).thenReturn(0.0);
      when(mockViewModel.manualDiscountLimitLabel).thenReturn(
        'Límite de descuento manual: C\$ 50.00 por monto · 10% del subtotal',
      );
    }

    Future<void> openPromptAndType(WidgetTester tester, String amount) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();
      await tester.tap(find.text('DESCUENTO MANUAL'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byWidgetPredicate(
          (widget) =>
              widget is TextField &&
              widget.decoration?.labelText == 'Monto de descuento',
        ),
        amount,
      );
    }

    testWidgets(
      'over-cap amount is refused INLINE inside the dialog and the dialog stays open',
      (tester) async {
        stubCaps();
        await openPromptAndType(tester, '30');
        await tester.tap(find.text('Aplicar'));
        await tester.pumpAndSettle();

        // The dialog did NOT close: the cashier can correct or cancel.
        expect(find.text('Descuento manual'), findsOneWidget);
        expect(find.text('Aplicar'), findsOneWidget);

        // The verdict renders INLINE in the dialog (a descendant of the
        // AlertDialog route — not a SnackBar on the scaffold behind the
        // cart sheet) and names the effective limit and the binding cap.
        final rejection = find.text(expectedRejection);
        expect(rejection, findsOneWidget);
        expect(
          find.descendant(of: find.byType(AlertDialog), matching: rejection),
          findsOneWidget,
        );
        expect(find.byType(SnackBar), findsNothing);

        // The refusal is real: nothing reached the view model.
        verifyNever(mockViewModel.applyManualDiscount(any));
      },
    );

    testWidgets(
      'amount WITHIN the cap closes the dialog and applies the discount',
      (tester) async {
        stubCaps();
        await openPromptAndType(tester, '20');
        await tester.tap(find.text('Aplicar'));
        await tester.pumpAndSettle();

        expect(find.text('Descuento manual'), findsNothing);
        verify(mockViewModel.applyManualDiscount(20.0)).called(1);
      },
    );

    testWidgets(
      'boundary: an amount EQUAL to the effective cap is accepted and applied',
      (tester) async {
        // 10% of C$ 230.00 = C$ 23.00, the binding effective cap (below the
        // C$ 50 amount cap). The rule allows <= the cap — the same ≤
        // comparison the view model enforces, so the inline pre-check cannot
        // refuse what the enforcement would accept.
        stubCaps();
        await openPromptAndType(tester, '23');
        await tester.tap(find.text('Aplicar'));
        await tester.pumpAndSettle();

        expect(find.text('Descuento manual'), findsNothing);
        verify(mockViewModel.applyManualDiscount(23.0)).called(1);
      },
    );

    testWidgets(
      'boundary: one cent ABOVE the effective cap is refused inline',
      (tester) async {
        stubCaps();
        await openPromptAndType(tester, '23.01');
        await tester.tap(find.text('Aplicar'));
        await tester.pumpAndSettle();

        expect(find.text('Descuento manual'), findsOneWidget);
        expect(find.text(expectedRejection), findsOneWidget);
        verifyNever(mockViewModel.applyManualDiscount(any));
      },
    );

    testWidgets(
      'ACCUMULATED base: an amount under the cap in isolation but over it SUMMED is refused inline (DD-3 anchor)',
      (tester) async {
        // The cashier already holds a C$ 20 manual discount; the effective
        // cap is C$ 23 (10% of the C$ 230 gross, below the C$ 50 amount
        // cap). Typing C$ 10 is under the cap IN ISOLATION but 20+10=30 is
        // over it — the pre-check must feed the view model's accumulated
        // discount (DD-3) exactly like the enforcement does, or this
        // over-cap request would close the dialog and the view model's
        // refusal would land on the SnackBar hidden behind the cart sheet:
        // the device defect again, on the accumulated path. This test fails
        // under the mutation `accumulatedManualDiscount: 0.0`.
        // With a non-zero manual discount the cart panel renders the
        // 'Descuento manual' row, which overflows under the Ahem test font
        // at full scale — the same known artifact the CartSummary tests in
        // this file mitigate with halved text scale.
        tester.platformDispatcher.textScaleFactorTestValue = 0.5;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        stubCaps();
        when(mockViewModel.manualDiscount).thenReturn(20.0);
        await openPromptAndType(tester, '10');
        await tester.tap(find.text('Aplicar'));
        await tester.pumpAndSettle();

        // The dialog did NOT close: the cashier can correct or cancel. The
        // cart panel behind legitimately renders its own 'Descuento manual'
        // row for the accumulated C$ 20, so assert on the DIALOG's own
        // widgets, not on global text finders.
        expect(
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.text('Descuento manual'),
          ),
          findsOneWidget,
        );
        expect(
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.text('Aplicar'),
          ),
          findsOneWidget,
        );
        // The verdict renders INLINE and names the effective limit.
        expect(
          find.byKey(const Key('manual_discount_inline_rejection')),
          findsOneWidget,
        );
        expect(find.text(expectedRejection), findsOneWidget);
        expect(find.byType(SnackBar), findsNothing);
        // Nothing reached the view model.
        verifyNever(mockViewModel.applyManualDiscount(any));
      },
    );

    testWidgets(
      'ACCUMULATED base: 20 + 3 = 23 exactly the cap closes the dialog and applies C\$ 3',
      (tester) async {
        // Same accumulated base; C$ 3 is acceptable ONLY under the summed
        // reading (20+3=23 <= 23). The dialog must close and hand the
        // amount to the view model — the enforcement still decides.
        tester.platformDispatcher.textScaleFactorTestValue = 0.5;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        stubCaps();
        when(mockViewModel.manualDiscount).thenReturn(20.0);
        await openPromptAndType(tester, '3');
        await tester.tap(find.text('Aplicar'));
        await tester.pumpAndSettle();

        // The dialog is GONE. (The cart row behind legitimately keeps the
        // 'Descuento manual' label for the accumulated C$ 20, so absence is
        // asserted on the dialog itself.)
        expect(find.byType(AlertDialog), findsNothing);
        verify(mockViewModel.applyManualDiscount(3.0)).called(1);
      },
    );
  });

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

  testWidgets('open accounts block the close from the sale-screen entry too', (tester) async {
    // T8 (INV-16.5): the hard block on open accounts must surface through
    // the ⋮ Cerrar Caja entry as well — same pre-gate, same list, and no
    // continuation past it.
    when(mockAuthRepository.authorizeOverride(
      supervisorId: anyNamed('supervisorId'),
      pin: anyNamed('pin'),
      totpCode: anyNamed('totpCode'),
    )).thenAnswer((_) async => true);

    await tester.pumpWidget(buildTestApp(
      cashViewModel: _StubCashShiftViewModel(
        stubbedOpenAccounts: [
          HoldTicket(
            id: 'hold-1',
            name: 'Mesa 5',
            createdAt: DateTime(2026, 2, 1),
            items: [
              const CartItem(
                productId: 'p-1',
                productName: 'Pinol',
                quantity: 1,
                unitPrice: 240.0,
                taxRate: 0.15,
              ),
              const CartItem(
                productId: 'p-2',
                productName: 'Gaseosa',
                quantity: 1,
                unitPrice: 200.0,
                taxRate: 0.15,
              ),
            ],
          ),
        ],
      ),
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

    // Even a supervisor authorization cannot pass the open-accounts gate:
    // the hard block names the account, its line count and its total.
    expect(find.text('Bloqueo de Corte Z — Cuentas Abiertas'), findsOneWidget);
    expect(find.textContaining('Mesa 5'), findsOneWidget);
    expect(find.textContaining('2 líneas'), findsOneWidget);
    expect(find.textContaining('C\$ 440.00'), findsOneWidget);
    expect(find.text('ENTENDIDO'), findsOneWidget);
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

  group('PromotionsManagerDialog is read-only (SOHO P3 S2)', () {
    // Defect 2: the dialog used to render a SwitchListTile whose onChanged
    // wrote ONLY the local SQLite row, and the next cloud delta silently
    // reverted it. The cloud is authoritative, so the POS must not offer a
    // write control. This test pins that the control is gone AND that the
    // operator still learns the promotion state and where to change it.
    testWidgets('shows promotion state without any write control', (tester) async {
      tester.view.physicalSize = const Size(1200, 1800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      when(mockViewModel.allPromotions).thenReturn(const [
        Promotion(
          id: 'promo-active',
          name: '2x1 Toña',
          type: PromotionType.buyXGetYFree,
          buyQuantity: 1,
          getQuantity: 1,
          isActive: true,
        ),
        Promotion(
          id: 'promo-inactive',
          name: '10% Café',
          type: PromotionType.percentageDiscount,
          discountValue: 10,
          isActive: false,
        ),
      ]);

      await tester.pumpWidget(
        ChangeNotifierProvider<SaleViewModel>.value(
          value: mockViewModel,
          child: const MaterialApp(
            home: Scaffold(body: PromotionsManagerDialog()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // The write affordance is gone; the cloud owns activation.
      expect(find.byType(Switch), findsNothing);
      expect(find.byType(SwitchListTile), findsNothing);

      // The state is still visible and honestly labelled.
      expect(find.text('2x1 Toña'), findsOneWidget);
      expect(find.text('10% Café'), findsOneWidget);
      expect(find.text('Activa'), findsOneWidget);
      expect(find.text('Inactiva'), findsOneWidget);

      // The operator is told where promotions are actually managed.
      expect(find.textContaining('panel de negocio'), findsOneWidget);
    });
  });
}
