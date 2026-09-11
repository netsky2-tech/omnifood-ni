import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/widgets/customer_select_dialog.dart';

/// Minimal stub of SaleViewModel for dialog widget tests.
/// Only implements the subset needed by CustomerSelectDialog.
class StubSaleViewModel extends ChangeNotifier implements SaleViewModel {
  Customer? _selectedCustomer;
  @override
  Customer? get selectedCustomer => _selectedCustomer;

  String? _customerName;
  @override
  String? get customerName => _customerName;

  /// Stub for identifyCustomer — allows tests to control the result
  Customer? Function(String input)? onIdentify;
  String? lastIdentifiedInput;

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
  Future<Customer?> identifyCustomer(String input) async {
    lastIdentifiedInput = input;
    if (onIdentify != null) {
      return onIdentify!(input);
    }
    return null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('CustomerSelectDialog — QR and Customer Code', () {
    late StubSaleViewModel viewModel;

    setUp(() {
      viewModel = StubSaleViewModel();
    });

    Widget buildTestableDialog() {
      return MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () => CustomerSelectDialog.show(context, viewModel),
              child: const Text('Open'),
            ),
          ),
        ),
      );
    }

    testWidgets('QR scan button is visible in the search bar area',
        (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.qr_code_scanner), findsOneWidget);
    });

    testWidgets('Customer code input field is visible', (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('customer_code_input')), findsOneWidget);
    });

    testWidgets('Code submit button is visible', (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('customer_code_submit')), findsOneWidget);
    });

    testWidgets('Code input submits and calls identifyCustomer', (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('customer_code_input')),
        'NHL1:DEF456',
      );
      await tester.tap(find.byKey(const Key('customer_code_submit')));
      await tester.pumpAndSettle();

      expect(viewModel.lastIdentifiedInput, 'NHL1:DEF456');
    });

    testWidgets('showing dialog displays existing search and new customer UI',
        (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      // Search field present
      expect(find.byType(TextField), findsWidgets);
      // "Nuevo" button present
      expect(find.text('Nuevo'), findsOneWidget);
      // "Consumidor Final" button present
      expect(find.text('Consumidor Final (Sin Cliente Asignado)'), findsOneWidget);
    });
  });
}
