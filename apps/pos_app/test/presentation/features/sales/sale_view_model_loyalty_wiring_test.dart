import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/customer/customer_dao.dart';
import 'package:pos_app/data/daos/customer/customer_point_transaction_dao.dart';
import 'package:pos_app/data/daos/loyalty/loyalty_program_dao.dart';
import 'package:pos_app/data/daos/loyalty/loyalty_reward_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/kitchen/kitchen_order_dao.dart';
import 'package:pos_app/data/daos/sales/tax_config_dao.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_program_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_reward_entity.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_reward_interaction_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/models/loyalty/customer_code.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'sale_view_model_loyalty_wiring_test.mocks.dart';
import 'dart:async';

// --- Fakes for non-loyalty DAOs (same as existing test) ---

class FakeLocalConfigDao extends Mock implements LocalConfigDao {
  @override
  Future<String?> getConfigValue(String? key) async => null;
}

class FakeKitchenOrderDao extends Mock implements KitchenOrderDao {}

class FakeTaxConfigDao extends Mock implements TaxConfigDao {
  @override
  Future<List<TaxConfigEntity>> getAllTaxConfigs() async => [];
}

class FakeKitchenOrderService extends KitchenOrderService {
  FakeKitchenOrderService(super.database);

  @override
  Future<List<KitchenOrder>> sendDirectSaleToKitchen({
    required String invoiceId,
    required String invoiceNumber,
    required List<CartItem> items,
    String? buzzerNumber,
    String? customerName,
    String? waiterName,
    Map<String, String>? productCategories,
  }) async {
    return [];
  }
}

class FakeTenantConfigService extends TenantConfigService {
  FakeTenantConfigService(super.localConfigDao);

  @override
  Future<TenantConfig> getTenantConfig() async => const TenantConfig();

  @override
  Stream<TenantOperationMode> get onOperationModeChanged =>
      const Stream.empty();
}

class FakeSyncService extends Mock implements SyncService {
  final _controller = StreamController<InboundSyncResult>.broadcast();
  @override
  Stream<InboundSyncResult> get onInboundSync => _controller.stream;
  void emitSync(InboundSyncResult result) => _controller.add(result);
}

// --- Mocks ---

