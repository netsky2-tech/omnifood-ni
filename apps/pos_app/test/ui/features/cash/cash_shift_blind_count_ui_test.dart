import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/config/supervision_policy.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view.dart';
import 'package:pos_app/ui/features/cash/widgets/x_report_dialog.dart';
import 'package:pos_app/ui/features/identity/supervisor_override_modal.dart';

class _MockCashierSessionDao extends Mock implements CashierSessionDao {}
class _MockCashMovementDao extends Mock implements CashMovementDao {}
class _MockTenantConfigService extends Mock implements TenantConfigService {}
class _MockAuthRepository extends Mock implements AuthRepository {}
class _MockAuditRepository extends Mock implements AuditRepository {}

void main() {
  late _MockCashierSessionDao mockSessionDao;
  late _MockCashMovementDao mockMovementDao;
  late _MockTenantConfigService mockConfigService;
  late _MockAuthRepository mockAuthRepo;
  late _MockAuditRepository mockAuditRepo;
  late CashShiftViewModel viewModel;

  final activeSession = CashierSessionEntity(
    id: 'shift-1',
    userId: 'user-cajero-1',
    terminalId: 'term-main',
    openedAt: 1716000000000,
    tipoModelo: 'CAJA_CENTRAL',
    openingBalanceNio: 1500.0,
    openingBalanceUsd: 50.0,
    expectedNio: 4850.0,
    expectedUsd: 40.0,
    isClosed: false,
    syncStatus: 'pending',
  );

  setUp(() {
    mockSessionDao = _MockCashierSessionDao();
    mockMovementDao = _MockCashMovementDao();
    mockConfigService = _MockTenantConfigService();
    mockAuthRepo = _MockAuthRepository();
    mockAuditRepo = _MockAuditRepository();

    viewModel = CashShiftViewModel(
      sessionDao: mockSessionDao,
      movementDao: mockMovementDao,
      currentUserId: 'user-cajero-1',
      currentUserName: 'Carlos Cajero',
      currentTerminalId: 'term-main',
      openAccountsLoader: () async => const [],
    );

    when(() => mockSessionDao.getActiveSessionForUserAndTerminal(
      'user-cajero-1', 'term-main')).thenAnswer((_) async => activeSession);
    when(() => mockMovementDao.getMovementsByShiftId('shift-1'))
        .thenAnswer((_) async => []);
  });

  Widget buildApp({
    required Widget child,
    required SupervisionPolicy policy,
  }) {
    when(() => mockConfigService.getSupervisionPolicy())
        .thenAnswer((_) async => policy);

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<CashShiftViewModel>.value(value: viewModel),
        Provider<TenantConfigService>.value(value: mockConfigService),
        Provider<AuthRepository>.value(value: mockAuthRepo),
        Provider<AuditRepository>.value(value: mockAuditRepo),
      ],
      child: MaterialApp(
        home: Scaffold(body: child),
      ),
    );
  }

  group('CashShiftView - Arqueo Ciego Configurable (S3, S4)', () {
    testWidgets('Bajo modo restaurant (Arqueo Ciego activo), el cajero ve saldos enmascarados C\$ ••••••', (tester) async {
      final restaurantPolicy = SupervisionPolicy.forOperationMode(TenantOperationMode.restaurant);
      viewModel.setUserRole(UserRole.cashier);
      await viewModel.init();

      await tester.pumpWidget(buildApp(
        child: const CashShiftView(),
        policy: restaurantPolicy,
      ));
      await tester.pumpAndSettle();

      // Los fondos iniciales sí se ven
      expect(find.text('C\$ 1500.00'), findsOneWidget);
      expect(find.text('\$ 50.00'), findsOneWidget);

      // Los saldos esperados están OCULTOS por arqueo ciego
      expect(find.text('C\$ ••••••'), findsOneWidget);
      expect(find.text('\$ ••••'), findsOneWidget);
      expect(find.text('Oculto por política de control'), findsNWidgets(2));

      // No se filtra el monto real
      expect(find.text('C\$ 4850.00'), findsNothing);
      expect(find.text('\$ 40.00'), findsNothing);
    });

    testWidgets('Bajo modo restaurant, el rol MANAGER u OWNER ve los saldos esperados reales', (tester) async {
      final restaurantPolicy = SupervisionPolicy.forOperationMode(TenantOperationMode.restaurant);
      viewModel.setUserRole(UserRole.manager);
      await viewModel.init();

      await tester.pumpWidget(buildApp(
        child: const CashShiftView(),
        policy: restaurantPolicy,
      ));
      await tester.pumpAndSettle();

      // El manager sí ve los saldos esperados
      expect(find.text('C\$ 4850.00'), findsOneWidget);
      expect(find.text('\$ 40.00'), findsOneWidget);
      expect(find.text('C\$ ••••••'), findsNothing);
      expect(find.text('Oculto por política de control'), findsNothing);
    });

    testWidgets('Bajo modo foodparkQsr, saldos esperados están protegidos por defecto pero Corte X es libre sin PIN', (tester) async {
      final qsrPolicy = SupervisionPolicy.forOperationMode(TenantOperationMode.foodparkQsr);
      viewModel.setUserRole(UserRole.cashier);
      await viewModel.init();

      await tester.pumpWidget(buildApp(
        child: const CashShiftView(),
        policy: qsrPolicy,
      ));
      await tester.pumpAndSettle();

      // En Foodpark / QSR los saldos esperados están ocultos por defecto
      expect(find.text('C\$ ••••••'), findsOneWidget);
      expect(find.text('\$ ••••'), findsOneWidget);

      // Pero el Corte X es libre: no pide PIN de supervisor
      final xReportButton = find.text('Lectura Parcial (Corte X)');
      expect(xReportButton, findsOneWidget);
      await tester.tap(xReportButton);
      await tester.pumpAndSettle();

      // No abre el modal de supervisor; abre el diálogo de Corte X directamente
      expect(find.byType(SupervisorOverrideModal), findsNothing);
      expect(find.byType(XReportDialog), findsOneWidget);
    });

    testWidgets('Bajo modo foodparkQsr, si el manager deshabilita el arqueo ciego, el cajero ve los saldos reales', (tester) async {
      // El manager opta por permitir ver saldos a los cajeros en su foodpark
      final customQsrPolicy = SupervisionPolicy.forOperationMode(TenantOperationMode.foodparkQsr)
          .copyWith(blindCountEnabled: false);
      viewModel.setUserRole(UserRole.cashier);
      await viewModel.init();

      await tester.pumpWidget(buildApp(
        child: const CashShiftView(),
        policy: customQsrPolicy,
      ));
      await tester.pumpAndSettle();

      // Ahora el cajero ve los saldos numéricos
      expect(find.text('C\$ 4850.00'), findsOneWidget);
      expect(find.text('\$ 40.00'), findsOneWidget);
      expect(find.text('C\$ ••••••'), findsNothing);
    });

    testWidgets('En modo restaurant, Corte X solicita PIN de supervisor al cajero para no burlar el arqueo ciego', (tester) async {
      final restaurantPolicy = SupervisionPolicy.forOperationMode(TenantOperationMode.restaurant);
      viewModel.setUserRole(UserRole.cashier);
      await viewModel.init();

      await tester.pumpWidget(buildApp(
        child: const CashShiftView(),
        policy: restaurantPolicy,
      ));
      await tester.pumpAndSettle();

      // Tap en "Lectura Parcial (Corte X)"
      final xReportButton = find.text('Lectura Parcial (Corte X)');
      expect(xReportButton, findsOneWidget);
      await tester.tap(xReportButton);
      await tester.pumpAndSettle();

      // Debe abrir SupervisorOverrideModal exigiendo autorización
      expect(find.byType(SupervisorOverrideModal), findsOneWidget);
      expect(find.text('Autorización de supervisor'), findsOneWidget);
    });
  });
}
