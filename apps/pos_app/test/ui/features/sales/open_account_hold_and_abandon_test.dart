// F3/F4 open-accounts fix: hold-dialog prefill and abandon-account affordance.
//
// Uses the checked-in generated mocks from sale_view_security_flows_test
// (same pattern as sunmi_v2s_responsive_sale_view_test.dart). SaleViewModel's
// newer members reached through Mock.noSuchMethod still record invocations,
// so verify()/verifyNever() work for abandonHoldTicket/holdCurrentTicket.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_security_flows_test.mocks.dart';

/// abandonHoldTicket is newer than the checked-in generated mock. This local
/// override mirrors exactly what mockito codegen would emit for the member,
/// so when()/verify() work without regenerating the whole package's .mocks.dart files.
class MockSaleViewModelWithAbandon extends MockSaleViewModel {
  @override
  Future<void> abandonHoldTicket(HoldTicket? ticket) => super.noSuchMethod(
        Invocation.method(#abandonHoldTicket, [ticket]),
        returnValue: Future<void>.value(),
        returnValueForMissingStub: Future<void>.value(),
      ) as Future<void>;
}

void main() {
  late MockSaleViewModelWithAbandon mockViewModel;
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

  final testCartItems = [
    CartItem(
      productId: 'prod-1',
      productName: 'Café Espresso',
      quantity: 2,
      unitPrice: 50.0,
      taxRate: 0.15,
    ),
    CartItem(
      productId: 'prod-2',
      productName: 'Panini',
      quantity: 1,
      unitPrice: 120.0,
      taxRate: 0.15,
    ),
  ];

  HoldTicket ticketNamed(String name) => HoldTicket(
        id: 'ticket-1',
        name: name,
        items: List.from(testCartItems),
        createdAt: DateTime(2026, 1, 1),
      );

  setUp(() {
    mockViewModel = MockSaleViewModelWithAbandon();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.filteredProducts).thenReturn(const []);
    when(mockViewModel.cart).thenReturn(testCartItems);
    when(mockViewModel.total).thenReturn(127.5);
    when(mockViewModel.grandTotalWithTip).thenReturn(127.5);
    when(mockViewModel.tipAmount).thenReturn(0.0);
    when(mockViewModel.subtotal).thenReturn(110.0);
    when(mockViewModel.totalTax).thenReturn(17.5);
    when(mockViewModel.totalDiscounts).thenReturn(0.0);
    when(mockViewModel.isGlobalTaxExempt).thenReturn(false);
    when(mockViewModel.supportsTables).thenReturn(false);
    when(mockViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockViewModel.businessModeEvaluator)
        .thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(mockViewModel.buzzerNumber).thenReturn(null);
    when(mockViewModel.canManageCashDrawer).thenReturn(true);
    when(mockViewModel.currentUserRole).thenReturn(UserRole.cashier);
    when(mockViewModel.activeLoadedHoldTicket).thenReturn(null);
    when(mockViewModel.holdTickets).thenReturn([]);
    when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => currentUser);
    when(mockViewModel.promotions).thenReturn([]);
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

  Future<void> tapWhenVisible(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> openHoldDialog(WidgetTester tester) async {
    await tapWhenVisible(tester, find.byIcon(Icons.pause).first);
  }

  Future<void> openRecallDialog(WidgetTester tester) async {
    await tapWhenVisible(tester, find.byIcon(Icons.history).first);
  }

  Finder dialogTextField() =>
      find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField));

  group('F3: hold dialog prefills the recalled account name', () {
    testWidgets('shows the recalled account name and states it is editing it', (tester) async {
      when(mockViewModel.activeLoadedHoldTicket).thenReturn(ticketNamed('Cuenta 2'));

      await tester.pumpWidget(buildTestApp());
      await openHoldDialog(tester);

      final field = tester.widget<TextField>(dialogTextField().first);
      expect(field.controller?.text, 'Cuenta 2',
          reason: 'the operator must SEE they are editing an existing account');
      expect(find.textContaining('Cuenta 2'), findsWidgets,
          reason: 'the dialog must name the account being edited');
      expect(find.textContaining('editando'), findsWidgets,
          reason: 'the dialog must state that saving edits the account');
    });

    testWidgets('shows an empty field when no account is loaded (new account)', (tester) async {
      when(mockViewModel.activeLoadedHoldTicket).thenReturn(null);

      await tester.pumpWidget(buildTestApp());
      await openHoldDialog(tester);

      final field = tester.widget<TextField>(dialogTextField().first);
      expect(field.controller?.text, isEmpty);
    });

    testWidgets('forwards the typed name when saving an edited account', (tester) async {
      when(mockViewModel.activeLoadedHoldTicket).thenReturn(ticketNamed('Cuenta 2'));

      await tester.pumpWidget(buildTestApp());
      await openHoldDialog(tester);

      await tester.enterText(dialogTextField().first, 'Cuenta Renombrada');
      await tester.tap(find.text('GUARDAR'));
      await tester.pumpAndSettle();

      verify(mockViewModel.holdCurrentTicket(
        'Cuenta Renombrada',
        tableId: null,
        guestCount: 2,
      )).called(1);
    });
  });

