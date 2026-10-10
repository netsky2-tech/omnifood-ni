import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/sale_view_model_wiring.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
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
import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_dao.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/daos/kitchen/kitchen_order_dao.dart';
import 'package:pos_app/data/daos/sales/tax_config_dao.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_program_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_reward_entity.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
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
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'sale_view_model_loyalty_wiring_test.mocks.dart';
import 'dart:async';

// --- Fakes for non-loyalty DAOs (same as existing test) ---

class FakeLocalConfigDao extends Mock implements LocalConfigDao {
  // #67/T2a: the sale path fails closed without BOTH recorded FX rates, so
  // the fixture seeds them. Every other key still resolves to null, exactly
  // as before (the terminal-binding lookup included).
  //
  // P3 defect #2: the DAO also serves the terminal's LOCAL TENANT BINDING
  // ('tenant_id' key) — the same source the sync service uses when it writes
  // loyalty rows. [tenantId] defaults to a REAL binding; pass null to simulate
  // a terminal that was never bound (the fail-closed case).
  FakeLocalConfigDao({String? tenantId = 'tenant-1'})
      : _configs = {
          'commercial_exchange_rate': '36.50',
          'bcn_official_exchange_rate': '36.6241',
          'tenant_id': ?tenantId,
        };

  final Map<String, String> _configs;

  @override
  Future<String?> getConfigValue(String? key) async => _configs[key];

  /// Required by the DAO contract. Before checkout resolved a blank per-user
  /// tenant from the terminal binding, this call did not exist on the sale
  /// path; the fake returned Mockito's `null` and `await` blew up. Returning
  /// a real `Future<null>` keeps the pre-existing behaviour: no binding means
  /// the legacy inventory path, exactly as before that change.
  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final value = _configs[key];
    if (value == null) return null;
    return LocalConfigEntity(key: key, value: value);
  }
}

class FakeKitchenOrderDao extends Mock implements KitchenOrderDao {}

class FakeTaxConfigDao extends Mock implements TaxConfigDao {
  @override
  Future<List<TaxConfigEntity>> getAllTaxConfigs() async => [];
}

// P3 defect #2 fixture: the terminal now carries a 'tenant_id' binding, so
// CheckoutInventoryPreparationService.prepare() no longer falls back to the
// legacy (unbound) inventory path — it takes the SALE_TIME_V1 path, which
// reads the product DAO and the authority projection. An empty projection is
// a valid authority (nothing cross-references), so these fakes return just
// that; the sale-time snapshot freezes the same lines it always did.
class FakeProductDao extends Mock implements ProductDao {
  @override
  Future<ProductEntity?> findProductById(String id) async => null;
}

