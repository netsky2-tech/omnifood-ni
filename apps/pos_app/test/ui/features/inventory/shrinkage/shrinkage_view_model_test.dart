import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/shrinkage/shrinkage_view_model.dart';

import 'shrinkage_view_test.mocks.dart';

class FakeAuthRepository extends Fake implements AuthRepository {
  User? currentUser;
  int getCurrentUserCallCount = 0;

  FakeAuthRepository({this.currentUser});

  @override
  Future<User?> getCurrentUser() async {
    getCurrentUserCallCount++;
    return currentUser;
  }
}

void main() {
  late MockInventoryRepository mockRepo;
  late MockMovementEngine mockEngine;
  late FakeAuthRepository fakeAuth;
  late ShrinkageViewModel vm;

  const testInsumo = Insumo(
    id: 'insumo-1',
    name: 'Leche',
    consumptionUom: 'L',
    stock: 10,
    averageCost: 35.0,
  );

  const testProduct = Product(
    id: 'prod-1',
    name: 'Café con Leche',
    uom: 'taza',
    stock: 0,
    averageCost: 20.0,
    sellPrice: 60.0,
    isPrepared: true,
  );

  const testUser = User(
    id: 'user-barista-99',
    name: 'Carlos Barista',
    role: UserRole.cashier,
    isActive: true,
  );

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockEngine = MockMovementEngine();
    fakeAuth = FakeAuthRepository(currentUser: testUser);

    when(mockRepo.getActiveInsumos()).thenAnswer((_) async => [testInsumo]);
    when(mockRepo.getActiveProducts()).thenAnswer((_) async => [testProduct]);
    when(mockRepo.getBatchesByInsumoId(any)).thenAnswer((_) async => []);

    vm = ShrinkageViewModel(
      mockRepo,
      mockEngine,
      authRepository: fakeAuth,
    );
  });

  test('recordShrinkage captures authenticated userId from AuthRepository (issue #535)', () async {
    when(
      mockEngine.recordShrinkage(
        any,
        any,
        any,
        userId: anyNamed('userId'),
      ),
    ).thenAnswer((_) async {});

    await vm.loadInsumos();
    await vm.recordShrinkage(
      insumoId: 'insumo-1',
      quantity: 2.0,
      shrinkageType: 'DESECHO_COCINA',
      observation: 'Cartón roto en refrigerador',
    );

    verify(
      mockEngine.recordShrinkage(
        'insumo-1',
        2.0,
        'DESECHO_COCINA | observation:Cartón roto en refrigerador',
        userId: 'user-barista-99',
      ),
    ).called(1);
  });

  test('recordProductShrinkage captures authenticated userId from AuthRepository (issue #535)', () async {
    when(
      mockEngine.recordProductShrinkage(
        productId: anyNamed('productId'),
        quantity: anyNamed('quantity'),
        reason: anyNamed('reason'),
        userId: anyNamed('userId'),
      ),
    ).thenAnswer((_) async {});

    await vm.loadInsumos();
    await vm.recordProductShrinkage(
      productId: 'prod-1',
      quantity: 1.0,
      shrinkageType: 'VENCIDO',
      observation: 'No retirado a tiempo',
    );

    verify(
      mockEngine.recordProductShrinkage(
        productId: 'prod-1',
        quantity: 1.0,
        reason: 'VENCIDO | observation:No retirado a tiempo',
        userId: 'user-barista-99',
      ),
    ).called(1);
  });

  test('recordShrinkage honors explicitly supplied userId over auth fallback', () async {
    when(
      mockEngine.recordShrinkage(
        any,
        any,
        any,
        userId: anyNamed('userId'),
      ),
    ).thenAnswer((_) async {});

    await vm.loadInsumos();
    await vm.recordShrinkage(
      insumoId: 'insumo-1',
      quantity: 1.0,
      shrinkageType: 'DETERIORO_BODEGA',
      observation: 'Golpe en transporte',
      userId: 'explicit-admin-1',
    );

    verify(
      mockEngine.recordShrinkage(
        'insumo-1',
        1.0,
        'DETERIORO_BODEGA | observation:Golpe en transporte',
        userId: 'explicit-admin-1',
      ),
    ).called(1);
    expect(fakeAuth.getCurrentUserCallCount, equals(0));
  });
}
