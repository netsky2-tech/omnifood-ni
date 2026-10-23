import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  /// Optional override so tests can control live search results.
  Future<List<Customer>> Function(String query)? onSearch;

  @override
  Future<List<Customer>> searchCustomers(String query) async {
    if (onSearch != null) return onSearch!(query);
    return [];
  }

  /// Optional override so tests can control next-page loading.
  Future<List<Customer>> Function(int offset)? onLoadMore;
  final List<int> loadMoreOffsets = [];

  @override
  Future<List<Customer>> loadMoreCustomers({
    required int offset,
    int limit = 50,
  }) async {
    loadMoreOffsets.add(offset);
    if (onLoadMore != null) return onLoadMore!(offset);
    return [];
  }

  @override
  Future<Customer> createExpressCustomer({
    required String name,
    String? taxId,
    String? phone,
    String? email,
    String? address,
    String? customerType,
  }) async {
    final customer = Customer(
      id: 'c-new',
      name: name,
      taxId: taxId,
      phone: phone,
      email: email,
      address: address,
      customerType: customerType,
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

      expect(find.byKey(const Key('customer_search_input')), findsOneWidget);
    });

    testWidgets('Code submit button is visible', (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('customer_identify_button')), findsOneWidget);
    });

    testWidgets('Code input submits and calls identifyCustomer', (tester) async {
      await tester.pumpWidget(buildTestableDialog());
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('customer_search_input')),
        'NHL1:DEF456',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('customer_identify_button')));
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
        find.byKey(const Key('customer_search_input')),
        'NHL1:DEF456',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('customer_identify_button')));
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
      expect(find.byKey(const Key('customer_search_input')), findsOneWidget);
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
      expect(find.byKey(const Key('customer_search_input')), findsOneWidget);
    });

    testWidgets('Escape key closes the scanner overlay (NHILOS §46)',
        (tester) async {
      await tester.pumpWidget(
        buildTestableDialog(scannerBuilder: fakeScannerBuilder),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('qr_scan_button')));
      await tester.pumpAndSettle();
      expect(find.text('Escanear código del cliente'), findsOneWidget);

      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();

      expect(find.text('Escanear código del cliente'), findsNothing);
      expect(find.byKey(const Key('customer_search_input')), findsOneWidget);
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
      expect(find.byKey(const Key('customer_search_input')), findsOneWidget);
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

  group('CustomerSelectDialog — alta de cliente (#952)', () {
    late StubSaleViewModel viewModel;

    setUp(() {
      viewModel = StubSaleViewModel();
    });

    Future<void> openNewCustomerForm(WidgetTester tester) async {
      tester.view.physicalSize = const Size(900, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nuevo'));
      await tester.pumpAndSettle();
    }

    Future<void> tapCustomerType(WidgetTester tester, Key key) async {
      final radio = find.descendant(
        of: find.byKey(key),
        matching: find.byType(Radio<String>),
      );
      await tester.ensureVisible(radio);
      await tester.pumpAndSettle();
      await tester.tap(radio);
      await tester.pumpAndSettle();
    }

    testWidgets('muestra el selector gobernado con ayuda de Empresa',
        (tester) async {
      await openNewCustomerForm(tester);

      expect(find.text('Tipo de cliente *'), findsOneWidget);
      expect(find.text('Persona'), findsOneWidget);
      expect(find.text('Empresa'), findsOneWidget);
      expect(
        find.text('Empresa: no acumula puntos de lealtad.'),
        findsOneWidget,
      );
    });

    testWidgets('valida nombre obligatorio y no crea el cliente',
        (tester) async {
      await openNewCustomerForm(tester);

      await tester.tap(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();

      expect(find.text('El nombre del cliente es obligatorio'), findsOneWidget);
      expect(viewModel.selectedCustomer, isNull);
    });

    testWidgets('valida RUC/Cédula inválido y bloquea el envio',
        (tester) async {
      await openNewCustomerForm(tester);

      await tester.enterText(
        find.widgetWithText(TextField, 'Nombre Completo / Razón Social *'),
        'Distribuidora Central S.A.',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Cédula / RUC (Opcional)'),
        '12345-INVALID',
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Cédula o RUC inválido'), findsOneWidget);

      await tester.tap(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();
      expect(viewModel.selectedCustomer, isNull);
    });

    testWidgets('por defecto crea PERSONA', (tester) async {
      await openNewCustomerForm(tester);

      await tester.enterText(
        find.widgetWithText(TextField, 'Nombre Completo / Razón Social *'),
        'Pedro Solís',
      );
      await tester.tap(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();

      expect(viewModel.selectedCustomer, isNotNull);
      expect(viewModel.selectedCustomer!.customerType, 'PERSONA');
    });

    testWidgets('al elegir Empresa envia customerType EMPRESA', (tester) async {
      await openNewCustomerForm(tester);

      await tester.enterText(
        find.widgetWithText(TextField, 'Nombre Completo / Razón Social *'),
        'Distribuidora Central S.A.',
      );
      expect(find.text('Guardar y Seleccionar'), findsOneWidget,
          reason: 'submit before type tap');
      await tapCustomerType(tester, const Key('customer_type_empresa'));
      expect(find.text('Nuevo Cliente'), findsOneWidget,
          reason: 'dialog still open after type tap');

      await tester.ensureVisible(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();

      expect(viewModel.selectedCustomer, isNotNull);
      expect(viewModel.selectedCustomer!.customerType, 'EMPRESA');
    });

    testWidgets('la alerta de identificación usa icono, no solo color',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('customer_search_input')),
        'CODIGO-DESCONOCIDO',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('customer_identify_button')));
      await tester.pumpAndSettle();

      expect(find.textContaining('No se encontró un cliente que coincida'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('el teclado abierto no produce overflow (responsive)',
        (tester) async {
      tester.view.physicalSize = const Size(400, 800);
      tester.view.devicePixelRatio = 1.0;
      tester.view.viewInsets = const FakeViewPadding(bottom: 320);
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('customer_search_input')),
        'Lucía',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Seleccionar Cliente'), findsOneWidget);
    });

    testWidgets('el input unificado distingue sin datos de sin resultados',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Aún no hay clientes registrados.'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('customer_search_input')),
        'zzz',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      expect(find.text('Sin resultados para «zzz».'), findsOneWidget);
      expect(find.text('Limpiar búsqueda'), findsOneWidget);
    });

    testWidgets('submit sin coincidencia no alerta si la lista tiene resultados',
        (tester) async {
      viewModel.onSearch = (_) async => const [
            Customer(id: 'c-9', name: 'Lucía Méndez'),
          ];
      viewModel.onIdentify = (_) async => null;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('customer_search_input')),
        'Lucía',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('customer_identify_button')));
      await tester.pumpAndSettle();

      expect(find.text('Lucía Méndez'), findsOneWidget);
      expect(
        find.textContaining('No se encontró un cliente que coincida'),
        findsNothing,
      );
    });

    testWidgets('layout angosto apila la accion Nuevo sin overflow',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('customer_search_input')), findsOneWidget);
      expect(find.text('Nuevo'), findsOneWidget);
    });

    testWidgets('pagina la lista y carga mas al llegar al final', (tester) async {
      tester.view.physicalSize = const Size(900, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final firstPage = List<Customer>.generate(
        50,
        (i) => Customer(id: 'p-$i', name: 'Cliente ${i.toString().padLeft(3, '0')}'),
      );
      final secondPage = List<Customer>.generate(
        5,
        (i) => Customer(id: 'q-$i', name: 'Zeta $i'),
      );
      viewModel.onSearch = (query) async =>
          query.trim().isEmpty ? firstPage : firstPage;
      viewModel.onLoadMore = (_) async => secondPage;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('Cliente 000'), findsOneWidget);
      expect(viewModel.loadMoreOffsets, isEmpty);

      for (var i = 0; i < 12 && viewModel.loadMoreOffsets.isEmpty; i++) {
        await tester.drag(find.byType(ListView), const Offset(0, -600));
        await tester.pumpAndSettle();
      }

      expect(viewModel.loadMoreOffsets, equals([50]));
    });

    testWidgets('el boton de identificar esta deshabilitado con el campo vacio',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, viewModel),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      final button = tester.widget<IconButton>(
        find.byKey(const Key('customer_identify_button')),
      );
      expect(button.onPressed, isNull);
    });
  });
}