  group('F3b: the edit banner discloses what the replace will discard', () {
    // Owner decision (open-accounts slice): the REPLACE semantics of F1 stay,
    // but the operator must see, in numbers, what is lost. No extra blocking
    // step: this is disclosure, not a second confirmation.
    HoldTicket accountWith(List<CartItem> items) => HoldTicket(
          id: 'ticket-1',
          name: 'Cuenta 2',
          items: items,
          createdAt: DateTime(2026, 1, 1),
        );

    String money(double v) => 'C\$ ${v.toStringAsFixed(2)}';

    testWidgets('names the stored contents and the incoming cart contents',
        (tester) async {
      final stored = accountWith([
        CartItem(
            productId: 'a',
            productName: 'A',
            quantity: 1,
            unitPrice: 500.0,
            taxRate: 0.15),
        CartItem(
            productId: 'b',
            productName: 'B',
            quantity: 1,
            unitPrice: 300.0,
            taxRate: 0.15),
        CartItem(
            productId: 'c',
            productName: 'C',
            quantity: 1,
            unitPrice: 200.0,
            taxRate: 0.15),
      ]);
      when(mockViewModel.activeLoadedHoldTicket).thenReturn(stored);
      // The cart now holds a single C$ 80 line: the save would drop C$ 920.
      when(mockViewModel.cart).thenReturn([
        CartItem(
            productId: 'z',
            productName: 'Z',
            quantity: 1,
            unitPrice: 80.0,
            taxRate: 0.15),
      ]);

      await tester.pumpWidget(buildTestApp());
      await openHoldDialog(tester);

      final banner = tester.widget<Text>(find.descendant(
          of: find.byType(AlertDialog),
          matching: find.textContaining('Está editando la cuenta abierta'),
        ));

      expect(banner.data, contains('3 productos'),
          reason: 'the operator must see how many lines are being replaced');
      expect(banner.data, contains(money(1000.0)),
          reason: 'the operator must see the stored amount at risk');
      expect(banner.data, contains('1 producto'),
          reason: 'the operator must see what the cart will become');
      expect(banner.data, contains(money(80.0)),
          reason: 'the operator must see the incoming amount');
      expect(banner.data, contains(money(920.0)),
          reason: 'the discarded difference must be stated explicitly');
    });

    testWidgets('does not claim a loss when the cart only adds to the account',
        (tester) async {
      final stored = accountWith([
        CartItem(
            productId: 'a',
            productName: 'A',
            quantity: 1,
            unitPrice: 100.0,
            taxRate: 0.15),
      ]);
      when(mockViewModel.activeLoadedHoldTicket).thenReturn(stored);
      when(mockViewModel.cart).thenReturn([
        CartItem(
            productId: 'a',
            productName: 'A',
            quantity: 1,
            unitPrice: 100.0,
            taxRate: 0.15),
        CartItem(
            productId: 'b',
            productName: 'B',
            quantity: 1,
            unitPrice: 250.0,
            taxRate: 0.15),
      ]);

      await tester.pumpWidget(buildTestApp());
      await openHoldDialog(tester);

      final banner = tester.widget<Text>(find.descendant(
          of: find.byType(AlertDialog),
          matching: find.textContaining('Está editando la cuenta abierta'),
        ));

      expect(banner.data, contains('1 producto'));
      expect(banner.data, contains('2 productos'));
      expect(banner.data, isNot(contains('Se pierden')),
          reason: 'a growing account loses nothing and must not say it does');
    });
  });

  group('F4: abandon account from the held-accounts list', () {
    testWidgets('cancelling the confirmation deletes nothing', (tester) async {
      final ticket = ticketNamed('Cuenta 2');
      when(mockViewModel.holdTickets).thenReturn([ticket]);

      await tester.pumpWidget(buildTestApp());
      await openRecallDialog(tester);

      await tester.tap(find.byIcon(Icons.delete_outline).first);
      await tester.pumpAndSettle();

      // The confirmation names the account, its size and its cost.
      expect(find.textContaining('Cuenta 2'), findsWidgets);
      expect(find.textContaining('2 productos'), findsWidgets);
      expect(find.textContaining('factura'), findsWidgets);
      expect(find.textContaining('desha'), findsWidgets);

      await tester.tap(find.text('CANCELAR'));
      await tester.pumpAndSettle();

      verifyNever(mockViewModel.abandonHoldTicket(any));
    });

    testWidgets('confirming the abandonment calls abandonHoldTicket with the ticket',
        (tester) async {
      final ticket = ticketNamed('Cuenta 2');
      when(mockViewModel.holdTickets).thenReturn([ticket]);
      when(mockViewModel.abandonHoldTicket(any)).thenAnswer((_) async {});

      await tester.pumpWidget(buildTestApp());
      await openRecallDialog(tester);

      await tester.tap(find.byIcon(Icons.delete_outline).first);
      await tester.pumpAndSettle();

      await tester.tap(find.text('ABANDONAR'));
      await tester.pumpAndSettle();

      verify(mockViewModel.abandonHoldTicket(ticket)).called(1);
    });
  });
}
