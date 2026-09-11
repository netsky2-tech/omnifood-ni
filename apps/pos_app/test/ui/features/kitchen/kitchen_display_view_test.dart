import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
}
