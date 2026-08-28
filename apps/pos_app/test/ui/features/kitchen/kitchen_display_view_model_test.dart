import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order_item.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/ui/features/kitchen/kitchen_display_view_model.dart';

class MockKitchenOrderService extends Mock implements KitchenOrderService {
  @override
  Future<List<KitchenOrder>> getActiveOrders({String? station}) =>
      super.noSuchMethod(
        Invocation.method(#getActiveOrders, [], {#station: station}),
        returnValue: Future.value(<KitchenOrder>[]),
        returnValueForMissingStub: Future.value(<KitchenOrder>[]),
      );

  @override
  Future<KitchenOrder> startPreparation(String? orderId) =>
      super.noSuchMethod(
        Invocation.method(#startPreparation, [orderId]),
        returnValue: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'EN_PREPARACION',
          ),
        ),
        returnValueForMissingStub: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'EN_PREPARACION',
          ),
        ),
      );

  @override
  Future<KitchenOrder> markItemStatus({String? orderId, String? itemId, String? status}) =>
      super.noSuchMethod(
        Invocation.method(#markItemStatus, [], {#orderId: orderId, #itemId: itemId, #status: status}),
        returnValue: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'LISTO',
          ),
        ),
        returnValueForMissingStub: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'LISTO',
          ),
        ),
      );

  @override
  Future<KitchenOrder> markOrderReady(String? orderId) =>
      super.noSuchMethod(
        Invocation.method(#markOrderReady, [orderId]),
        returnValue: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'LISTO',
          ),
        ),
        returnValueForMissingStub: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'LISTO',
          ),
        ),
      );

  @override
  Future<KitchenOrder> bumpOrder(String? orderId) =>
      super.noSuchMethod(
        Invocation.method(#bumpOrder, [orderId]),
        returnValue: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'ENTREGADO',
          ),
        ),
        returnValueForMissingStub: Future.value(
          KitchenOrder(
            id: orderId ?? '1',
            ticketId: 't1',
            createdAt: DateTime.now(),
            status: 'ENTREGADO',
          ),
        ),
      );

  @override
  KitchenSlaStatus getSlaStatus(DateTime? createdAt, [DateTime? now]) =>
      super.noSuchMethod(
        Invocation.method(#getSlaStatus, [createdAt, now]),
        returnValue: KitchenSlaStatus.normal,
        returnValueForMissingStub: KitchenSlaStatus.normal,
      );

  @override
  int getElapsedMinutes(DateTime? createdAt, [DateTime? now]) =>
      super.noSuchMethod(
        Invocation.method(#getElapsedMinutes, [createdAt, now]),
        returnValue: 5,
        returnValueForMissingStub: 5,
      );
}

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

  group('KitchenDisplayViewModel Tests (Slice 5.3)', () {
    test('initial state and setTestData', () {
      expect(viewModel.orders, isEmpty);
      expect(viewModel.selectedStation, 'TODAS');
      expect(viewModel.isLoading, isFalse);

      final dummyOrders = [
        KitchenOrder(
          id: 'k1',
          ticketId: 't1',
          tableNumber: 'Mesa 1',
          station: 'COCINA',
          status: 'PENDIENTE',
          createdAt: DateTime.now(),
        ),
        KitchenOrder(
          id: 'k2',
          ticketId: 't2',
          tableNumber: 'Mesa 2',
          station: 'BARRA',
          status: 'PENDIENTE',
          createdAt: DateTime.now(),
        ),
      ];

      viewModel.setTestData(dummyOrders);

      expect(viewModel.orders.length, 2);
      expect(viewModel.pendingCount, 2);
      expect(viewModel.cocinaCount, 1);
      expect(viewModel.barraCount, 1);
    });

    test('selectStation loads filtered orders from service', () async {
      when(mockService.getActiveOrders(station: 'BARRA')).thenAnswer(
        (_) async => [
          KitchenOrder(
            id: 'k2',
            ticketId: 't2',
            station: 'BARRA',
            status: 'PENDIENTE',
            createdAt: DateTime.now(),
          ),
        ],
      );

      await viewModel.selectStation('BARRA');

      expect(viewModel.selectedStation, 'BARRA');
      expect(viewModel.orders.length, 1);
      expect(viewModel.orders.first.station, 'BARRA');
      verify(mockService.getActiveOrders(station: 'BARRA')).called(1);
    });

    test('startPreparation delegates to service and reloads', () async {
      when(mockService.startPreparation('k1')).thenAnswer(
        (_) async => KitchenOrder(
          id: 'k1',
          ticketId: 't1',
          station: 'COCINA',
          status: 'EN_PREPARACION',
          createdAt: DateTime.now(),
        ),
      );
      when(mockService.getActiveOrders(station: null)).thenAnswer((_) async => []);

      await viewModel.startPreparation('k1');

      verify(mockService.startPreparation('k1')).called(1);
      verify(mockService.getActiveOrders(station: null)).called(1);
    });

    test('bumpOrder delegates to service and reloads', () async {
      when(mockService.bumpOrder('k1')).thenAnswer(
        (_) async => KitchenOrder(
          id: 'k1',
          ticketId: 't1',
          station: 'COCINA',
          status: 'ENTREGADO',
          createdAt: DateTime.now(),
        ),
      );
      when(mockService.getActiveOrders(station: null)).thenAnswer((_) async => []);

      await viewModel.bumpOrder('k1');

      verify(mockService.bumpOrder('k1')).called(1);
      verify(mockService.getActiveOrders(station: null)).called(1);
    });
  });
}
