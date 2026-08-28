import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/widgets/customer_select_dialog.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

class FakeSalesRepository implements SalesRepository {
  Invoice? lastSavedInvoice;
  List<InvoiceItem>? lastSavedItems;
  List<Payment>? lastSavedPayments;

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {
    lastSavedInvoice = invoice;
    lastSavedItems = items;
    lastSavedPayments = payments;
  }

  @override
  Future<Invoice?> getInvoiceById(String id) async => lastSavedInvoice;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeInventoryRepository implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeAuthRepository implements AuthRepository {
  @override
  Future<User?> getCurrentUser() async => const User(
        id: 'user-001',
        name: 'Cajero Test',
        email: 'cajero@omnifood.ni',
        role: UserRole.cashier,
        isActive: true,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MockableSaleViewModel extends ChangeNotifier implements SaleViewModel {
  final List<Customer> _mockCustomers = [
    const Customer(
      id: 'c-1',
      name: 'Lucía Méndez',
      taxId: '001-200595-0001K',
      phone: '8999-0001',
      pointsBalance: 120.0,
    ),
    const Customer(
      id: 'c-2',
      name: 'Roberto Gómez',
      taxId: '281-101090-0002L',
      phone: '8888-0002',
      pointsBalance: 0.0,
    ),
  ];

  Customer? _selectedCustomer;
  @override
  Customer? get selectedCustomer => _selectedCustomer;

  String? _customerName;
  @override
  String? get customerName => _customerName;

  @override
  void selectCustomer(Customer? customer) {
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
  Future<List<Customer>> searchCustomers(String query) async {
    if (query.trim().isEmpty) return _mockCustomers;
    final q = query.toLowerCase();
    return _mockCustomers
        .where((c) =>
            c.name.toLowerCase().contains(q) ||
            (c.taxId?.toLowerCase().contains(q) ?? false) ||
            (c.phone?.toLowerCase().contains(q) ?? false))
        .toList();
  }

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
    _mockCustomers.add(customer);
    selectCustomer(customer);
    return customer;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('SaleViewModel - Customer Integration (SQLite Real)', () {
    late AppDatabase database;
    late FakeSalesRepository salesRepo;
    late FakeInventoryRepository inventoryRepo;
    late FakeAuthRepository authRepo;
    late SaleViewModel viewModel;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      salesRepo = FakeSalesRepository();
      inventoryRepo = FakeInventoryRepository();
      authRepo = FakeAuthRepository();

      viewModel = SaleViewModel(
        salesRepo,
        inventoryRepo,
        authRepo,
        database,
        TableOrderService(database),
        false, // autoPrint disabled for test
        TenantConfigService(database.localConfigDao),
        KitchenOrderService(database),
        PrinterConfigService(database.localConfigDao),
      );
    });

    tearDown(() async {
      await database.close();
    });

    test('permite crear cliente express y seleccionarlo automáticamente', () async {
      final customer = await viewModel.createExpressCustomer(
        name: 'Pedro Solís',
        taxId: '001-150388-0005Y',
        phone: '8444-1122',
        email: 'pedro@gmail.com',
      );

      expect(customer.id, isNotEmpty);
      expect(customer.name, equals('Pedro Solís'));
      expect(customer.taxId, equals('001-150388-0005Y'));
      expect(viewModel.selectedCustomer, equals(customer));
      expect(viewModel.customerName, equals('Pedro Solís'));

      // Verificar persistencia en base de datos local
      final dbCustomer = await database.customerDao.getCustomerById(customer.id);
      expect(dbCustomer, isNotNull);
      expect(dbCustomer!.name, equals('Pedro Solís'));
    });

    test('búsqueda predictiva en base de datos local SQLite', () async {
      await viewModel.createExpressCustomer(
        name: 'Carlos Ruiz',
        taxId: '001-010180-0001K',
        phone: '8765-4321',
      );
      await viewModel.createExpressCustomer(
        name: 'María Fernández',
        taxId: '281-150692-0002M',
        phone: '8999-1122',
      );

      final searchResults = await viewModel.searchCustomers('María');
      expect(searchResults.length, equals(1));
      expect(searchResults.first.name, equals('María Fernández'));
    });

    test('asocia el customerId a la Factura generada durante processSale', () async {
      // 1. Crear y asignar cliente
      final customer = await viewModel.createExpressCustomer(
        name: 'Distribuidora Central S.A.',
        taxId: 'J0310000000888',
      );

      // 2. Agregar ítem al carrito
      viewModel.addToCart(
        const Product(
          id: 'prod-01',
          name: 'Café Americano',
          uom: 'UND',
          stock: 100.0,
          averageCost: 20.0,
          sellPrice: 50.0,
          category: 'Bebidas',
        ),
      );

      // 3. Procesar venta
      await viewModel.processSale([PaymentMethod.cash]);

      expect(salesRepo.lastSavedInvoice, isNotNull);
      expect(salesRepo.lastSavedInvoice!.customerId, equals(customer.id));
      expect(viewModel.selectedCustomer, isNull); // Reseteado tras venta
    });
  });

  group('CustomerSelectDialog Widget Tests', () {
    late MockableSaleViewModel mockViewModel;

    setUp(() {
      mockViewModel = MockableSaleViewModel();
    });

    testWidgets('renderiza diálogo, busca clientes existentes y permite seleccionar', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, mockViewModel),
                child: const Text('ABRIR DIALOGO'),
              ),
            ),
          ),
        ),
      );

      // Abrir diálogo
      await tester.tap(find.text('ABRIR DIALOGO'));
      await tester.pumpAndSettle();

      expect(find.text('Seleccionar Cliente'), findsOneWidget);
      expect(find.text('Lucía Méndez'), findsOneWidget);
      expect(find.text('Roberto Gómez'), findsOneWidget);
      expect(find.text('120 pts'), findsOneWidget);

      // Buscar "Lucía"
      await tester.enterText(find.byType(TextField).first, 'Lucía');
      await tester.pumpAndSettle();

      expect(find.text('Lucía Méndez'), findsOneWidget);
      expect(find.text('Roberto Gómez'), findsNothing);

      // Tap en Lucía Méndez
      await tester.tap(find.text('Lucía Méndez'));
      await tester.pumpAndSettle();

      // Diálogo se cierra y cliente queda seleccionado en ViewModel
      expect(mockViewModel.selectedCustomer?.name, equals('Lucía Méndez'));
      expect(mockViewModel.selectedCustomer?.id, equals('c-1'));
    });

    testWidgets('valida RUC/Cédula en caliente y crea cliente express desde el modal', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => CustomerSelectDialog.show(context, mockViewModel),
                child: const Text('ABRIR DIALOGO'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('ABRIR DIALOGO'));
      await tester.pumpAndSettle();

      // Click en "Nuevo"
      await tester.tap(find.text('Nuevo'));
      await tester.pumpAndSettle();

      expect(find.text('Nuevo Cliente'), findsOneWidget);

      // Intentar guardar vacío -> validación
      await tester.tap(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();
      expect(find.text('El nombre del cliente es obligatorio'), findsOneWidget);

      // Ingresar Cédula Inválida
      final taxIdField = find.widgetWithText(TextField, 'Cédula o RUC (Opcional)');
      await tester.enterText(taxIdField, '12345-INVALID');
      await tester.pumpAndSettle();
      expect(find.textContaining('Cédula o RUC inválido'), findsOneWidget);

      // Corregir con nombre y Cédula Válida
      final nameField = find.widgetWithText(TextField, 'Nombre Completo / Razón Social *');
      await tester.enterText(nameField, 'Farmacia San Rafael');
      await tester.enterText(taxIdField, 'J0310000000123');
      await tester.pumpAndSettle();

      // Guardar
      await tester.tap(find.text('Guardar y Seleccionar'));
      await tester.pumpAndSettle();

      expect(mockViewModel.selectedCustomer, isNotNull);
      expect(mockViewModel.selectedCustomer!.name, equals('Farmacia San Rafael'));
    });
  });
}