class FakeAuthorityProjectionDao extends Mock
    implements AuthorityProjectionDao {
  @override
  Future<List<AuthorityRecipeVersionEntity>> findActivePublishedVersions(
    String tenantId,
    String productId,
    String saleTime,
  ) async => [];
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

  // Fixtures
  //
  // P3 defect #2: the REAL local tenant id, as bound on the terminal via the
  // 'tenant_id' local config key — the same source the sync service uses when
  // it WRITES the loyalty rows. It is deliberately DIFFERENT from the customer
  // id: before the fix the view model queried the loyalty DAOs with
  // _selectedCustomer.id, which never matches the stored tenant_id column
  // (LoyaltyProgramEntity.tenantId is indexed) and always yielded an empty
  // catalog — so LoyaltyCompactWidget and RewardCtaWidget rendered nothing.
  const tenantId = 'tenant-1';
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

    // SALE_TIME_V1 checkout path on a bound terminal: empty catalog projection.
    when(mockDb.productDao).thenReturn(FakeProductDao());
    when(mockDb.authorityProjectionDao).thenReturn(FakeAuthorityProjectionDao());

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

  group('loyalty failure handling (B1/B2/H9)', () {
    const testProduct = Product(
      id: 'prod-1',
      name: 'Smash Burger',
      uom: 'UN',
      stock: 100,
      averageCost: 60.0,
      sellPrice: 120.0,
      category: 'Food',
    );

    setUp(() {
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
    });

    /// Arranges a full reward-based sale (reward selected, evaluation
    /// eligible) WITHOUT stubbing the point-transaction DAO, so each test
    /// controls its own persistence outcome.
    Future<void> arrangeRewardSale() async {
      when(mockRewardInteraction.selectedRewardId).thenReturn(rewardId);
      when(mockRewardInteraction.getSelectedReward(any)).thenReturn(testReward);
      when(
        mockProgramDao.getActivePrograms(tenantId),
      ).thenAnswer((_) async => [testProgramEntity]);
      when(
        mockRewardDao.getActiveRewards(tenantId),
      ).thenAnswer((_) async => [testRewardEntity]);

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

      viewModel.addToCart(testProduct);
      await viewModel.selectCustomer(testCustomer);
      viewModel.selectReward(rewardId);
    }

    test('H9: re-evaluation failure is observable and does not block cart flow',
        () async {
      when(
        mockProgramDao.getActivePrograms(tenantId),
      ).thenThrow(Exception('db locked'));

      // Act: must not throw despite the DAO failure.
      await viewModel.selectCustomer(testCustomer);

      // Assert: failure is observable, not silently swallowed.
      expect(viewModel.lastLoyaltyError, isNotNull);
      expect(viewModel.lastLoyaltyError, contains('re-evaluate'));
      expect(viewModel.currentEvaluation, isNull);

      // Assert: cart flow keeps working after the failure.
      viewModel.addToCart(testProduct);
      expect(viewModel.cart, isNotEmpty);
    });

    test('B1: redeem persistence failure is observable and sale still completes',
        () async {
      await arrangeRewardSale();

      var txCalls = 0;
      when(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).thenAnswer((_) async {
        txCalls++;
        if (txCalls == 1) {
          throw Exception('redeem write failed');
        }
      });

      // Act: must not throw — local sale completion is never blocked.
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

      // Assert: failure is observable (first tx call = REDEEM).
      expect(viewModel.lastLoyaltyError, isNotNull);
      expect(viewModel.lastLoyaltyError, contains('redeem'));

      // Assert: sale completed locally anyway (invoice persisted, earn
      // transaction still attempted).
      verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        ),
      ).called(1);
      verify(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).called(2);
    });

    test('B2: earn persistence failure is observable and sale still completes',
        () async {
      await arrangeRewardSale();

      var txCalls = 0;
      when(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).thenAnswer((_) async {
        txCalls++;
        if (txCalls == 2) {
          throw Exception('earn write failed');
        }
      });

      // Act: must not throw — local sale completion is never blocked.
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

      // Assert: failure is observable (second tx call = EARN, not REDEEM).
      expect(viewModel.lastLoyaltyError, isNotNull);
      expect(viewModel.lastLoyaltyError, contains('earn'));
      expect(viewModel.lastLoyaltyError, isNot(contains('redeem')));

      // Assert: sale completed locally anyway.
      verify(
        mockSalesRepo.saveSale(
          invoice: anyNamed('invoice'),
          items: anyNamed('items'),
          payments: anyNamed('payments'),
        ),
      ).called(1);
    });

    test('success path: no loyalty error is recorded', () async {
      await arrangeRewardSale();

      when(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).thenAnswer((_) async {});

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

      expect(viewModel.lastLoyaltyError, isNull);
      verify(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).called(2);
    });

    test(
        'a loyalty failure on sale N does NOT carry into sale N+1 '
        '(per-sale reset)', () async {
      await arrangeRewardSale();

      var txCalls = 0;
      when(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).thenAnswer((_) async {
        txCalls++;
        // Sale N: the REDEEM write (first tx call) fails; every later
        // tx call succeeds.
        if (txCalls == 1) {
          throw Exception('redeem write failed');
        }
      });

      // Sale N: redeem persistence failure is observable.
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
      expect(viewModel.lastLoyaltyError, isNotNull);
      expect(viewModel.lastLoyaltyError, contains('redeem'));

      // Sale N+1: same view-model instance, healthy persistence, no loyalty
      // failure — the historical failure must NOT leak into this sale's
      // diagnostics (the post-sale warning must reflect only THIS sale).
      await arrangeRewardSale();
      await viewModel.processSale(
        [PaymentMethod.cash],
        customPayments: [
          const Payment(
            id: 'pay-2',
            invoiceId: '',
            method: PaymentMethod.cash,
            amount: 138.0,
          ),
        ],
      );

      expect(viewModel.lastLoyaltyError, isNull);
      // Both sales ran their full redeem+earn path (2 tx calls each):
      // no loyalty route was degraded by the reset.
      verify(
        mockPointTxDao.recordPointTransactionAndUpdateBalance(
            any, any, any, any),
      ).called(4);
    });
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

  // Production wiring: these tests exercise buildSaleViewModel — the EXACT
  // function main.dart executes — never a hand-built replica. A hand replica
  // is exactly the trap that let the P3 loyalty defect ship: the test VM was
  // wired correctly while the till was inoperable.
  group('production wiring (buildSaleViewModel — the code path main.dart runs)', () {
    // Customer with points well above the reward cost, mirroring the real
    // S23 observation (1,500 points selected, nothing rendered in the cart).
    const richCustomer = Customer(
      id: customerId,
      name: 'Carlos Rico',
      pointsBalance: 15.0,
      isActive: true,
      customerCode: 'DEF456ABC123',
    );

    void arrangeLoyaltyCatalog() {
      // _reEvaluateLoyalty must scope DAO lookups by the LOCAL TENANT BINDING
      // ('tenant_id' config key), NOT by the selected customer id — the
      // loyalty rows are written under the tenant, never under the customer.
      when(
        mockProgramDao.getActivePrograms(tenantId),
      ).thenAnswer((_) async => [testProgramEntity]);
      when(
        mockRewardDao.getActiveRewards(tenantId),
      ).thenAnswer((_) async => [testRewardEntity]);
    }

    test(
        'loyalty surface is LIVE: evaluation non-null, program carried, '
        'reward CTA eligible, selectReward not a no-op', () async {
      arrangeLoyaltyCatalog();

      final vm = buildSaleViewModel(
        salesRepository: mockSalesRepo,
        inventoryRepository: mockInventoryRepo,
        authRepository: mockAuthRepo,
        database: mockDb,
        deviceId: 'test-terminal',
      );

      await vm.selectCustomer(richCustomer);

      // The evaluation surface LoyaltyCompactWidget/RewardCtaWidget read.
      expect(vm.currentEvaluation, isNotNull);
      expect(
        vm.currentEvaluation!.programs.map((p) => p.programId),
        contains(programId),
      );

      // RewardCtaWidget renders iff hasAnyEligibleReward && nextReward != null.
      expect(vm.currentEvaluation!.hasAnyEligibleReward, isTrue);
      expect(vm.currentEvaluation!.nextReward, isNotNull);
      expect(vm.currentEvaluation!.nextReward!.rewardId, rewardId);

      // selectReward must no longer be a silent no-op (pre-fix it returned
      // early because _rewardInteraction was null).
      vm.selectReward(rewardId);
      expect(vm.selectedReward, isNotNull);
      expect(vm.selectedReward!.id, rewardId);
    });

    test(
        'CONTRAST (the trap): the PLAIN positional constructor still yields a '
        'NULL evaluation — the pre-fix production state, kept as an explicit '
        'regression marker', () async {
      arrangeLoyaltyCatalog();

      // The pre-fix main.dart construction, verbatim: plain positional
      // constructor, whose initializer list hard-codes _evaluationService =
      // null and _rewardInteraction = null.
      final vm = SaleViewModel(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        mockDb,
        TableOrderService(mockDb),
        true, // autoLoad
        null, // tenantConfigService
        null, // kitchenOrderService
        null, // printerConfigService
        null, // printerPort
        null, // syncService
        null, // promotionsEngine
        null, // loyaltyService
        'test-terminal',
      );

      await vm.selectCustomer(richCustomer);

      // Customer selected, program and reward exist — yet the surface is dead.
      expect(vm.currentEvaluation, isNull);
      // And selectReward is a silent no-op.
      vm.selectReward(rewardId);
      expect(vm.selectedReward, isNull);
    });
  });

  // P3 defect #3 fixture: a DISCOUNT_AMOUNT reward whose benefit is the
  // owner-configured amount in `benefitConfigJson` (`{"amountNio": 80}`).
  const discountRewardId = 'rw-descuento-80';

  RewardDefinitionLocal discountRewardLocal({String benefitJson = '{"amountNio":80}'}) =>
      RewardDefinitionLocal(
        id: discountRewardId,
        tenantId: tenantId,
        loyaltyProgramId: programId,
        name: 'C\$80 de descuento',
        rewardType: RewardType.discountAmount,
        costUnits: 5,
        benefitConfigJson: benefitJson,
        status: RewardStatus.active,
        configVersion: 1,
        presentationOrder: 2,
      );

  LoyaltyRewardEntity discountRewardEntity({String benefitJson = '{"amountNio":80}'}) =>
      LoyaltyRewardEntity(
        id: discountRewardId,
        tenantId: tenantId,
        loyaltyProgramId: programId,
        name: 'C\$80 de descuento',
        rewardType: 'discountAmount',
        costUnits: 5,
        benefitConfigJson: benefitJson,
        status: 'ACTIVE',
        presentationOrder: 2,
        configVersion: 1,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      );

  // P3 defect #3: the reward CTA renders and the confirmation dialog opens,
  // but pressing Apply changed NOTHING in the cart: selectReward only stored
  // the selection for the points ledger, and the cart's loyaltyDiscount was
  // computed ONLY from the free-points path (applyLoyaltyPoints has no
  // production caller). These tests pin the missing money path: the selected
  // reward's benefit MUST become the cart's loyalty discount, flow into
  // totalDiscounts and the invoice total, be refused (never clamped) when it
  // exceeds the residual the customer actually pays, disappear exactly on
  // deselect, and leave reward-less carts byte-for-byte unchanged.
  group('reward produces the cart loyalty discount (P3 defect #3)', () {
    const testProduct = Product(
      id: 'prod-1',
      name: 'Smash Burger',
      uom: 'UN',
      stock: 100,
      averageCost: 60.0,
      sellPrice: 120.0,
      category: 'Food',
    );

    /// Arranges a cart with ONE C\$120 item, a real tenant-scoped catalog
    /// containing the DISCOUNT_AMOUNT reward, and an eligible evaluation —
    /// WITHOUT a selection stub, so the state mirrors production: no reward
    /// is selected until the operator taps Apply.
    Future<void> arrangeCartWithDiscountReward({
      String benefitJson = '{"amountNio":80}',
    }) async {
      when(
        mockProgramDao.getActivePrograms(tenantId),
      ).thenAnswer((_) async => [testProgramEntity]);
      when(
        mockRewardDao.getActiveRewards(tenantId),
      ).thenAnswer((_) async => [discountRewardEntity(benefitJson: benefitJson)]);

      final evaluation = LoyaltyEvaluation(
        customerId: customerId,
        ticketId: '',
        programs: [
          ProgramEvaluation(
            programId: programId,
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 10,
            eligibleRewards: [
              discountRewardLocal(benefitJson: benefitJson).toEligibleReward(),
            ],
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

      viewModel.addToCart(testProduct);
      await viewModel.selectCustomer(testCustomer);
    }

    test(
      'CORE: selecting a DISCOUNT_AMOUNT reward turns its benefit into the '
      'cart loyaltyDiscount, totalDiscounts and the invoice total',
      () async {
        await arrangeCartWithDiscountReward();

        final totalBefore = viewModel.total;
        final discountsBefore = viewModel.totalDiscounts;
        expect(discountsBefore, 0.0);

        when(mockRewardInteraction.selectedRewardId).thenReturn(discountRewardId);
        viewModel.selectReward(discountRewardId);

        expect(viewModel.selectedReward, isNotNull);
        expect(viewModel.selectedReward!.id, discountRewardId);
        expect(viewModel.loyaltyDiscount, 80.0);
        expect(viewModel.totalDiscounts, 80.0);
        expect(viewModel.total, totalBefore - 80.0);
      },
    );

    test(
      'ORIGIN: the checkout per-line breakdown attributes the reward money '
      'to the loyalty origin (the three-origin case)',
      () async {
        await arrangeCartWithDiscountReward();

        when(mockRewardInteraction.selectedRewardId).thenReturn(discountRewardId);
        viewModel.selectReward(discountRewardId);
        expect(viewModel.loyaltyDiscount, 80.0);

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
        when(
          mockPointTxDao.recordPointTransactionAndUpdateBalance(
              any, any, any, any),
        ).thenAnswer((_) async {});

        final totalAtCheckout = viewModel.total;
        await viewModel.processSale(
          [PaymentMethod.cash],
          customPayments: [
            Payment(
              id: 'pay-1',
              invoiceId: '',
              method: PaymentMethod.cash,
              amount: totalAtCheckout,
            ),
          ],
        );

        final result = verify(
          mockSalesRepo.saveSale(
            invoice: captureAnyNamed('invoice'),
            items: captureAnyNamed('items'),
            payments: anyNamed('payments'),
          ),
        );
        result.called(1);
        final savedInvoice = result.captured[0] as Invoice;
        final savedItems = result.captured[1] as List<InvoiceItem>;

        // The invoice total carries the reward discount…
        expect(savedInvoice.total, closeTo(totalAtCheckout, 0.001));
        // …and the single line's breakdown attributes ALL of it to the
        // loyalty origin (no promotion, no manual discount in this cart).
        expect(savedItems, isNotEmpty);
        final origin = savedItems.first.discountOrigin;
        expect(origin, isNotNull);
        expect(origin!['loyalty'], closeTo(80.0, 0.001));
      },
    );

    test(
      'CEILING (REFUSED): a reward whose amount exceeds the residual the '
      'customer pays is refused with the existing Spanish message — never '
      'clamped, never silently applied',
      () async {
        await arrangeCartWithDiscountReward(benefitJson: '{"amountNio":500}');

        final totalBefore = viewModel.total;
        when(mockRewardInteraction.selectedRewardId).thenReturn(discountRewardId);

        viewModel.selectReward(discountRewardId);

        // Operator-visible outcome: the SAME refusal contract the free-points
        // path enforces through validateRedemption.
        expect(viewModel.errorMessage, isNotNull);
        expect(
          viewModel.errorMessage,
          contains('no puede exceder el total de la orden'),
        );
        expect(viewModel.errorMessage, contains('500.00'));
        expect(viewModel.errorMessage, contains('120.00'));
        // No money moved.
        expect(viewModel.loyaltyDiscount, 0.0);
        expect(viewModel.totalDiscounts, 0.0);
        expect(viewModel.total, totalBefore);
        // The selection was never committed (ledger stays untouched too).
        expect(viewModel.selectedReward, isNull);
        verifyNever(mockRewardInteraction.selectReward(any, any));
      },
    );

    test(
      'CEILING (corrupt benefit): a DISCOUNT_AMOUNT reward whose '
      'benefitConfigJson has no readable amountNio is refused — never '
      'applied as a fabricated 0 or an invented amount',
      () async {
        await arrangeCartWithDiscountReward(benefitJson: '{}');

        when(mockRewardInteraction.selectedRewardId).thenReturn(discountRewardId);
        viewModel.selectReward(discountRewardId);

        expect(viewModel.errorMessage, isNotNull);
        expect(viewModel.loyaltyDiscount, 0.0);
        expect(viewModel.totalDiscounts, 0.0);
        expect(viewModel.selectedReward, isNull);
      },
    );

    test(
      'DESELECT: clearReward removes the reward discount and restores the '
      'exact pre-selection totals',
      () async {
        await arrangeCartWithDiscountReward();

        final totalBefore = viewModel.total;
        final discountsBefore = viewModel.totalDiscounts;

        when(mockRewardInteraction.selectedRewardId).thenReturn(discountRewardId);
        viewModel.selectReward(discountRewardId);
        expect(viewModel.loyaltyDiscount, 80.0);

        viewModel.clearReward();

        expect(viewModel.loyaltyDiscount, 0.0);
        expect(viewModel.totalDiscounts, discountsBefore);
        expect(viewModel.total, totalBefore);
        expect(viewModel.selectedReward, isNull);
      },
    );

    test(
      'FREE_PRODUCT: the selection is still recorded for the points ledger '
      '(unchanged REDEEM path) but the cart applies NO discount and the '
      'operator SEES that it cannot be applied — no silent no-op',
      () async {
        when(
          mockProgramDao.getActivePrograms(tenantId),
        ).thenAnswer((_) async => [testProgramEntity]);
        when(
          mockRewardDao.getActiveRewards(tenantId),
        ).thenAnswer((_) async => [testRewardEntity]);
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

        viewModel.addToCart(testProduct);
        await viewModel.selectCustomer(testCustomer);

        final totalBefore = viewModel.total;
        when(mockRewardInteraction.selectedRewardId).thenReturn(rewardId);
        viewModel.selectReward(rewardId);

        // Ledger path unchanged: the reward is selected (REDEEM costUnits).
        expect(viewModel.selectedReward, isNotNull);
        expect(viewModel.selectedReward!.id, rewardId);
        // But no line-level application was invented…
        expect(viewModel.loyaltyDiscount, 0.0);
        expect(viewModel.totalDiscounts, 0.0);
        expect(viewModel.total, totalBefore);
        // …and the operator can see the failure.
        expect(viewModel.errorMessage, isNotNull);
      },
    );
  });

  // P3 defect #2: the view model resolved the local tenant id from the
  // CUSTOMER (`final tenantId = _selectedCustomer!.id`), then queried the
  // loyalty DAOs with it — but the local loyalty tables store a REAL indexed
  // tenant_id column, written by the sync service under the terminal's
  // 'tenant_id' local config binding. Querying by customer id always yielded
  // an empty catalog, so no loyalty surface ever rendered. These tests pin
  // the correct source (the config binding) and keep the scoping HONOURED.
  group('loyalty tenant scoping (P3 defect #2: tenant from config, not customer)',
      () {
    LoyaltyEvaluation eligibleEvaluation() => LoyaltyEvaluation(
          customerId: customerId,
          ticketId: '',
          programs: [
            ProgramEvaluation(
              programId: programId,
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 6,
              eligibleRewards: [testReward.toEligibleReward()],
            ),
          ],
        );

    void arrangeRealTenantCatalog() {
      when(
        mockProgramDao.getActivePrograms(tenantId),
      ).thenAnswer((_) async => [testProgramEntity]);
      when(
        mockRewardDao.getActiveRewards(tenantId),
      ).thenAnswer((_) async => [testRewardEntity]);
      when(
        mockEvaluationService.evaluate(
          snapshot: anyNamed('snapshot'),
          programs: anyNamed('programs'),
          rewards: anyNamed('rewards'),
          balanceMap: anyNamed('balanceMap'),
        ),
      ).thenReturn(eligibleEvaluation());
    }

    test(
        'CORE: with a program+reward stored under the REAL tenant id and a '
        'customer selected, the evaluation is non-null and the reward is '
        'eligible', () async {
      arrangeRealTenantCatalog();

      await viewModel.selectCustomer(testCustomer);

      // The loyalty DAOs were queried with the resolved tenant binding…
      verify(mockProgramDao.getActivePrograms(tenantId)).called(1);
      verify(mockRewardDao.getActiveRewards(tenantId)).called(1);
      // …and the surface LoyaltyCompactWidget/RewardCtaWidget read is live.
      expect(viewModel.currentEvaluation, isNotNull);
      expect(viewModel.currentEvaluation!.hasAnyEligibleReward, isTrue);
      expect(viewModel.currentEvaluation!.nextReward, isNotNull);
      expect(viewModel.currentEvaluation!.nextReward!.rewardId, rewardId);
    });

    test(
        'SCOPING HONOURED: a program stored under a DIFFERENT tenant id never '
        'reaches the evaluation (a "fix" that stops filtering by tenant '
        'fails here)', () async {
      const otherTenantId = 'tenant-other';
      // The foreign-tenant catalog EXISTS in the local DB…
      when(mockProgramDao.getActivePrograms(otherTenantId))
          .thenAnswer((_) async => [testProgramEntity]);
      when(mockRewardDao.getActiveRewards(otherTenantId))
          .thenAnswer((_) async => [testRewardEntity]);
      // …but this terminal's tenant has NO stored catalog.
      when(mockProgramDao.getActivePrograms(tenantId))
          .thenAnswer((_) async => []);
      when(mockRewardDao.getActiveRewards(tenantId))
          .thenAnswer((_) async => []);

      await viewModel.selectCustomer(testCustomer);

      // The foreign rows were never fetched: the query is scoped, not removed.
      verifyNever(mockProgramDao.getActivePrograms(otherTenantId));
      verifyNever(mockRewardDao.getActiveRewards(otherTenantId));
      expect(viewModel.currentEvaluation, isNotNull);
      expect(viewModel.currentEvaluation!.programs, isEmpty);
      expect(viewModel.currentEvaluation!.hasAnyEligibleReward, isFalse);
    });

    test(
        'SNAPSHOT: the ticket snapshot carries the resolved tenant id, not '
        'the customer id (the second call site, _buildTicketSnapshot)',
        () async {
      arrangeRealTenantCatalog();

      await viewModel.selectCustomer(testCustomer);

      final result = verify(mockEvaluationService.evaluate(
        snapshot: captureAnyNamed('snapshot'),
        programs: anyNamed('programs'),
        rewards: anyNamed('rewards'),
        balanceMap: anyNamed('balanceMap'),
      ));
      result.called(1);
      final snapshot = result.captured.last as LoyaltyTicketSnapshot;
      // tenant-1 ≠ cust-1: distinct fixture values prove the snapshot's
      // tenantId comes from the tenant binding and customerId from the
      // customer — they are no longer conflated.
      expect(snapshot.tenantId, tenantId);
      expect(snapshot.customerId, customerId);
      expect(snapshot.tenantId, isNot(customerId));
    });

    test(
        'FAIL CLOSED: with no tenant binding on the terminal, the evaluation '
        'stays empty — no tenant is fabricated', () async {
      // A terminal that was never activated has no 'tenant_id' binding.
      final localDaoNoBinding = FakeLocalConfigDao(tenantId: null);
      final dbNoBinding = MockAppDatabase();
      when(dbNoBinding.customerDao).thenReturn(mockCustomerDao);
      when(dbNoBinding.customerPointTransactionDao).thenReturn(mockPointTxDao);
      when(dbNoBinding.loyaltyProgramDao).thenReturn(mockProgramDao);
      when(dbNoBinding.loyaltyRewardDao).thenReturn(mockRewardDao);
      when(dbNoBinding.cashierSessionDao).thenReturn(mockSessionDao);
      when(dbNoBinding.holdTicketDao).thenReturn(mockHoldDao);
      when(dbNoBinding.promotionDao).thenReturn(mockPromoDao);
      when(dbNoBinding.localConfigDao).thenReturn(localDaoNoBinding);
      when(dbNoBinding.kitchenOrderDao).thenReturn(FakeKitchenOrderDao());
      when(dbNoBinding.taxConfigDao).thenReturn(FakeTaxConfigDao());

      final vmNoBinding = SaleViewModel.withLoyalty(
        mockSalesRepo,
        mockInventoryRepo,
        mockAuthRepo,
        dbNoBinding,
        autoLoad: false,
        tenantConfigService: FakeTenantConfigService(localDaoNoBinding),
        kitchenOrderService: fakeKitchenOrderService,
        identificationService: mockIdentificationService,
        rewardInteractionService: mockRewardInteraction,
        evaluationService: mockEvaluationService,
      );

      // The DAO holds nothing under an empty tenant id — even if it were
      // (incorrectly) queried with one, no catalog could appear.
      when(mockProgramDao.getActivePrograms('')).thenAnswer((_) async => []);
      when(mockRewardDao.getActiveRewards('')).thenAnswer((_) async => []);

      await vmNoBinding.selectCustomer(testCustomer);

      // Fail closed: the lookup ran without fabricating a tenant, the
      // evaluation has no programs, and — because this is a legitimate
      // unbound-terminal state, not a fault — no loyalty error is recorded.
      verify(mockProgramDao.getActivePrograms('')).called(1);
      expect(vmNoBinding.lastLoyaltyError, isNull);
      expect(vmNoBinding.currentEvaluation, isNotNull);
      expect(vmNoBinding.currentEvaluation!.programs, isEmpty);
      expect(vmNoBinding.currentEvaluation!.hasAnyEligibleReward, isFalse);
    });
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
