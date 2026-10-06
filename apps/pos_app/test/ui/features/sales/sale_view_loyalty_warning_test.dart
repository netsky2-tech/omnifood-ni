import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

@GenerateNiceMocks([
  MockSpec<SaleViewModel>(),
  MockSpec<AuthRepository>(),
  MockSpec<AuditRepository>(),
  MockSpec<SyncService>(),
])

/// POS-B (re-audit): after a successful sale completion with a loyalty
/// failure recorded, SaleView must surface a NON-blocking warning SnackBar
/// (the sale WAS registered — loyalty drift must never be invisible).
void main() {
  late MockSaleViewModel mockViewModel;
  late MockAuthRepository mockAuthRepository;
  late MockAuditRepository mockAuditRepository;
  late MockSyncService mockSyncService;

  // Models the real consume-once contract of the view model: the armed
  // flag is cleared by consumePendingLoyaltyWarning.
  bool pendingLoyaltyWarning = false;

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
    pendingLoyaltyWarning = false;
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
    when(
      mockViewModel.businessModeEvaluator,
    ).thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(mockViewModel.sessionExpected).thenReturn({
      PaymentMethod.cash: 100,
      PaymentMethod.card: 0,
      PaymentMethod.qr: 0,
    });
    when(
      mockViewModel.hasPendingLoyaltyWarning,
    ).thenAnswer((_) => pendingLoyaltyWarning);
    when(mockViewModel.consumePendingLoyaltyWarning()).thenAnswer((_) {
      pendingLoyaltyWarning = false;
    });
    when(
      mockAuthRepository.getCurrentUser(),
    ).thenAnswer((_) async => currentUser);
    when(
      mockAuthRepository.getAllUsers(),
    ).thenAnswer((_) async => [currentUser]);
    when(
      mockAuditRepository.logForensic(
        any,
        metadata: anyNamed('metadata'),
        metodoAutorizacion: anyNamed('metodoAutorizacion'),
        usuarioAutorizadorId: anyNamed('usuarioAutorizadorId'),
      ),
    ).thenAnswer((_) async {});
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

  testWidgets('shows the non-blocking loyalty warning after a sale '
      'completed with a loyalty failure', (tester) async {
    pendingLoyaltyWarning = true;

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsOneWidget,
    );
    // The warning is consumed exactly once: the view owns the one-shot.
    verify(mockViewModel.consumePendingLoyaltyWarning()).called(1);
  });

  testWidgets('shows no loyalty warning when no loyalty failure was armed',
      (tester) async {
    pendingLoyaltyWarning = false;

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsNothing,
    );
    verifyNever(mockViewModel.consumePendingLoyaltyWarning());
  });

  testWidgets('the warning is consumed once and never re-shown on the next '
      'notification', (tester) async {
    pendingLoyaltyWarning = true;

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsOneWidget,
    );

    // A later view-model notification (consume already reset the flag)
    // must not duplicate the warning.
    mockViewModel.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsOneWidget,
    );
    verify(mockViewModel.consumePendingLoyaltyWarning()).called(1);
  });
}
