import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order_item.dart';
import 'package:pos_app/ui/features/kitchen/kitchen_display_view.dart';
import 'package:pos_app/ui/features/kitchen/kitchen_display_view_model.dart';
import 'package:pos_app/ui/features/kitchen/widgets/kitchen_order_card_widget.dart';
import 'kitchen_display_view_model_test.dart';

void main() {
  late MockKitchenOrderService mockService;
  late KitchenDisplayViewModel viewModel;

  setUp(() {
    mockService = MockKitchenOrderService();
    viewModel = KitchenDisplayViewModel(
      kitchenOrderService: mockService,
      autoStartTimer: false,
    );
  });

  tearDown(() {
    viewModel.dispose();
  });

  Widget createWidgetUnderTest() {
    return MaterialApp(
      home: ChangeNotifierProvider<KitchenDisplayViewModel>.value(
        value: viewModel,
        child: const KitchenDisplayView(),
      ),
    );
  }

  group('KitchenDisplayView Widget Tests (Slice 5.3)', () {
    testWidgets('renders empty state when there are no active orders', (tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.text('KDS - Cocina / Barra'), findsOneWidget);
      expect(find.text('No hay comandas pendientes en ninguna estación.'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
    });

    testWidgets('renders station filter chips with counters', (tester) async {
      final orders = [
        KitchenOrder(
          id: 'k1',
          ticketId: 't1',
          tableName: 'Mesa 1',
          station: 'COCINA',
          status: 'PENDIENTE',
          createdAt: DateTime.now(),
        ),
        KitchenOrder(
          id: 'k2',
          ticketId: 't2',
          tableName: 'Mesa 2',
          station: 'BARRA',
          status: 'PENDIENTE',
          createdAt: DateTime.now(),
        ),
      ];

      viewModel.setTestData(orders);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.text('Todas (2)'), findsOneWidget);
      expect(find.text('Cocina (1)'), findsOneWidget);
      expect(find.text('Barra (1)'), findsOneWidget);
    });

    testWidgets('renders order cards with SLA timer badges and modifiers', (tester) async {
      final now = DateTime.now();

      final orders = [
        KitchenOrder(
          id: 'k-food',
          ticketId: 't1',
          tableName: 'Mesa 4 - Terraza',
          waiterName: 'Carlos M.',
          station: 'COCINA',
          status: 'PENDIENTE',
          createdAt: now.subtract(const Duration(minutes: 4)),
          notes: 'Cliente con prisa',
          items: const [
            KitchenOrderItem(
              id: 'it-1',
              kitchenOrderId: 'k-food',
              productId: 'p1',
              productName: 'Tacos de Res',
              quantity: 2,
              status: 'PENDIENTE',
              modifiers: ['Sin Cebolla', 'Extra Queso'],
            ),
          ],
        ),
        KitchenOrder(
          id: 'k-bar',
          ticketId: 't2',
          tableName: 'Barra Principal',
          waiterName: 'Ana M.',
          station: 'BARRA',
          status: 'EN_PREPARACION',
          createdAt: now.subtract(const Duration(minutes: 18)),
          items: const [
            KitchenOrderItem(
              id: 'it-2',
              kitchenOrderId: 'k-bar',
              productId: 'p2',
              productName: 'Mojito Cubano',
              quantity: 1,
              status: 'PENDIENTE',
            ),
          ],
        ),
      ];

      viewModel.setTestData(orders);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(2));
      expect(find.text('Mesa 4 - Terraza'), findsOneWidget);
      expect(find.text('Barra Principal'), findsOneWidget);
      expect(find.text('Mesero: Carlos M.'), findsOneWidget);
      expect(find.text('Mesero: Ana M.'), findsOneWidget);

      // Notes & Modifiers
      expect(find.text('Nota: Cliente con prisa'), findsOneWidget);
      expect(find.text('• Sin Cebolla'), findsOneWidget);
      expect(find.text('• Extra Queso'), findsOneWidget);
      expect(find.text('2x'), findsOneWidget);
      expect(find.text('Tacos de Res'), findsOneWidget);
      expect(find.text('1x'), findsOneWidget);
      expect(find.text('Mojito Cubano'), findsOneWidget);

      // Action buttons based on status
      expect(find.text('Iniciar Preparación'), findsOneWidget);
      expect(find.text('Marcar Todo Listo'), findsOneWidget);
    });

    testWidgets('renders bump button when order is LISTO', (tester) async {
      final readyOrder = KitchenOrder(
        id: 'k-ready',
        ticketId: 't3',
        tableName: 'Mesa 7',
        station: 'COCINA',
        status: 'LISTO',
        createdAt: DateTime.now(),
        items: const [
          KitchenOrderItem(
            id: 'it-3',
            kitchenOrderId: 'k-ready',
            productId: 'p3',
            productName: 'Flan de Caramelo',
            quantity: 1,
            status: 'LISTO',
          ),
        ],
      );

      viewModel.setTestData([readyOrder]);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.text('Despachar (Bump)'), findsOneWidget);
    });
  });

  group('KitchenDisplayView scroll retention', () {
    List<KitchenOrder> buildComandas(int count, {String station = 'COCINA'}) {
      return List.generate(count, (i) {
        return KitchenOrder(
          id: 'k-$i',
          ticketId: 't-$i',
          tableName: 'Mesa ${i + 1}',
          station: station,
          status: 'PENDIENTE',
          createdAt: DateTime.now(),
          items: [
            KitchenOrderItem(
              id: 'it-$i',
              kitchenOrderId: 'k-$i',
              productId: 'p-$i',
              productName: 'Plato $i',
              quantity: 1,
              status: 'PENDIENTE',
            ),
          ],
        );
      });
    }

    double currentScrollOffset(WidgetTester tester) {
      return tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .pixels;
    }

    /// Taps the first instance of [finder] whose rect is fully on screen.
    Future<void> tapVisible(WidgetTester tester, Finder finder) async {
      final count = finder.evaluate().length;
      for (var i = 0; i < count; i++) {
        final rect = tester.getRect(finder.at(i));
        if (rect.top >= 0 &&
            rect.left >= 0 &&
            rect.right <= 800 &&
            rect.bottom <= 600) {
          await tester.tap(finder.at(i));
          return;
        }
      }
      fail('expected an on-screen instance of $finder');
    }

    testWidgets(
        'keeps scroll position and cards mounted during a background refresh',
        (tester) async {
      final orders = buildComandas(12);
      viewModel.setTestData(orders);

      // Hold the refresh in flight so a frame renders while isLoading is true,
      // exactly like the 30s periodic timer does.
      final refreshCompleter = Completer<List<KitchenOrder>>();
      when(mockService.getActiveOrders(station: null))
          .thenAnswer((_) => refreshCompleter.future);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));

      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -500));
      await tester.pumpAndSettle();
      final offsetBefore = currentScrollOffset(tester);
      expect(offsetBefore, greaterThan(0));

      // Same call the periodic refresh timer makes.
      final refreshFuture = viewModel.loadOrders();
      await tester.pump(); // frame rendered while isLoading == true

      // Non-destructive loading: already-loaded comandas stay mounted.
      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));
      expect(find.byType(CircularProgressIndicator), findsNothing);

      refreshCompleter.complete(orders);
      await tester.pumpAndSettle();
      await refreshFuture;

      expect(currentScrollOffset(tester), offsetBefore);
      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));
    });

    testWidgets('keeps scroll position after a card action triggers a reload',
        (tester) async {
      final orders = buildComandas(12);
      viewModel.setTestData(orders);

      final prepCompleter = Completer<KitchenOrder>();
      when(mockService.startPreparation('k-0'))
          .thenAnswer((_) => prepCompleter.future);
      final refreshCompleter = Completer<List<KitchenOrder>>();
      when(mockService.getActiveOrders(station: null))
          .thenAnswer((_) => refreshCompleter.future);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -500));
      await tester.pumpAndSettle();
      final offsetBefore = currentScrollOffset(tester);
      expect(offsetBefore, greaterThan(0));

      await tapVisible(tester, find.text('Iniciar Preparación'));
      await tester.pump(); // tap processed, startPreparation in flight

      prepCompleter.complete(
        KitchenOrder(
          id: 'k-0',
          ticketId: 't-0',
          tableName: 'Mesa 1',
          station: 'COCINA',
          status: 'EN_PREPARACION',
          createdAt: DateTime.now(),
        ),
      );
      await tester.pump(); // reload started: frame rendered while isLoading == true

      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));
      expect(find.byType(CircularProgressIndicator), findsNothing);

      refreshCompleter.complete(orders);
      await tester.pumpAndSettle();

      expect(currentScrollOffset(tester), offsetBefore);
      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));
    });

    testWidgets(
        'shows no full-screen spinner while loading with comandas already on screen',
        (tester) async {
      final orders = buildComandas(12);
      viewModel.setTestData(orders);

      final refreshCompleter = Completer<List<KitchenOrder>>();
      when(mockService.getActiveOrders(station: null))
          .thenAnswer((_) => refreshCompleter.future);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();
      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));

      final refreshFuture = viewModel.loadOrders();
      await tester.pump(); // frame rendered while isLoading == true

      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));
      expect(find.byType(CircularProgressIndicator), findsNothing);

      refreshCompleter.complete(orders);
      await tester.pumpAndSettle();
      await refreshFuture;
    });

    testWidgets('renders error state with Reintentar when no orders exist',
        (tester) async {
      when(mockService.getActiveOrders(station: null))
          .thenAnswer((_) async => throw Exception('fallo de red'));

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      final refreshFuture = viewModel.loadOrders();
      await tester.pumpAndSettle();
      await refreshFuture;

      expect(find.textContaining('Error al cargar comandas'), findsOneWidget);
      expect(find.text('Reintentar'), findsOneWidget);
    });

    testWidgets('resets scroll to top when the station filter changes',
        (tester) async {
      final orders = buildComandas(12);
      viewModel.setTestData(orders);
      when(mockService.getActiveOrders(station: 'COCINA'))
          .thenAnswer((_) async => orders);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(currentScrollOffset(tester), greaterThan(0));

      final stationChangeFuture = viewModel.selectStation('COCINA');
      await tester.pump(); // frame rendered while isLoading == true
      await tester.pumpAndSettle();
      await stationChangeFuture;

      expect(currentScrollOffset(tester), 0.0);
      expect(find.byType(KitchenOrderCardWidget), findsNWidgets(12));
    });

    testWidgets(
        'keeps comandas mounted and preserves scroll when a card action fails',
        (tester) async {
      final orders = buildComandas(12);
      viewModel.setTestData(orders);
      when(mockService.startPreparation(any))
          .thenThrow(Exception('fallo de persistencia'));

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -500));
      await tester.pumpAndSettle();
      final offsetBefore = currentScrollOffset(tester);
      expect(offsetBefore, greaterThan(0));

      // A failed card action sets errorMessage while comandas are still loaded.
      // Replacing the whole list here would throw the cook back to offset 0,
      // which is the exact complaint in the field report.
      await tapVisible(tester, find.text('Iniciar Preparación'));
      await tester.pumpAndSettle();

      expect(viewModel.errorMessage, isNotNull);
      expect(
        find.byType(KitchenOrderCardWidget),
        findsNWidgets(12),
        reason: 'a failed action must not unmount the loaded comandas',
      );
      expect(currentScrollOffset(tester), offsetBefore);
      // The failure must still be visible and actionable without losing the list.
      expect(find.textContaining('Error al iniciar preparación'), findsOneWidget);
      expect(find.text('Reintentar'), findsOneWidget);
    });
  });
}