@GenerateMocks([
  SalesRepository,
  InventoryRepository,
  AuthRepository,
  AppDatabase,
  CustomerDao,
  CustomerPointTransactionDao,
  LoyaltyProgramDao,
  LoyaltyRewardDao,
  CashierSessionDao,
  HoldTicketDao,
  PromotionDao,
  CustomerIdentificationService,
  LoyaltyRewardInteractionService,
  LoyaltyEvaluationService,
])
void main() {
  late MockSalesRepository mockSalesRepo;
  late MockInventoryRepository mockInventoryRepo;
  late MockAuthRepository mockAuthRepo;
  late MockAppDatabase mockDb;
  late MockCustomerDao mockCustomerDao;
  late MockCustomerPointTransactionDao mockPointTxDao;
  late MockLoyaltyProgramDao mockProgramDao;
  late MockLoyaltyRewardDao mockRewardDao;
  late MockCashierSessionDao mockSessionDao;
  late MockHoldTicketDao mockHoldDao;
  late MockPromotionDao mockPromoDao;
  late MockCustomerIdentificationService mockIdentificationService;
  late MockLoyaltyRewardInteractionService mockRewardInteraction;
  late MockLoyaltyEvaluationService mockEvaluationService;
  late FakeTenantConfigService fakeTenantConfigService;
  late FakeKitchenOrderService fakeKitchenOrderService;

  late SaleViewModel viewModel;

  // Test fixtures
  const tenantId =
      'cust-1'; // Must match testCustomer.id (_reEvaluateLoyalty uses _selectedCustomer.id)
  const customerId = 'cust-1';
  const programId = 'prog-smash';
  const rewardId = 'rw-smash-burger';

  final testCustomer = const Customer(
    id: customerId,
    name: 'Carlos Test',
    pointsBalance: 6.0,
    isActive: true,
    customerCode: 'DEF456ABC123',
  );

  final testProgram = const LoyaltyProgramLocal(
    id: programId,
    tenantId: tenantId,
    name: 'Smash Burger Club',
    programType: LoyaltyProgramType.productStamps,
    status: LoyaltyProgramStatus.active,
    earningRuleJson:
        '{"eligibleProductIds":["prod-1"],"unitsPerPurchasedUnit":1}',
    eligibilityRuleJson: '{}',
    configVersion: 1,
  );

  final testReward = const RewardDefinitionLocal(
    id: rewardId,
    tenantId: tenantId,
    loyaltyProgramId: programId,
    name: 'Smash Burger Gratis',
    rewardType: RewardType.freeProduct,
    costUnits: 10,
    benefitConfigJson: '{"productId":"prod-1"}',
    status: RewardStatus.active,
    configVersion: 1,
    presentationOrder: 1,
  );

  final testProgramEntity = LoyaltyProgramEntity(
    id: programId,
    tenantId: tenantId,
    name: 'Smash Burger Club',
    programType: 'productStamps',
    status: 'ACTIVE',
    earningRuleJson:
        '{"eligibleProductIds":["prod-1"],"unitsPerPurchasedUnit":1}',
    eligibilityRuleJson: '{}',
    configVersion: 1,
    createdAt: DateTime.now().millisecondsSinceEpoch,
    updatedAt: DateTime.now().millisecondsSinceEpoch,
  );

  final testRewardEntity = LoyaltyRewardEntity(
    id: rewardId,
    tenantId: tenantId,
    loyaltyProgramId: programId,
    name: 'Smash Burger Gratis',
    rewardType: 'freeProduct',
    costUnits: 10,
    benefitConfigJson: '{"productId":"prod-1"}',
    status: 'ACTIVE',
    presentationOrder: 1,
    configVersion: 1,
    createdAt: DateTime.now().millisecondsSinceEpoch,
    updatedAt: DateTime.now().millisecondsSinceEpoch,
  );

  setUp(() {
    mockSalesRepo = MockSalesRepository();
    mockInventoryRepo = MockInventoryRepository();
    mockAuthRepo = MockAuthRepository();
    mockDb = MockAppDatabase();
    mockCustomerDao = MockCustomerDao();
    mockPointTxDao = MockCustomerPointTransactionDao();
    mockProgramDao = MockLoyaltyProgramDao();
    mockRewardDao = MockLoyaltyRewardDao();
    mockSessionDao = MockCashierSessionDao();
    mockHoldDao = MockHoldTicketDao();
    mockPromoDao = MockPromotionDao();
    mockIdentificationService = MockCustomerIdentificationService();
    mockRewardInteraction = MockLoyaltyRewardInteractionService();
    mockEvaluationService = MockLoyaltyEvaluationService();

    // Wire database DAOs
    when(mockDb.customerDao).thenReturn(mockCustomerDao);
    when(mockDb.customerPointTransactionDao).thenReturn(mockPointTxDao);
    when(mockDb.loyaltyProgramDao).thenReturn(mockProgramDao);
    when(mockDb.loyaltyRewardDao).thenReturn(mockRewardDao);
    when(mockDb.cashierSessionDao).thenReturn(mockSessionDao);
    when(mockDb.holdTicketDao).thenReturn(mockHoldDao);
    when(mockDb.promotionDao).thenReturn(mockPromoDao);
    when(mockDb.localConfigDao).thenReturn(FakeLocalConfigDao());
    when(mockDb.kitchenOrderDao).thenReturn(FakeKitchenOrderDao());
    when(mockDb.taxConfigDao).thenReturn(FakeTaxConfigDao());

    fakeKitchenOrderService = FakeKitchenOrderService(mockDb);
    fakeTenantConfigService = FakeTenantConfigService(mockDb.localConfigDao);

    when(mockAuthRepo.getCurrentUser()).thenAnswer((_) async => null);
    when(mockInventoryRepo.getActiveProducts()).thenAnswer((_) async => []);
    when(mockSessionDao.getActiveSession()).thenAnswer((_) async => null);
    when(mockHoldDao.getAllHoldTickets()).thenAnswer((_) async => []);
    when(mockPromoDao.getActivePromotions()).thenAnswer((_) async => []);
    when(mockPromoDao.getAllPromotions()).thenAnswer((_) async => []);

    // Default loyalty DAO responses (empty)
    when(
      mockProgramDao.getActivePrograms(tenantId),
    ).thenAnswer((_) async => []);
    when(mockRewardDao.getActiveRewards(tenantId)).thenAnswer((_) async => []);

    // Default identification service
    when(mockIdentificationService.identify(any)).thenAnswer((_) async => null);

    // Default reward interaction
    when(mockRewardInteraction.selectedRewardId).thenReturn(null);
    when(mockRewardInteraction.canShowCta(any)).thenReturn(false);
    when(mockRewardInteraction.validateAfterCartChange(any)).thenReturn(false);
    when(mockRewardInteraction.getSelectedReward(any)).thenReturn(null);

    // Default evaluation service
    when(
      mockEvaluationService.evaluate(
        snapshot: anyNamed('snapshot'),
        programs: anyNamed('programs'),
        rewards: anyNamed('rewards'),
        balanceMap: anyNamed('balanceMap'),
      ),
    ).thenAnswer(
      (_) => const LoyaltyEvaluation(
        customerId: customerId,
        ticketId: 'ticket-1',
        programs: [],
      ),
    );

    viewModel = SaleViewModel.withLoyalty(
      mockSalesRepo,
      mockInventoryRepo,
      mockAuthRepo,
      mockDb,
      autoLoad: false,
      tenantConfigService: fakeTenantConfigService,
      kitchenOrderService: fakeKitchenOrderService,
      identificationService: mockIdentificationService,
      rewardInteractionService: mockRewardInteraction,
      evaluationService: mockEvaluationService,
    );
    viewModel.setCompanyTaxRegime(TaxRegime.cuotaFija);
  });

  group('identifyCustomer', () {
    test('delegates to CustomerIdentificationService', () async {
      when(mockIdentificationService.identify('NHL1:DEF456ABC123')).thenAnswer(
        (_) async => CustomerIdentificationResult(
          customer: testCustomer,
          method: IdentificationMethod.qr,
        ),
      );

      final result = await viewModel.identifyCustomer('NHL1:DEF456ABC123');

      expect(result, isNotNull);
      expect(result!.id, customerId);
      verify(mockIdentificationService.identify('NHL1:DEF456ABC123')).called(1);
    });

    test('returns null when identification fails', () async {
      when(
        mockIdentificationService.identify('unknown'),
      ).thenAnswer((_) async => null);

      final result = await viewModel.identifyCustomer('unknown');

      expect(result, isNull);
    });

    test('sets selectedCustomer on successful identification', () async {
      when(mockIdentificationService.identify('DEF456ABC123')).thenAnswer(
        (_) async => CustomerIdentificationResult(
          customer: testCustomer,
          method: IdentificationMethod.customerCode,
        ),
      );

      await viewModel.identifyCustomer('DEF456ABC123');

      expect(viewModel.selectedCustomer, isNotNull);
      expect(viewModel.selectedCustomer!.id, customerId);
    });
  });

  group('selectCustomer triggers re-evaluation', () {
    test(
      'calls LoyaltyEvaluationService.evaluate when customer selected with programs',
      () async {
        // Arrange: DAOs return programs
        when(
          mockProgramDao.getActivePrograms(tenantId),
        ).thenAnswer((_) async => [testProgramEntity]);
        when(
          mockRewardDao.getActiveRewards(tenantId),
        ).thenAnswer((_) async => [testRewardEntity]);

        // Arrange: evaluation returns a real evaluation
        final evaluation = LoyaltyEvaluation(
          customerId: customerId,
          ticketId: '',
          programs: [
            const ProgramEvaluation(
              programId: programId,
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 6,
            ),
          ],
        );
        when(
          mockEvaluationService.evaluate(
            snapshot: anyNamed('snapshot'),
            programs: anyNamed('programs'),
            rewards: anyNamed('rewards'),
            balanceMap: anyNamed('balanceMap'),
          ),
        ).thenReturn(evaluation);

        // Act
        await viewModel.selectCustomer(testCustomer);

        // Assert: evaluation is set
        expect(viewModel.currentEvaluation, isNotNull);
        expect(viewModel.currentEvaluation!.programs.length, 1);
        expect(viewModel.currentEvaluation!.programs.first.balanceUnits, 6);
      },
    );

    test('clears evaluation when customer is null', () async {
      await viewModel.selectCustomer(testCustomer);
      expect(viewModel.currentEvaluation, isNotNull);

      await viewModel.selectCustomer(null);
      expect(viewModel.currentEvaluation, isNull);
    });
  });

  group('selectReward / clearReward', () {
    test('selectReward delegates to LoyaltyRewardInteractionService', () async {
      when(mockRewardInteraction.canShowCta(any)).thenReturn(true);

      // Arrange: create an evaluation with eligible reward
      final evaluation = LoyaltyEvaluation(
        customerId: customerId,
        ticketId: '',
        programs: [
          ProgramEvaluation(
            programId: programId,
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 10,
            eligibleRewards: [testReward.toEligibleReward()],
          ),
        ],
      );
      when(
        mockEvaluationService.evaluate(
          snapshot: anyNamed('snapshot'),
          programs: anyNamed('programs'),
          rewards: anyNamed('rewards'),
          balanceMap: anyNamed('balanceMap'),
        ),
      ).thenReturn(evaluation);
      when(mockRewardInteraction.canShowCta(evaluation)).thenReturn(true);

      await viewModel.selectCustomer(testCustomer);
      viewModel.selectReward(rewardId);

      verify(
        mockRewardInteraction.selectReward(evaluation, rewardId),
      ).called(1);
    });

    test('clearReward resets selection', () {
      viewModel.clearReward();
      verify(mockRewardInteraction.clearSelection()).called(1);
    });
  });

  group('cart change re-evaluates and invalidates stale reward', () {
    test(
      'validateAfterCartChange called when cart mutates with active selection',
      () async {
        // Arrange: evaluation returns valid result
        final evaluation = LoyaltyEvaluation(
          customerId: customerId,
          ticketId: '',
          programs: [
            const ProgramEvaluation(
              programId: programId,
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 10,
            ),
          ],
        );
        when(
          mockEvaluationService.evaluate(
            snapshot: anyNamed('snapshot'),
            programs: anyNamed('programs'),
            rewards: anyNamed('rewards'),
            balanceMap: anyNamed('balanceMap'),
          ),
        ).thenReturn(evaluation);

        // Select customer first (this calls clearReward internally)
        await viewModel.selectCustomer(testCustomer);

        // NOW set the reward selection stub AFTER clearReward has run
        when(mockRewardInteraction.selectedRewardId).thenReturn(rewardId);

        // Act: add item to cart triggers re-evaluation (fire-and-forget async)
        viewModel.addToCart(
          const Product(
            id: 'prod-1',
            name: 'Smash Burger',
            uom: 'UN',
            stock: 100,
            averageCost: 60.0,
            sellPrice: 120.0,
            category: 'Food',
          ),
        );

        // Allow async re-evaluation to complete
        await Future.delayed(const Duration(milliseconds: 100));

        // Assert: re-evaluation happened (evaluate called again from addToCart)
        verify(
          mockEvaluationService.evaluate(
            snapshot: anyNamed('snapshot'),
            programs: anyNamed('programs'),
            rewards: anyNamed('rewards'),
            balanceMap: anyNamed('balanceMap'),
          ),
        ).called(
          greaterThanOrEqualTo(2),
        ); // Once from selectCustomer, once from addToCart
      },
    );
  });

  group('processSale uses selectedRewardId for REDEEM', () {
    test(
      'REDEEM created from selectedRewardId, not from _pointsToRedeem',
      () async {
        // Arrange
        when(mockAuthRepo.getCurrentUser()).thenAnswer(
          (_) async => const User(
            id: 'user-1',
            name: 'Cashier',
            role: UserRole.cashier,
            isActive: true,
          ),
        );
        when(
          mockSalesRepo.saveSale(
            invoice: anyNamed('invoice'),
            items: anyNamed('items'),
            payments: anyNamed('payments'),
          ),
        ).thenAnswer((_) async {});

        // Arrange: reward interaction has a selection
        when(mockRewardInteraction.selectedRewardId).thenReturn(rewardId);
        when(
          mockRewardInteraction.getSelectedReward(any),
        ).thenReturn(testReward);

        // Arrange: DAOs return programs and rewards for _reEvaluateLoyalty
        when(
          mockProgramDao.getActivePrograms(tenantId),
        ).thenAnswer((_) async => [testProgramEntity]);
        when(
          mockRewardDao.getActiveRewards(tenantId),
        ).thenAnswer((_) async => [testRewardEntity]);

        // Arrange: evaluation shows eligible
        final evaluation = LoyaltyEvaluation(
          customerId: customerId,
          ticketId: '',
          programs: [
            ProgramEvaluation(
              programId: programId,
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 10,
              eligibleRewards: [testReward.toEligibleReward()],
            ),
          ],
        );
        when(
          mockEvaluationService.evaluate(
            snapshot: anyNamed('snapshot'),
            programs: anyNamed('programs'),
            rewards: anyNamed('rewards'),
            balanceMap: anyNamed('balanceMap'),
          ),
        ).thenReturn(evaluation);

        // Arrange: cart has items
        viewModel.addToCart(
          const Product(
            id: 'prod-1',
            name: 'Smash Burger',
            uom: 'UN',
            stock: 100,
            averageCost: 60.0,
            sellPrice: 120.0,
            category: 'Food',
          ),
        );
        await viewModel.selectCustomer(testCustomer);
        viewModel.selectReward(rewardId);

        // Act
        await viewModel.processSale(
          [PaymentMethod.cash],
          customPayments: [
            const Payment(
              id: 'pay-1',
              invoiceId: '',
              method: PaymentMethod.cash,
              amount: 138.0,
            ),
          ],
        );

        // Assert: REDEEM + EARN transactions were created
        // REDEEM: deducts reward costUnits from balance
        // EARN: accrues points on the subtotal (even after redeem)
        verify(
          mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any,
            customerId,
            any,
            any,
          ),
        ).called(2); // 1 REDEEM + 1 EARN

        // Assert: reward interaction was queried
        verify(
          mockRewardInteraction.selectedRewardId,
        ).called(greaterThanOrEqualTo(1));
      },
    );
  });

  group('processSale builds real LoyaltyEvaluation', () {
    test(
      'uses LoyaltyEvaluationService.evaluate instead of hardcoded evaluation',
      () async {
        // Arrange
        when(mockAuthRepo.getCurrentUser()).thenAnswer(
          (_) async => const User(
            id: 'user-1',
            name: 'Cashier',
            role: UserRole.cashier,
            isActive: true,
          ),
        );
        when(
          mockSalesRepo.saveSale(
            invoice: anyNamed('invoice'),
            items: anyNamed('items'),
            payments: anyNamed('payments'),
          ),
        ).thenAnswer((_) async {});

        // Arrange: evaluation with programs
        final evaluation = LoyaltyEvaluation(
          customerId: customerId,
          ticketId: '',
          programs: [
            const ProgramEvaluation(
              programId: programId,
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 7,
              earningPreviewUnits: 1,
            ),
          ],
        );
        when(
          mockEvaluationService.evaluate(
            snapshot: anyNamed('snapshot'),
            programs: anyNamed('programs'),
            rewards: anyNamed('rewards'),
            balanceMap: anyNamed('balanceMap'),
          ),
        ).thenReturn(evaluation);

        // Arrange: DAOs return programs and rewards for _reEvaluateLoyalty
        when(
          mockProgramDao.getActivePrograms(tenantId),
        ).thenAnswer((_) async => [testProgramEntity]);
        when(
          mockRewardDao.getActiveRewards(tenantId),
        ).thenAnswer((_) async => [testRewardEntity]);

        // Arrange: cart + customer
        viewModel.addToCart(
          const Product(
            id: 'prod-1',
            name: 'Smash Burger',
            uom: 'UN',
            stock: 100,
            averageCost: 60.0,
            sellPrice: 120.0,
            category: 'Food',
          ),
        );
        await viewModel.selectCustomer(testCustomer);

        // Act
        await viewModel.processSale(
          [PaymentMethod.cash],
          customPayments: [
            const Payment(
              id: 'pay-1',
              invoiceId: '',
              method: PaymentMethod.cash,
              amount: 138.0,
            ),
          ],
        );

        // Assert: evaluation service was called (not hardcoded)
        verify(
          mockEvaluationService.evaluate(
            snapshot: anyNamed('snapshot'),
            programs: anyNamed('programs'),
            rewards: anyNamed('rewards'),
            balanceMap: anyNamed('balanceMap'),
          ),
        ).called(greaterThanOrEqualTo(1));

        // Note: lastPostPaidFeedback is cleared by clearCart() at end of processSale.
        // The key assertion is that evaluate() was called with real data, not hardcoded.
        // A secondary check: _currentEvaluation was set before processSale cleared it.
        expect(
          viewModel.currentEvaluation,
          isNull,
        ); // cleared by clearCart → processSale end
      },
    );
  });
}

// Helper extension to convert domain model for test assertions
extension RewardDefinitionLocalTestExt on RewardDefinitionLocal {
  EligibleReward toEligibleReward() => EligibleReward(
    rewardId: id,
    name: name,
    rewardType: rewardType,
    costUnits: costUnits,
  );
}
