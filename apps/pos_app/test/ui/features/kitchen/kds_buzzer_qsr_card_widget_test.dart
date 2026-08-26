import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order_item.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/ui/features/kitchen/widgets/kitchen_order_card_widget.dart';

void main() {
  group('KDS Buzzer & QSR Card Widget Tests (Slice 6.3)', () {
    testWidgets('renders prominent Buzzer badge for QSR counter orders with buzzer', (tester) async {
      final now = DateTime.now();
      final buzzerOrder = KitchenOrder(
        id: 'k-buzzer-1',
        ticketId: 'inv-101',
        tableNumber: '15',
        tableName: 'Buzzer #15',
        station: 'COCINA',
        status: 'PENDIENTE',
        createdAt: now,
        items: const [
          KitchenOrderItem(
            id: 'it-1',
            kitchenOrderId: 'k-buzzer-1',
            productId: 'prod-1',
            productName: 'Hamburguesa FoodPark',
            quantity: 1,
            status: 'PENDIENTE',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KitchenOrderCardWidget(
              order: buzzerOrder,
              slaStatus: KitchenSlaStatus.normal,
              elapsedMinutes: 2,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Check for buzzer badge
      expect(find.byKey(const Key('kds_buzzer_badge')), findsOneWidget);
      expect(find.text('Buzzer #15'), findsWidgets);
      expect(find.byIcon(Icons.notifications_active), findsOneWidget);
    });

    testWidgets('renders customer name along with buzzer number if present in tableName', (tester) async {
      final now = DateTime.now();
      final customerBuzzerOrder = KitchenOrder(
        id: 'k-buzzer-2',
        ticketId: 'inv-102',
        tableNumber: '24',
        tableName: 'María López (Buzzer #24)',
        station: 'BARRA',
        status: 'EN_PREPARACION',
        createdAt: now.subtract(const Duration(minutes: 5)),
        items: const [
          KitchenOrderItem(
            id: 'it-2',
            kitchenOrderId: 'k-buzzer-2',
            productId: 'prod-2',
            productName: 'Smoothie Pitahaya',
            quantity: 2,
            status: 'PENDIENTE',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KitchenOrderCardWidget(
              order: customerBuzzerOrder,
              slaStatus: KitchenSlaStatus.normal,
              elapsedMinutes: 5,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('kds_buzzer_badge')), findsOneWidget);
      expect(find.text('María López (Buzzer #24)'), findsOneWidget);
      expect(find.byIcon(Icons.notifications_active), findsOneWidget);
    });

    testWidgets('does NOT render buzzer badge for standard restaurant table orders', (tester) async {
      final now = DateTime.now();
      final tableOrder = KitchenOrder(
        id: 'k-table-1',
        ticketId: 'hold-1',
        tableNumber: 'tab-1',
        tableName: 'Mesa 4 - Terraza',
        waiterName: 'Carlos M.',
        station: 'COCINA',
        status: 'PENDIENTE',
        createdAt: now,
        items: const [
          KitchenOrderItem(
            id: 'it-3',
            kitchenOrderId: 'k-table-1',
            productId: 'prod-3',
            productName: 'Tacos de Pollo',
            quantity: 3,
            status: 'PENDIENTE',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KitchenOrderCardWidget(
              order: tableOrder,
              slaStatus: KitchenSlaStatus.normal,
              elapsedMinutes: 1,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('kds_buzzer_badge')), findsNothing);
      expect(find.text('Mesa 4 - Terraza'), findsOneWidget);
      expect(find.text('Mesero: Carlos M.'), findsOneWidget);
    });

    testWidgets('shows prominent buzzer call banner when buzzer order is LISTO', (tester) async {
      final now = DateTime.now();
      final readyBuzzerOrder = KitchenOrder(
        id: 'k-buzzer-ready',
        ticketId: 'inv-103',
        tableNumber: '08',
        tableName: 'Buzzer #08',
        station: 'COCINA',
        status: 'LISTO',
        createdAt: now.subtract(const Duration(minutes: 8)),
        readyAt: now,
        items: const [
          KitchenOrderItem(
            id: 'it-4',
            kitchenOrderId: 'k-buzzer-ready',
            productId: 'prod-4',
            productName: 'Pizza Personal',
            quantity: 1,
            status: 'LISTO',
          ),
        ],
      );

      bool bumpCalled = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KitchenOrderCardWidget(
              order: readyBuzzerOrder,
              slaStatus: KitchenSlaStatus.normal,
              elapsedMinutes: 8,
              onBump: () => bumpCalled = true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Check for call banner
      expect(find.byKey(const Key('kds_buzzer_call_banner')), findsOneWidget);
      expect(find.textContaining('LLAMAR LOCALIZADOR #08'), findsOneWidget);

      // Check bump action
      final bumpButton = find.byType(ElevatedButton);
      expect(bumpButton, findsOneWidget);
      await tester.tap(bumpButton);
      await tester.pumpAndSettle();

      expect(bumpCalled, isTrue);
    });
  });
}
