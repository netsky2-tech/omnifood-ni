import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/models/sales/restaurant_area.dart';
import 'package:pos_app/domain/models/sales/restaurant_table.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/ui/features/sales/tables/table_layout_view.dart';
import 'package:pos_app/ui/features/sales/tables/table_layout_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import '../../../presentation/features/sales/sale_view_model_test.mocks.dart';

void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late AppDatabase database;
  late TableOrderService tableOrderService;
  late SaleViewModel saleViewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  tearDown(() async {
    await database.close();
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    tableOrderService = TableOrderService(database);

    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();

    when(mockAuthRepo.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Carlos Cajero',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);

    saleViewModel = SaleViewModel(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      database,
      tableOrderService,
      false,
    );

    // Seed Areas
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
      RestaurantAreaEntity(id: 'area-2', name: 'Terraza', displayOrder: 2),
    ]);

    // Seed Tables
    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(id: 'tbl-1', areaId: 'area-1', tableNumber: 'Mesa 1', capacity: 4),
      RestaurantTableEntity(id: 'tbl-2', areaId: 'area-1', tableNumber: 'Mesa 2', capacity: 6),
    ]);
  });

  Widget createTestWidget(TableLayoutViewModel vm) {
    return MaterialApp(
      home: TableLayoutView(viewModel: vm),
    );
  }

  group('TableLayoutView Widget Tests (Slice 4.3)', () {
    testWidgets('sanity test', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Text('Hello'))));
      expect(find.text('Hello'), findsOneWidget);
    });

    testWidgets('renders area filter and table card in a column', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                AreaFilterBarWidget(
                  areas: const [
                    RestaurantArea(id: 'a1', name: 'Salón Principal', displayOrder: 1),
                  ],
                  selectedAreaId: null,
                  onSelectArea: (_) {},
                ),
                Expanded(
                  child: TableCardWidget(
                    table: const RestaurantTable(id: '1', areaId: 'a1', tableNumber: 'Mesa 1'),
                    totalAmount: 100.0,
                    activeTicket: null,
                    onTableTapped: () {},
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Salón Principal'), findsOneWidget);
      expect(find.text('Mesa 1'), findsOneWidget);
    });

    testWidgets('renders area chips and table cards', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = TableLayoutViewModel(database: database, tableOrderService: tableOrderService, autoLoad: false);
      vm.setTestData(
        areas: const [
          RestaurantArea(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
          RestaurantArea(id: 'area-2', name: 'Terraza', displayOrder: 2),
        ],
        tables: const [
          RestaurantTable(id: 'tbl-1', areaId: 'area-1', tableNumber: 'Mesa 1', capacity: 4),
          RestaurantTable(id: 'tbl-2', areaId: 'area-1', tableNumber: 'Mesa 2', capacity: 6),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: TableLayoutContent(viewModel: vm),
        ),
      );
      await tester.pump();

      expect(find.text('Control de Mesas y Áreas'), findsOneWidget);
      expect(find.text('Todas las Áreas'), findsOneWidget);
      expect(find.text('Salón Principal'), findsOneWidget);
      expect(find.text('Terraza'), findsOneWidget);

      expect(find.text('Mesa 1'), findsOneWidget);
      expect(find.text('Mesa 2'), findsOneWidget);
      expect(find.text('DISPONIBLE'), findsNWidgets(2));
    });

    testWidgets('tapping available table opens open comanda dialog', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = TableLayoutViewModel(database: database, tableOrderService: tableOrderService, autoLoad: false);
      vm.setTestData(
        areas: const [
          RestaurantArea(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
        ],
        tables: const [
          RestaurantTable(id: 'tbl-1', areaId: 'area-1', tableNumber: 'Mesa 1', capacity: 4),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: TableLayoutContent(viewModel: vm),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Mesa 1'));
      await tester.pump();

      expect(find.text('Abrir Comanda - Mesa 1'), findsOneWidget);
      expect(find.text('Número de Comensales:'), findsOneWidget);
      expect(find.text('ABRIR COMANDA'), findsOneWidget);
    });

    testWidgets('tapping occupied table opens table actions dialog with comanda details', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final occupiedTable = RestaurantTable(
        id: 'tbl-1',
        areaId: 'area-1',
        tableNumber: 'Mesa 1',
        capacity: 4,
        status: 'OCUPADA',
        activeGuests: 4,
        currentTicketId: 'tick-1',
        openedAt: DateTime.now().subtract(const Duration(minutes: 25)),
      );

      final holdTicket = HoldTicket(
        id: 'tick-1',
        name: 'Mesa 1 - Cumpleaños',
        createdAt: DateTime.now().subtract(const Duration(minutes: 25)),
        tableId: 'tbl-1',
        areaId: 'area-1',
        waiterName: 'Carlos M.',
        guestCount: 4,
        items: const [
          CartItem(
            productId: 'p-1',
            productName: 'Pizza Familiar',
            quantity: 1,
            unitPrice: 450.0,
            taxRate: 0.15,
          ),
        ],
      );

      final vm = TableLayoutViewModel(database: database, tableOrderService: tableOrderService, autoLoad: false);
      vm.setTestData(
        areas: const [
          RestaurantArea(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
        ],
        tables: [
          occupiedTable,
          const RestaurantTable(id: 'tbl-2', areaId: 'area-1', tableNumber: 'Mesa 2', capacity: 6),
        ],
        ticketsByTableId: {
          'tbl-1': holdTicket,
        },
      );

      await tester.pumpWidget(
        MaterialApp(
          home: TableLayoutContent(viewModel: vm),
        ),
      );
      await tester.pump();

      expect(find.text('OCUPADA'), findsOneWidget);
      expect(find.text('DISPONIBLE'), findsOneWidget);

      // Tap occupied table
      await tester.tap(find.text('Mesa 1'));
      await tester.pump();

      expect(find.text('Mesa 1 - Opciones'), findsOneWidget);
      expect(find.text('Comanda: Mesa 1 - Cumpleaños'), findsOneWidget);
      expect(find.text('Atiende: Carlos M.'), findsOneWidget);
      expect(find.text('Continuar Comanda / Agregar Ítems'), findsOneWidget);
      expect(find.text('Cobrar en Caja'), findsOneWidget);
      expect(find.text('Cambiar / Transferir de Mesa'), findsOneWidget);
      expect(find.text('Fusionar con otra Mesa'), findsOneWidget);
    });

    testWidgets('tapping area chip filters the visible tables correctly', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = TableLayoutViewModel(database: database, tableOrderService: tableOrderService, autoLoad: false);
      vm.setTestData(
        areas: const [
          RestaurantArea(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
          RestaurantArea(id: 'area-2', name: 'Terraza', displayOrder: 2),
        ],
        tables: const [
          RestaurantTable(id: 'tbl-1', areaId: 'area-1', tableNumber: 'Mesa 1', capacity: 4),
          RestaurantTable(id: 'tbl-2', areaId: 'area-2', tableNumber: 'Mesa Terraza', capacity: 2),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<TableLayoutViewModel>.value(
            value: vm,
            child: const TableLayoutContent(),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Mesa 1'), findsOneWidget);
      expect(find.text('Mesa Terraza'), findsOneWidget);

      // Tap 'Terraza' chip
      await tester.tap(find.text('Terraza'));
      await tester.pump();

      expect(find.text('Mesa 1'), findsNothing);
      expect(find.text('Mesa Terraza'), findsOneWidget);

      // Tap 'Todas las Áreas' chip
      await tester.tap(find.text('Todas las Áreas'));
      await tester.pump();

      expect(find.text('Mesa 1'), findsOneWidget);
      expect(find.text('Mesa Terraza'), findsOneWidget);
    });

    testWidgets('tapping transfer option opens transfer table dialog with available targets', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final occupiedTable = RestaurantTable(
        id: 'tbl-1',
        areaId: 'area-1',
        tableNumber: 'Mesa 1',
        capacity: 4,
        status: 'OCUPADA',
        activeGuests: 2,
      );

      final availableTable = const RestaurantTable(
        id: 'tbl-2',
        areaId: 'area-1',
        tableNumber: 'Mesa 2',
        capacity: 4,
        status: 'DISPONIBLE',
      );

      final vm = TableLayoutViewModel(database: database, tableOrderService: tableOrderService, autoLoad: false);
      vm.setTestData(
        areas: const [
          RestaurantArea(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
        ],
        tables: [occupiedTable, availableTable],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: TableLayoutContent(viewModel: vm),
        ),
      );
      await tester.pump();

      // Tap occupied table
      await tester.tap(find.text('Mesa 1'));
      await tester.pump();

      // Tap transfer option
      await tester.tap(find.text('Cambiar / Transferir de Mesa'));
      await tester.pump();

      expect(find.text('Transferir Mesa 1'), findsOneWidget);
      expect(find.text('Seleccione la nueva mesa disponible:'), findsOneWidget);
      expect(find.text('TRANSFERIR'), findsOneWidget);
    });
  });
}
