import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/widgets/loyalty_compact_widget.dart';
import 'package:pos_app/presentation/features/sales/widgets/reward_cta_widget.dart';
import 'package:pos_app/presentation/features/sales/widgets/reward_confirmation_dialog.dart';

/// Minimal stub of SaleViewModel for checkout widget tests.
class StubSaleViewModel extends ChangeNotifier implements SaleViewModel {
  Customer? _selectedCustomer;
  @override
  Customer? get selectedCustomer => _selectedCustomer;

  String? _customerName;
  @override
  String? get customerName => _customerName;

  List<CartItem> _cart = [];
  @override
  List<CartItem> get cart => _cart;

  LoyaltyEvaluation? _currentEvaluation;
  @override
  LoyaltyEvaluation? get currentEvaluation => _currentEvaluation;

  RewardDefinitionLocal? _selectedReward;
  @override
  RewardDefinitionLocal? get selectedReward => _selectedReward;

  @override
  Future<void> selectCustomer(Customer? customer) async {
    _selectedCustomer = customer;
    _customerName = customer?.name;
    notifyListeners();
  }

  @override
  void clearCustomer() {
    _selectedCustomer = null;
    _customerName = null;
    notifyListeners();
  }

  @override
  Future<List<Customer>> searchCustomers(String query) async => [];

  @override
  Future<Customer> createExpressCustomer({
    required String name,
    String? taxId,
    String? phone,
    String? email,
    String? address,
  }) async {
    final customer = Customer(
      id: 'c-new',
      name: name,
      taxId: taxId,
      phone: phone,
      email: email,
      address: address,
    );
    await selectCustomer(customer);
    return customer;
  }

  @override
  Future<Customer?> identifyCustomer(String input) async => null;

  @override
  void addToCart(
    Product product, {
    double quantity = 1.0,
    String? variantId,
    List<Modifier> modifiers = const [],
  }) {
    // For testing, just add a CartItem from the product
    final cartItem = CartItem(
      productId: product.id,
      productName: product.name,
      quantity: quantity,
      unitPrice: product.sellPrice,
      taxRate: 0.15,
      category: product.category,
      variantId: variantId,
      selectedModifiers: modifiers,
    );
    _cart.add(cartItem);
    notifyListeners();
  }

  @override
  void clearCart() {
    _cart.clear();
    notifyListeners();
  }

  @override
  double get total => _cart.length * 100.0;

  @override
  double get subtotal => _cart.length * 100.0;

  @override
  double get totalTax => 0;

  @override
  double get loyaltyDiscount => 0;

  @override
  double get totalDiscounts => 0;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('Loyalty widgets in checkout flow', () {
    late StubSaleViewModel viewModel;

    setUp(() {
      viewModel = StubSaleViewModel();
    });

    Widget buildTestableWidget(Widget child) {
      return MaterialApp(
        home: ChangeNotifierProvider<SaleViewModel>.value(
          value: viewModel,
          child: Scaffold(body: child),
        ),
      );
    }

    testWidgets('LoyaltyCompactWidget shows customer evaluation when customer selected',
        (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 6,
            earningPreviewUnits: 1,
          ),
        ],
      );

      viewModel._currentEvaluation = evaluation;
      viewModel._selectedCustomer = const Customer(
        id: 'cust-1',
        name: 'Test Customer',
        phone: '88881234',
        pointsBalance: 6.0,
      );

      await tester.pumpWidget(buildTestableWidget(
        LoyaltyCompactWidget(evaluation: evaluation),
      ));

      expect(find.text('Smash Burger Club'), findsOneWidget);
      expect(find.text('6'), findsWidgets); // balanceUnits
      expect(find.text('+1'), findsOneWidget); // earningPreviewUnits
    });

    testWidgets('LoyaltyCompactWidget shows without stale indicator when none',
        (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 6,
          ),
        ],
      );

      await tester.pumpWidget(buildTestableWidget(
        LoyaltyCompactWidget(evaluation: evaluation),
      ));

      expect(find.text('Smash Burger Club'), findsOneWidget);
      expect(find.text('Config. desactualizada'), findsNothing);
    });

    testWidgets('RewardCtaWidget shows when evaluation has eligible reward',
        (tester) async {
      final eligibleReward = EligibleReward(
        rewardId: 'rw-1',
        name: 'Smash Burger Gratis',
        rewardType: RewardType.freeProduct,
        costUnits: 10,
        description: 'Burger gratis por 10 sellos',
      );

      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 12,
            eligibleRewards: [eligibleReward],
          ),
        ],
      );

      bool onApplyCalled = false;

      await tester.pumpWidget(buildTestableWidget(
        RewardCtaWidget(
          evaluation: evaluation,
          onApplyReward: () => onApplyCalled = true,
        ),
      ));

      expect(find.text('Aplicar Smash Burger Gratis'), findsOneWidget);
      expect(find.byIcon(Icons.card_giftcard), findsOneWidget);
      expect(find.byKey(const Key('reward_cta_button')), findsOneWidget);

      // Tap the CTA button
      await tester.tap(find.byKey(const Key('reward_cta_button')));
      await tester.pump();

      expect(onApplyCalled, isTrue);
    });

    testWidgets('RewardCtaWidget is hidden when no eligible reward', (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 5, // Not enough for reward
          ),
        ],
      );

      await tester.pumpWidget(buildTestableWidget(
        RewardCtaWidget(evaluation: evaluation),
      ));

      expect(find.byKey(const Key('reward_cta_button')), findsNothing);
      expect(tester.widget(find.byType(SizedBox)), isA<SizedBox>());
    });

    testWidgets('RewardConfirmationDialog shows reward details and calls callbacks',
        (tester) async {
      final eligibleReward = EligibleReward(
        rewardId: 'rw-1',
        name: 'Smash Burger Gratis',
        rewardType: RewardType.freeProduct,
        costUnits: 10,
        description: 'Burger gratis por 10 sellos',
      );

      bool confirmCalled = false;
      bool cancelCalled = false;

      await tester.pumpWidget(buildTestableWidget(
        RewardConfirmationDialog(
          reward: eligibleReward,
          onConfirm: () => confirmCalled = true,
          onCancel: () => cancelCalled = true,
        ),
      ));

      expect(find.byKey(const Key('reward_confirmation_dialog')), findsOneWidget);
      expect(find.text('Aplicar recompensa'), findsOneWidget);
      expect(find.text('¿Desea aplicar "Smash Burger Gratis" por 10 puntos?'), findsOneWidget);
      expect(find.byKey(const Key('reward_confirm_button')), findsOneWidget);
      expect(find.byKey(const Key('reward_cancel_button')), findsOneWidget);
      expect(find.byKey(const Key('reward_confirmation_text')), findsOneWidget);

      // Tap Confirm
      await tester.tap(find.byKey(const Key('reward_confirm_button')));
      await tester.pump();

      expect(confirmCalled, isTrue);
      expect(cancelCalled, isFalse);

      // Reset and tap Cancel
      confirmCalled = false;
      await tester.pumpWidget(buildTestableWidget(
        RewardConfirmationDialog(
          reward: eligibleReward,
          onConfirm: () => confirmCalled = true,
          onCancel: () => cancelCalled = true,
        ),
      ));

      await tester.tap(find.byKey(const Key('reward_cancel_button')));
      await tester.pump();

      expect(confirmCalled, isFalse);
      expect(cancelCalled, isTrue);
    });
  });
}