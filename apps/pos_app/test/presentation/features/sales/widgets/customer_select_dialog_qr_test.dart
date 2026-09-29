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
  Future<Customer?> Function(String input)? onIdentify;
  String? lastIdentifiedInput;

  @override
  Future<void> selectCustomer(Customer? customer) async {
    selectCustomerCallCount += 1;
    _selectedCustomer = customer;
    _customerName = customer?.name;
    notifyListeners();
  }

  int selectCustomerCallCount = 0;

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
    identifyCallCount += 1;
    lastIdentifiedInput = input;
    if (onIdentify != null) {
      final customer = await onIdentify!(input);
      // Mirror the real SaleViewModel.identifyCustomer: selection happens
      // INSIDE identification, so the dialog must not select a second time.
      if (customer != null) {
        await selectCustomer(customer);
      }
      return customer;
    }
    return null;
  }

  int identifyCallCount = 0;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('CustomerSelectDialog — QR and Customer Code', () {
    late StubSaleViewModel viewModel;

    setUp(() {
      viewModel = StubSaleViewModel();
    });

    Widget buildTestableDialog({CustomerScannerViewBuilder? scannerBuilder}) {
      return MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () => CustomerSelectDialog.show(
                context,
                viewModel,
                scannerBuilder: scannerBuilder,
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      );
    }

    /// Fake camera layer: simulates a detected code without the platform
    /// channel. Also exposes the manual-entry fallback used when the camera
    /// cannot start (e.g. permission denied).
    Widget fakeScannerBuilder(
      BuildContext context,
      ValueChanged<String> onCodeDetected,
      VoidCallback onManualEntryFallback,
    ) {
      return Column(
        children: [
          ElevatedButton(
            key: const Key('fake_scan_button'),
            onPressed: () => onCodeDetected('NHL1:ABC123'),
            child: const Text('Simulate Scan'),
          ),
          ElevatedButton(
            key: const Key('fake_manual_entry_fallback'),
            onPressed: onManualEntryFallback,
            child: const Text('Simulate Camera Unavailable'),
          ),
        ],
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

    testWidgets('successful manual code path selects the customer exactly once',
        (tester) async {
      const customer = Customer(
        id: 'c-2',
        name: 'Manual Entry',
        customerCode: 'DEF456',
      );
      viewModel.onIdentify = (_) async => customer;

      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('customer_code_input')),
        'NHL1:DEF456',
      );
      await tester.tap(find.byKey(const Key('customer_code_submit')));
      await tester.pumpAndSettle();

      expect(viewModel.selectedCustomer?.id, 'c-2');
      // identifyCustomer already selects internally: exactly one selection,
      // no redundant second loyalty re-evaluation.
      expect(viewModel.selectCustomerCallCount, 1);
      // Dialog closed with the identified customer.
      expect(find.byType(CustomerSelectDialog), findsNothing);
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

    testWidgets('QR scan opens overlay and RAW scan value reaches '
        'identifyCustomer', (tester) async {
      const customer = Customer(
        id: 'c-1',
        name: 'Carlos Test',
        customerCode: 'ABC123',
      );
      viewModel.onIdentify = (_) async => customer;

      await tester.pumpWidget(
        buildTestableDialog(scannerBuilder: fakeScannerBuilder),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('qr_scan_button')));
      await tester.pumpAndSettle();

      // Camera overlay is shown.
      expect(find.text('Escanear código del cliente'), findsOneWidget);

      // Camera detects the raw payload.
      await tester.tap(find.byKey(const Key('fake_scan_button')));
      await tester.pumpAndSettle();

      // The RAW value (with the NHL1: prefix) is passed through untouched:
      // adapter chain owns the parsing.
      expect(viewModel.lastIdentifiedInput, 'NHL1:ABC123');
      expect(viewModel.selectedCustomer?.id, 'c-1');
      // identifyCustomer already selects internally: the dialog must not
      // trigger a second (redundant) loyalty re-evaluation via selectCustomer.
      expect(viewModel.selectCustomerCallCount, 1);
      // Dialog closed with the identified customer.
      expect(find.text('Escanear código del cliente'), findsNothing);
    });

    testWidgets('unrecognized scan shows a visible error state (§30) and '
        'keeps the dialog usable', (tester) async {
      viewModel.onIdentify = (_) async => null;

      await tester.pumpWidget(
        buildTestableDialog(scannerBuilder: fakeScannerBuilder),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('qr_scan_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('fake_scan_button')));
      await tester.pumpAndSettle();

      expect(find.textContaining('Código no reconocido'), findsOneWidget);
      // Manual entry still available after a failed scan.
      expect(find.byKey(const Key('customer_code_input')), findsOneWidget);
    });

    testWidgets('close control exits the scanner overlay and preserves '
        'manual entry', (tester) async {
      await tester.pumpWidget(
        buildTestableDialog(scannerBuilder: fakeScannerBuilder),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('qr_scan_button')));
      await tester.pumpAndSettle();
      expect(find.text('Escanear código del cliente'), findsOneWidget);

      await tester.tap(find.byKey(const Key('qr_scan_close_button')));
      await tester.pumpAndSettle();

      expect(find.text('Escanear código del cliente'), findsNothing);
      expect(find.byKey(const Key('customer_code_input')), findsOneWidget);
    });

    testWidgets('camera-unavailable fallback exits to manual entry',
        (tester) async {
      await tester.pumpWidget(
        buildTestableDialog(scannerBuilder: fakeScannerBuilder),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('qr_scan_button')));
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const Key('fake_manual_entry_fallback')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Escanear código del cliente'), findsNothing);
      expect(find.byKey(const Key('customer_code_input')), findsOneWidget);
    });

    testWidgets('repeated detections report the code only once',
        (tester) async {
      viewModel.onIdentify = (_) async => null;

      Widget doubleFireScannerBuilder(
        BuildContext context,
        ValueChanged<String> onCodeDetected,
        VoidCallback onManualEntryFallback,
      ) {
        return ElevatedButton(
          key: const Key('fake_double_scan_button'),
          onPressed: () {
            onCodeDetected('NHL1:ABC123');
            onCodeDetected('NHL1:ABC123');
          },
          child: const Text('Simulate Double Scan'),
        );
      }

      await tester.pumpWidget(
        buildTestableDialog(scannerBuilder: doubleFireScannerBuilder),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('qr_scan_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('fake_double_scan_button')));
      await tester.pumpAndSettle();

      expect(viewModel.identifyCallCount, 1);
    });
  });
}
