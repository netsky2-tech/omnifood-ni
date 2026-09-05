import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../../../domain/models/config/tax_regime.dart';
import '../../../../domain/models/config/tenant_config.dart';
import '../../../../domain/models/config/tenant_operation_mode.dart';
import '../../../../domain/models/sales/invoice.dart';
import '../../../../domain/models/sales/invoice_item.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../domain/models/sales/cashier_session.dart';
import '../../../../domain/models/sales/cart_item.dart';
import '../../../../domain/models/sales/hold_ticket.dart';
import '../../../../domain/models/sales/promotion.dart';
import '../../../../domain/models/customer/customer.dart';
import '../../../../domain/models/inventory/product.dart';
import '../../../../domain/models/user.dart';
import '../../../../domain/repositories/sales/sales_repository.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/repositories/auth_repository.dart';
import 'dart:convert';
import '../../../../data/database/app_database.dart';
import '../../../../data/mappers/sales_mapper.dart';
import '../../../../data/mappers/customer_mapper.dart';
import '../../../../data/models/customer/customer_entity.dart';
import '../../../../domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/sales/promotions_engine.dart';
import 'package:pos_app/domain/services/sales/loyalty_service.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_reward_interaction_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import '../../../../domain/services/config/printer_config_service.dart';
import '../../../../domain/services/printer/printer_resolver.dart';
import '../../../../domain/services/printer/thermal_logo_processor.dart';
import 'dart:async';
import '../../../../domain/ports/printer_port.dart';
import '../../../../domain/services/kitchen/kitchen_order_service.dart';
import '../../../../data/services/sync_service.dart';
import '../../../../domain/services/sales/tip_engine.dart';
import '../../../../domain/services/sales/split_bill_engine.dart';
import '../../../../domain/services/config/business_mode_evaluator.dart';

class SaleViewModel extends ChangeNotifier {
  final SalesRepository _salesRepository;
  final InventoryRepository _inventoryRepository;
  final AuthRepository _authRepository;
  final AppDatabase _database; // For session, hold, and promo DAOs
  final TableOrderService _tableOrderService;
  final TenantConfigService _tenantConfigService;
  final KitchenOrderService _kitchenOrderService;
  final PrinterConfigService _printerConfigService;
  final PrinterPort _printerPort;
  final PromotionsEngine _promotionsEngine;
  final LoyaltyService _loyaltyService;
  final PostPaidFeedbackService _postPaidFeedbackService;
  final CustomerIdentificationService? _identificationService;
  final LoyaltyRewardInteractionService? _rewardInteraction;
  final LoyaltyEvaluationService? _evaluationService;
  final String _terminalId;
  SyncService? _syncService;
  StreamSubscription<InboundSyncResult>? _syncSubscription;
  Timer? _syncDebounceTimer;

  SaleViewModel(
    this._salesRepository,
    this._inventoryRepository,
    this._authRepository,
    this._database, [
    TableOrderService? tableOrderService,
    bool autoLoad = true,
    TenantConfigService? tenantConfigService,
    KitchenOrderService? kitchenOrderService,
    PrinterConfigService? printerConfigService,
    PrinterPort? printerPort,
    SyncService? syncService,
    PromotionsEngine? promotionsEngine,
    LoyaltyService? loyaltyService,
    String terminalId = '',
  ])  : _tableOrderService = tableOrderService ?? TableOrderService(_database),
        _tenantConfigService =
            tenantConfigService ?? TenantConfigService(_database.localConfigDao),
        _kitchenOrderService =
            kitchenOrderService ?? KitchenOrderService(_database),
        _printerConfigService =
            printerConfigService ?? PrinterConfigService(_database.localConfigDao),
        _printerPort =
            printerPort ?? PrinterResolver.resolve(const PrinterConfig()),
        _promotionsEngine = promotionsEngine ?? const PromotionsEngine(),
        _loyaltyService = loyaltyService ?? const LoyaltyService(),
        _postPaidFeedbackService = const PostPaidFeedbackService(),
        _identificationService = null,
        _rewardInteraction = null,
        _evaluationService = null,
        _terminalId = terminalId {
      _syncService = syncService;
      if (syncService != null) {
        _syncSubscription = syncService.onInboundSync.listen((event) {
          if (event.productsCount > 0 || event.catalogValuesCount > 0) {
            loadProducts();
          }
        });
      }
      if (autoLoad) {
        loadProducts().then((_) {
          // If local DB is empty, trigger sync to pull products from backend
          if (_products.isEmpty && _syncService != null) {
            _syncService!.triggerManualSync();
          }
        });
        checkActiveSession();
        loadHoldTickets();
        loadPromotions();
        _loadCurrentUserRole();
        loadExchangeRates();
        loadTenantConfig();
      }
    }

  /// Extended constructor with loyalty wiring services.
  /// Use this when the caller needs full loyalty evaluation + reward interaction.
  SaleViewModel.withLoyalty(
    this._salesRepository,
    this._inventoryRepository,
    this._authRepository,
    this._database, {
    TableOrderService? tableOrderService,
    bool autoLoad = true,
    TenantConfigService? tenantConfigService,
    KitchenOrderService? kitchenOrderService,
    PrinterConfigService? printerConfigService,
    PrinterPort? printerPort,
    SyncService? syncService,
    PromotionsEngine? promotionsEngine,
    LoyaltyService? loyaltyService,
    String terminalId = '',
    CustomerIdentificationService? identificationService,
    LoyaltyRewardInteractionService? rewardInteractionService,
    LoyaltyEvaluationService? evaluationService,
  })  : _tableOrderService = tableOrderService ?? TableOrderService(_database),
        _tenantConfigService =
            tenantConfigService ?? TenantConfigService(_database.localConfigDao),
        _kitchenOrderService =
            kitchenOrderService ?? KitchenOrderService(_database),
        _printerConfigService =
            printerConfigService ?? PrinterConfigService(_database.localConfigDao),
        _printerPort =
            printerPort ?? PrinterResolver.resolve(const PrinterConfig()),
        _promotionsEngine = promotionsEngine ?? const PromotionsEngine(),
        _loyaltyService = loyaltyService ?? const LoyaltyService(),
        _postPaidFeedbackService = const PostPaidFeedbackService(),
        _identificationService = identificationService,
        _rewardInteraction = rewardInteractionService,
        _evaluationService = evaluationService,
        _terminalId = terminalId {
    _syncService = syncService;
    if (syncService != null) {
      _syncSubscription = syncService.onInboundSync.listen((event) {
        if (event.productsCount > 0 || event.catalogValuesCount > 0) {
          loadProducts();
        }
      });
    }
    if (autoLoad) {
      loadProducts().then((_) {
        if (_products.isEmpty && _syncService != null) {
          _syncService!.triggerManualSync();
        }
      });
      checkActiveSession();
      loadHoldTickets();
      loadPromotions();
      _loadCurrentUserRole();
      loadExchangeRates();
      loadTenantConfig();
    }
  }

  String? _lastPrintError;
  String? get lastPrintError => _lastPrintError;

  Invoice? _lastProcessedInvoice;
  Invoice? get lastProcessedInvoice => _lastProcessedInvoice;

  PostPaidFeedback? _lastPostPaidFeedback;
  PostPaidFeedback? get lastPostPaidFeedback => _lastPostPaidFeedback;

  // --- Loyalty wiring: evaluation + reward selection state ---
  LoyaltyEvaluation? _currentEvaluation;
  LoyaltyEvaluation? get currentEvaluation => _currentEvaluation;

  RewardDefinitionLocal? _selectedReward;
  RewardDefinitionLocal? get selectedReward => _selectedReward;

  /// Cached rewards from last evaluation for reward resolution
  List<RewardDefinitionLocal> _cachedRewards = [];

  /// Identifies a customer via CustomerIdentificationService (QR, code, phone, search).
  /// Falls back to null if no service injected or identification fails.
  Future<Customer?> identifyCustomer(String input) async {
    if (_identificationService == null) return null;
    final result = await _identificationService!.identify(input);
    if (result == null) return null;
    await selectCustomer(result.customer);
    return result.customer;
  }

  /// Selects a loyalty reward for the current ticket.
  /// Must be called before PAID. Only one reward per ticket.
  void selectReward(String rewardId) {
    if (_rewardInteraction == null || _currentEvaluation == null) return;
    _rewardInteraction!.selectReward(_currentEvaluation!, rewardId);
    _selectedReward = _resolveSelectedReward();
    notifyListeners();
  }

  /// Clears the current reward selection.
  void clearReward() {
    _rewardInteraction?.clearSelection();
    _selectedReward = null;
    notifyListeners();
  }

  /// Re-evaluates loyalty state from Floor DAOs when customer or cart changes.
  Future<void> _reEvaluateLoyalty() async {
    if (_evaluationService == null || _selectedCustomer == null) {
      _currentEvaluation = null;
      _selectedReward = null;
      return;
    }

    try {
      final tenantId = _selectedCustomer!.id; // tenant scoping comes from config
      final programs = await _database.loyaltyProgramDao.getActivePrograms(tenantId);
      final rewards = await _database.loyaltyRewardDao.getActiveRewards(tenantId);

      // Build balance map from program IDs
      final balanceMap = <String, int>{};
      for (final p in programs) {
        balanceMap[p.id] = _selectedCustomer!.pointsBalance.toInt();
      }

      // Build snapshot from current cart
      final snapshot = _buildTicketSnapshot();

      final domainPrograms = programs.map((e) => LoyaltyProgramLocal(
        id: e.id,
        tenantId: e.tenantId,
        name: e.name,
        programType: LoyaltyProgramType.values.firstWhere(
          (t) => t.name == e.programType,
          orElse: () => LoyaltyProgramType.spendPoints,
        ),
        status: LoyaltyProgramStatus.values.firstWhere(
          (s) => s.name.toLowerCase() == e.status.toLowerCase(),
          orElse: () => LoyaltyProgramStatus.active,
        ),
        startsAt: e.startsAt != null ? DateTime.fromMillisecondsSinceEpoch(e.startsAt!) : null,
        endsAt: e.endsAt != null ? DateTime.fromMillisecondsSinceEpoch(e.endsAt!) : null,
        earningRuleJson: e.earningRuleJson,
        eligibilityRuleJson: e.eligibilityRuleJson,
        configVersion: e.configVersion,
      )).toList();

      final domainRewards = rewards.map((e) => RewardDefinitionLocal(
        id: e.id,
        tenantId: e.tenantId,
        loyaltyProgramId: e.loyaltyProgramId,
        name: e.name,
        rewardType: RewardType.values.firstWhere(
          (t) => t.name == e.rewardType,
          orElse: () => RewardType.discountAmount,
        ),
        costUnits: e.costUnits,
        benefitConfigJson: e.benefitConfigJson,
        status: RewardStatus.values.firstWhere(
          (s) => s.name.toLowerCase() == e.status.toLowerCase(),
          orElse: () => RewardStatus.active,
        ),
        configVersion: e.configVersion,
        presentationOrder: e.presentationOrder,
        startsAt: e.startsAt != null ? DateTime.fromMillisecondsSinceEpoch(e.startsAt!) : null,
        endsAt: e.endsAt != null ? DateTime.fromMillisecondsSinceEpoch(e.endsAt!) : null,
      )).toList();

      _currentEvaluation = _evaluationService!.evaluate(
        snapshot: snapshot,
        programs: domainPrograms,
        rewards: domainRewards,
        balanceMap: balanceMap,
      );

      // Cache rewards for resolution
      _cachedRewards = domainRewards;

      // Validate current reward selection is still eligible
      if (_rewardInteraction != null && _rewardInteraction!.selectedRewardId != null) {
        _rewardInteraction!.validateAfterCartChange(_currentEvaluation!);
        _selectedReward = _resolveSelectedReward();
      }
    } catch (_) {
      // Non-blocking: evaluation is best-effort
    }
  }

  LoyaltyTicketSnapshot _buildTicketSnapshot() {
    final lines = _cart.map((item) => TicketLineSnapshot(
      lineId: item.productId,
      productId: item.productId,
      quantity: item.quantity.toInt(),
      netAmount: item.subtotal,
      source: TicketLineSource.normal,
    )).toList();

    return LoyaltyTicketSnapshot(
      tenantId: _selectedCustomer?.id ?? '',
      branchId: '',
      terminalId: '',
      ticketId: '',
      customerId: _selectedCustomer?.id,
      occurredAt: DateTime.now(),
      lines: lines,
    );
  }

  RewardDefinitionLocal? _resolveSelectedReward() {
    final rewardId = _rewardInteraction?.selectedRewardId;
    if (rewardId == null) return null;
    try {
      return _cachedRewards.firstWhere((r) => r.id == rewardId);
    } catch (_) {
      return null;
    }
  }

  TenantConfig? _tenantConfig;
  TenantConfig? get tenantConfig => _tenantConfig;
  TenantOperationMode get operationMode =>
      _tenantConfig?.operationMode ?? TenantOperationMode.foodparkQsr;

  bool get isFoodParkQsr => operationMode.isFoodParkQsr;
  bool get supportsTables => operationMode.supportsTables;
  bool get supportsBuzzerPager => operationMode.supportsBuzzerPager;

  String? _buzzerNumber;
  String? get buzzerNumber => _buzzerNumber;

  void setBuzzerNumber(String? number) {
    _buzzerNumber =
        (number != null && number.trim().isNotEmpty) ? number.trim() : null;
    notifyListeners();
  }

  String? _customerName;
  String? get customerName => _customerName;

  Customer? _selectedCustomer;
  Customer? get selectedCustomer => _selectedCustomer;

  /// Selects a customer and re-evaluates loyalty state.
  /// Returns a Future that completes when evaluation is done.
  Future<void> selectCustomer(Customer? customer) async {
    _selectedCustomer = customer;
    _customerName = customer?.name;
    _pointsToRedeem = 0.0;
    clearReward();
    await _reEvaluateLoyalty();
    notifyListeners();
  }

  void clearCustomer() {
    _selectedCustomer = null;
    _customerName = null;
    _pointsToRedeem = 0.0;
    _currentEvaluation = null;
    clearReward();
    notifyListeners();
  }

  double _pointsToRedeem = 0.0;
  double get pointsToRedeem => _pointsToRedeem;
  double get loyaltyDiscount => _loyaltyService.calculateDiscountFromPoints(_pointsToRedeem);
  double get promoDiscounts => _totalDiscounts;

  RedemptionValidationResult applyLoyaltyPoints(double points) {
    if (_selectedCustomer == null) {
      return RedemptionValidationResult.failure(
        'Debe seleccionar un cliente para redimir puntos.',
      );
    }
    final rawSubtotal = _cart.fold(
      0.0,
      (sum, item) => sum + item.subtotal + item.modifiersTotal,
    );
    final currentSubtotal = rawSubtotal - _totalDiscounts;
    final result = _loyaltyService.validateRedemption(
      customer: _selectedCustomer!,
      pointsToRedeem: points,
      orderTotal: currentSubtotal,
    );
    if (result.isValid) {
      _pointsToRedeem = points;
      notifyListeners();
    }
    return result;
  }

  void clearLoyaltyPoints() {
    _pointsToRedeem = 0.0;
    notifyListeners();
  }

  void setCustomerName(String? name) {
    _customerName =
        (name != null && name.trim().isNotEmpty) ? name.trim() : null;
    notifyListeners();
  }

  Future<List<Customer>> searchCustomers(String query) async {
    if (query.trim().isEmpty) {
      final entities = await _database.customerDao.getAllCustomers();
      return entities.map(CustomerMapper.toDomain).toList();
    }
    final entities = await _database.customerDao.searchCustomers(query.trim(), 20);
    return entities.map(CustomerMapper.toDomain).toList();
  }

  Future<Customer> createExpressCustomer({
    required String name,
    String? taxId,
    String? phone,
    String? email,
    String? address,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = const Uuid().v4();
    final entity = CustomerEntity(
      id: id,
      name: name.trim(),
      taxId: (taxId != null && taxId.trim().isNotEmpty) ? taxId.trim().toUpperCase() : null,
      phone: (phone != null && phone.trim().isNotEmpty) ? phone.trim() : null,
      email: (email != null && email.trim().isNotEmpty) ? email.trim() : null,
      address: (address != null && address.trim().isNotEmpty) ? address.trim() : null,
      pointsBalance: 0.0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    );
    await _database.customerDao.saveCustomer(entity);
    final domain = CustomerMapper.toDomain(entity);
    selectCustomer(domain);
    return domain;
  }

  Future<void> loadTenantConfig() async {
    try {
      _tenantConfig = await _tenantConfigService.getTenantConfig();
      notifyListeners();
    } catch (_) {
      // Non-blocking fallback
    }
  }

  double _commercialRate = 36.50;
  double get commercialRate => _commercialRate;

  double _bcnOfficialRate = 36.6241;
  double get bcnOfficialRate => _bcnOfficialRate;

  String _checkoutFxMode = 'COMMERCIAL';
  String get checkoutFxMode => _checkoutFxMode;

  double get activeCheckoutRate =>
      _checkoutFxMode == 'BCN_OFFICIAL' ? _bcnOfficialRate : _commercialRate;

  String get activeCheckoutRateLabel => _checkoutFxMode == 'BCN_OFFICIAL'
      ? 'TC BCN: ${_bcnOfficialRate.toStringAsFixed(4)}'
      : 'TC Comercial: ${_commercialRate.toStringAsFixed(2)}';

  Future<void> loadExchangeRates() async {
    try {
      final commVal = await _database.localConfigDao.getConfigByKey('commercial_exchange_rate');
      if (commVal != null) {
        _commercialRate = double.tryParse(commVal.value) ?? 36.50;
      }
      final bcnVal = await _database.localConfigDao.getConfigByKey('bcn_official_exchange_rate');
      if (bcnVal != null) {
        _bcnOfficialRate = double.tryParse(bcnVal.value) ?? 36.6241;
      }
      final modeVal = await _database.localConfigDao.getConfigByKey('checkout_fx_mode');
      if (modeVal != null && modeVal.value.isNotEmpty) {
        _checkoutFxMode = modeVal.value;
      }
      notifyListeners();
    } catch (_) {
      // Fallback to default FX rates
    }
  }

  final List<CartItem> _cart = [];
  List<CartItem> get cart => List.unmodifiable(_cart);

  List<Product> _products = [];
  List<Product> get products => _products;

  List<Promotion> _promotions = [];
  List<Promotion> get promotions => _promotions;

  List<Promotion> _allPromotions = [];
  List<Promotion> get allPromotions => _allPromotions;

  List<HoldTicket> _holdTickets = [];
  List<HoldTicket> get holdTickets => _holdTickets;

  CashierSession? _activeSession;
  CashierSession? get activeSession => _activeSession;

  Map<PaymentMethod, double> _sessionExpected = {
    PaymentMethod.cash: 0.0,
    PaymentMethod.card: 0.0,
    PaymentMethod.qr: 0.0,
  };
  Map<PaymentMethod, double> get sessionExpected => _sessionExpected;

  bool _isGlobalTaxExempt = false;
  bool get isGlobalTaxExempt => _isGlobalTaxExempt;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String _searchQuery = '';
  String get searchQuery => _searchQuery;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  UserRole? _currentUserRole;
  UserRole? get currentUserRole => _currentUserRole;
  bool get canManageCashDrawer =>
      _currentUserRole == UserRole.owner ||
      _currentUserRole == UserRole.manager;
  bool get canVoidInvoice =>
      _currentUserRole == UserRole.owner ||
      _currentUserRole == UserRole.manager;

  bool _isSupervisorOverrideActive = false;
  bool get isSupervisorOverrideActive => _isSupervisorOverrideActive;

  bool get _requiresSupervisorForRestrictedActions =>
      _currentUserRole == UserRole.cashier ||
      _currentUserRole == UserRole.waiter;

  void grantSupervisorOverride() {
    _isSupervisorOverrideActive = true;
    notifyListeners();
  }

  void _consumeOverride() {
    if (!_isSupervisorOverrideActive) return;
    _isSupervisorOverrideActive = false;
    notifyListeners();
  }

  void applyManualDiscount(double discountAmount) {
    if (discountAmount <= 0) {
      return;
    }

    if (_requiresSupervisorForRestrictedActions &&
        !_isSupervisorOverrideActive) {
      _errorMessage = 'Acceso denegado.';
      notifyListeners();
      return;
    }

    _totalDiscounts += discountAmount;
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> _loadCurrentUserRole() async {
    final user = await _authRepository.getCurrentUser();
    _currentUserRole = user?.role;
    notifyListeners();
  }

  double get subtotal {
    final rawSubtotal = _cart.fold(
      0.0,
      (sum, item) => sum + item.subtotal + item.modifiersTotal,
    );
    final totalWithPromos = rawSubtotal - _totalDiscounts;
    final afterLoyalty = totalWithPromos - loyaltyDiscount;
    return afterLoyalty < 0.0 ? 0.0 : afterLoyalty;
  }

  double _totalDiscounts = 0.0;
  double get totalDiscounts => _totalDiscounts + loyaltyDiscount;

  double get totalTax {
    if (_isGlobalTaxExempt) return 0.0;
    // Recalculate tax based on subtotal after discounts
    return _cart.fold(0.0, (sum, item) {
      final itemBase = item.subtotal + item.modifiersTotal;
      // Simple proportional discount application for tax calculation
      final totalBase = subtotal + _totalDiscounts;
      final itemDiscount = totalBase == 0
          ? 0.0
          : (_totalDiscounts * (itemBase / totalBase));
      return sum + ((itemBase - itemDiscount) * item.taxRate);
    });
  }

  double get total => subtotal + totalTax;

  TipType _tipType = TipType.none;
  double _customTipPercentage = 0.0;
  double _fixedTipAmount = 0.0;

  TipType get tipType => _tipType;
  double get customTipPercentage => _customTipPercentage;
  double get fixedTipAmount => _fixedTipAmount;

  BusinessModeEvaluator get businessModeEvaluator =>
      BusinessModeEvaluator(_tenantConfig ?? const TenantConfig());

  TipCalculation get tipCalculation => TipEngine.calculate(
        subtotalNio: subtotal,
        taxNio: totalTax,
        discountNio: 0.0,
        tipType: _tipType,
        customPercentage: _customTipPercentage,
        fixedAmount: _fixedTipAmount,
        commercialRate: _commercialRate,
      );

  double get tipAmount => tipCalculation.tipAmountNio;
  double get grandTotalWithTip => total + tipAmount;

  void setTip({
    required TipType tipType,
    double customPercentage = 0.0,
    double fixedAmount = 0.0,
  }) {
    _tipType = tipType;
    _customTipPercentage = customPercentage;
    _fixedTipAmount = fixedAmount;
    notifyListeners();
  }

  void clearTip() {
    _tipType = TipType.none;
    _customTipPercentage = 0.0;
    _fixedTipAmount = 0.0;
    notifyListeners();
  }

  SplitBillResult calculateEqualSplit(int coverCount) {
    return SplitBillEngine.splitEqual(
      subtotalNio: subtotal,
      taxNio: totalTax,
      tipNio: tipAmount,
      discountNio: 0.0,
      coverCount: coverCount,
      commercialRate: _commercialRate,
    );
  }

  SplitBillResult calculateItemizedSplit(List<ItemizedShareInput> shares) {
    return SplitBillEngine.splitByItems(
      shares: shares,
      commercialRate: _commercialRate,
    );
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> loadPromotions() async {
    final allEntities = await _database.promotionDao.getAllPromotions();
    _allPromotions = allEntities.map(SalesMapper.toPromotionDomain).toList();
    _promotions = _allPromotions.where((p) => p.isActive).toList();
    _applyPromotions();
    notifyListeners();
  }

  Future<void> togglePromotion(String promoId, bool isActive) async {
    await _database.promotionDao.setPromotionActive(promoId, isActive);
    await loadPromotions();
  }

  void _applyPromotions() {
    final result = _promotionsEngine.evaluate(
      cart: _cart,
      promotions: _promotions,
    );
    _totalDiscounts = result.totalDiscount;
  }

  Future<void> loadProducts() async {
    _isLoading = true;
    notifyListeners();
    try {
      _products = await _inventoryRepository.getActiveProducts();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  List<Product> get filteredProducts {
    if (_searchQuery.isEmpty) return _products;
    final q = _searchQuery.toLowerCase();
    return _products
        .where(
          (p) =>
              p.name.toLowerCase().contains(q) ||
              (p.sku?.toLowerCase().contains(q) ?? false) ||
              (p.barcode?.toLowerCase().contains(q) ?? false),
        )
        .toList();
  }

  Future<void> searchAndAddToCart(String code) async {
    try {
      final product = _products.firstWhere(
        (p) =>
            (p.sku != null && p.sku == code) ||
            (p.barcode != null && p.barcode == code),
      );
      addToCart(product);
      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Producto no encontrado: $code';
      notifyListeners();
    }
  }

  HoldTicket? _activeLoadedHoldTicket;
  HoldTicket? get activeLoadedHoldTicket => _activeLoadedHoldTicket;
  String? get activeTableId => _activeLoadedHoldTicket?.tableId;

  Future<void> loadHoldTickets() async {
    _holdTickets = await _tableOrderService.getAllOpenOrders();
    notifyListeners();
  }

  Future<void> holdCurrentTicket(
    String name, {
    String? tableId,
    String? areaId,
    String? waiterId,
    String? waiterName,
    int guestCount = 1,
  }) async {
    if (_cart.isEmpty) return;

    if (_activeLoadedHoldTicket != null) {
      await _tableOrderService.appendItemsToOrder(
        ticketId: _activeLoadedHoldTicket!.id,
        newItems: List.from(_cart),
        expectedVersion: _activeLoadedHoldTicket!.version,
      );
    } else {
      await _tableOrderService.parkOrder(
        name: name,
        tableId: tableId,
        areaId: areaId,
        waiterId: waiterId,
        waiterName: waiterName,
        guestCount: guestCount,
        isGlobalTaxExempt: _isGlobalTaxExempt,
        items: List.from(_cart),
      );
    }

    _activeLoadedHoldTicket = null;
    clearCart();
    await loadHoldTickets();
  }

  Future<void> recallTicket(HoldTicket ticket) async {
    _cart.clear();
    _cart.addAll(ticket.items);
    _isGlobalTaxExempt = ticket.isGlobalTaxExempt;
    _activeLoadedHoldTicket = ticket;

    await loadHoldTickets();
    _applyPromotions();
    notifyListeners();
  }

  void cancelLoadedHoldTicket() {
    _activeLoadedHoldTicket = null;
    clearCart();
  }

  Future<void> checkActiveSession() async {
    final sessionEntity = await _database.cashierSessionDao.getActiveSession();
    if (sessionEntity != null) {
      _activeSession = SalesMapper.toSessionDomain(sessionEntity);
      _sessionExpected = {
        PaymentMethod.cash: _activeSession!.openingBalance,
        PaymentMethod.card: 0.0,
        PaymentMethod.qr: 0.0,
      };
    } else {
      _activeSession = null;
    }
    notifyListeners();
  }

  Future<void> openSession(
    double balance, {
    CashSessionModel tipoModelo = CashSessionModel.cajaCentral,
  }) async {
    final user = await _authRepository.getCurrentUser();
    if (user == null) {
      _errorMessage = 'Debe iniciar sesión para abrir caja.';
      notifyListeners();
      return;
    }

    if (user.role == UserRole.waiter) {
      _errorMessage = 'Acceso denegado.';
      notifyListeners();
      return;
    }

    final session = CashierSession(
      id: const Uuid().v4(),
      userId: user.id,
      openedAt: DateTime.now(),
      tipoModelo: tipoModelo,
      openingBalance: balance,
      openingBalanceNio: balance,
      expectedNio: balance,
      totalExpected: balance,
    );
    await _database.cashierSessionDao.insertSession(
      SalesMapper.toSessionEntity(session),
    );
    _activeSession = session;
    _sessionExpected = {
      PaymentMethod.cash: balance,
      PaymentMethod.card: 0.0,
      PaymentMethod.qr: 0.0,
    };
    notifyListeners();
  }

  Future<void> closeSession(double closingBalance) async {
    if (_activeSession == null) return;

    final totalSales =
        _sessionExpected.values.fold(0.0, (sum, v) => sum + v) -
        _activeSession!.openingBalance;

    final updated = _activeSession!.copyWith(
      isClosed: true,
      closedAt: DateTime.now(),
      closingBalance: closingBalance,
      closingCountedNio: closingBalance,
      totalSales: totalSales,
      totalExpected: _sessionExpected[PaymentMethod.cash] ?? 0.0,
      expectedNio: _sessionExpected[PaymentMethod.cash] ?? 0.0,
    );
    await _database.cashierSessionDao.updateSession(
      SalesMapper.toSessionEntity(updated),
    );
    _activeSession = null;
    notifyListeners();
  }

  void addToCart(
    Product product, {
    double quantity = 1.0,
    String? variantId,
    List<Modifier> modifiers = const [],
  }) {
    final index = _cart.indexWhere(
      (item) =>
          item.productId == product.id &&
          item.variantId == variantId &&
          listEquals(item.selectedModifiers, modifiers),
    );

    if (index != -1) {
      _cart[index] = _cart[index].copyWith(
        quantity: _cart[index].quantity + quantity,
      );
    } else {
      double unitPrice = product.sellPrice;
      String productName = product.name;

      if (variantId != null) {
        try {
          final variant = product.variants.firstWhere((v) => v.id == variantId);
          unitPrice += variant.priceAdjustment;
          productName += ' (${variant.name})';
        } catch (_) {}
      }

      _cart.add(
        CartItem(
          productId: product.id,
          productName: productName,
          quantity: quantity,
          unitPrice: unitPrice,
          taxRate: 0.15,
          category: product.category,
          variantId: variantId,
          selectedModifiers: modifiers,
        ),
      );
    }
    _applyPromotions();
    // Re-evaluate loyalty when cart changes (fire-and-forget async)
    if (_selectedCustomer != null && _rewardInteraction?.selectedRewardId != null) {
      _reEvaluateLoyalty();
    }
    notifyListeners();
  }

  void removeFromCart(
    String productId, {
    String? variantId,
    List<Modifier>? modifiers,
  }) {
    _cart.removeWhere(
      (item) =>
          item.productId == productId &&
          item.variantId == variantId &&
          (modifiers == null || listEquals(item.selectedModifiers, modifiers)),
    );
    _applyPromotions();
    notifyListeners();
  }

  void updateQuantity(
    String productId,
    double quantity, {
    String? variantId,
    List<Modifier>? modifiers,
  }) {
    final index = _cart.indexWhere(
      (item) =>
          item.productId == productId &&
          item.variantId == variantId &&
          (modifiers == null || listEquals(item.selectedModifiers, modifiers)),
    );
    if (index != -1) {
      if (quantity <= 0) {
        _cart.removeAt(index);
      } else {
        _cart[index] = _cart[index].copyWith(quantity: quantity);
      }
      _applyPromotions();
      notifyListeners();
    }
  }

  void toggleGlobalTaxExempt() {
    _isGlobalTaxExempt = !_isGlobalTaxExempt;
    notifyListeners();
  }

  void clearCart() {
    _cart.clear();
    _isGlobalTaxExempt = false;
    _totalDiscounts = 0.0;
    _pointsToRedeem = 0.0;
    _activeLoadedHoldTicket = null;
    _lastPostPaidFeedback = null;
    _currentEvaluation = null;
    clearReward();
    notifyListeners();
  }

  Future<void> finalizeSale(List<PaymentMethod> methods) => processSale(methods);

  Future<void> processSale(
    List<PaymentMethod> methods, {
    List<Payment>? customPayments,
    String? buzzerNumber,
    String? customerName,
  }) async {
    final user = await _authRepository.getCurrentUser();
    if (user == null) {
      _errorMessage = 'Usuario no autenticado';
      notifyListeners();
      throw StateError('Usuario no autenticado');
    }

    final invoiceId = const Uuid().v4();
    final totalUsd = _commercialRate > 0
        ? ((total / _commercialRate) * 100).round() / 100
        : 0.0;

    final effectiveBuzzer = (buzzerNumber != null && buzzerNumber.trim().isNotEmpty)
        ? buzzerNumber.trim()
        : _buzzerNumber;
    final effectiveCustomerName =
        (customerName != null && customerName.trim().isNotEmpty)
            ? customerName.trim()
            : _customerName;

    final items = _cart.map((cartItem) {
      final appliedTaxRate = _isGlobalTaxExempt ? 0.0 : cartItem.taxRate;
      return InvoiceItem(
        id: const Uuid().v4(),
        invoiceId: invoiceId,
        productId: cartItem.productId,
        productName: cartItem.productName,
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice,
        originalTaxRate: cartItem.taxRate,
        appliedTaxRate: appliedTaxRate,
        taxAmount: cartItem.taxAmount,
        total: cartItem.total,
        variantId: cartItem.variantId,
        notes: cartItem.notes,
        selectedModifiers: cartItem.selectedModifiers,
      );
    }).toList();

    final invoice = Invoice(
      id: invoiceId,
      number: 'PENDING',
      createdAt: DateTime.now(),
      userId: user.id,
      customerId: _selectedCustomer?.id,
      subtotal: subtotal,
      totalTax: totalTax,
      total: total,
      globalTaxOverride: _isGlobalTaxExempt,
      bcnOfficialRate: _bcnOfficialRate,
      commercialRate: _commercialRate,
      totalUsd: totalUsd,
      terminalId: _terminalId,
    );

    final payments = customPayments != null && customPayments.isNotEmpty
        ? customPayments.map((p) => p.copyWith(
              invoiceId: invoiceId,
              id: p.id.isEmpty ? const Uuid().v4() : p.id,
            )).toList()
        : methods
            .map(
              (m) => Payment(
                id: const Uuid().v4(),
                invoiceId: invoiceId,
                method: m,
                amount: total / methods.length,
                currency: 'NIO',
                exchangeRate: _commercialRate,
                amountNio: total / methods.length,
                changeGiven: 0.0,
                changeCurrency: 'NIO',
              ),
            )
            .toList();

    try {
      await _salesRepository.saveSale(
        invoice: invoice,
        items: items,
        payments: payments,
      );

      // Fire-and-forget: trigger cloud sync after 3s debounce
      // (batches rapid consecutive sales into one sync pass)
      _syncDebounceTimer?.cancel();
      _syncDebounceTimer = Timer(const Duration(seconds: 3), () {
        _syncService?.triggerManualSync();
      });

      // Process Customer Loyalty (single write path via LoyaltyRewardInteractionService)
      if (_selectedCustomer != null) {
        final now = DateTime.now().millisecondsSinceEpoch;

        // 1. Process REDEEM if a reward was selected (single path — no _pointsToRedeem writer)
        if (_rewardInteraction?.selectedRewardId != null && _selectedReward != null) {
          final redeemUnits = _selectedReward!.costUnits;
          final currentBalance = _selectedCustomer!.pointsBalance;
          final newBalance = currentBalance - redeemUnits;
          final redeemTx = _loyaltyService.createRedeemTransaction(
            customerId: _selectedCustomer!.id,
            currentBalance: currentBalance,
            pointsToRedeem: redeemUnits.toDouble(),
            invoiceId: invoiceId,
          );
          try {
            await _database.customerPointTransactionDao
                .recordPointTransactionAndUpdateBalance(
              CustomerMapper.toPointTransactionEntity(redeemTx),
              _selectedCustomer!.id,
              newBalance,
              now,
            );
            _selectedCustomer = _selectedCustomer!.copyWith(pointsBalance: newBalance);
          } catch (_) {}
        }

        // 2. Process accumulation on the final net subtotal
        final pointsEarned = _loyaltyService.calculatePointsEarned(subtotal);
        if (pointsEarned > 0) {
          final currentBalance = _selectedCustomer!.pointsBalance;
          final earnTx = _loyaltyService.createEarnTransaction(
            customerId: _selectedCustomer!.id,
            currentBalance: currentBalance,
            netAmount: subtotal,
            invoiceId: invoiceId,
          );
          try {
            await _database.customerPointTransactionDao
                .recordPointTransactionAndUpdateBalance(
              CustomerMapper.toPointTransactionEntity(earnTx),
              _selectedCustomer!.id,
              earnTx.balanceAfter,
              now,
            );
            _selectedCustomer = _selectedCustomer!.copyWith(pointsBalance: earnTx.balanceAfter);
          } catch (_) {}
        }

        // 3. Compute PostPaidFeedback using real LoyaltyEvaluation (not hardcoded)
        final redeemPts = (_rewardInteraction?.selectedRewardId != null && _selectedReward != null)
            ? _selectedReward!.costUnits
            : 0;
        final earnedPts = pointsEarned.toInt();
        final newBalance = _selectedCustomer!.pointsBalance.toInt();
        final feedbackEvaluation = _currentEvaluation ?? LoyaltyEvaluation(
          customerId: _selectedCustomer!.id,
          ticketId: invoiceId,
          programs: [
            ProgramEvaluation(
              programId: 'loyalty-default',
              programName: 'Puntos',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: newBalance,
              earningPreviewUnits: earnedPts,
            ),
          ],
        );
        _lastPostPaidFeedback = _postPaidFeedbackService.compute(
          evaluation: feedbackEvaluation,
          postCommitBalances: {'loyalty-default': newBalance},
          earnedUnits: {'loyalty-default': earnedPts},
          redeemedUnits: {'loyalty-default': redeemPts},
        );
      }

      // Update expected totals
      for (final p in payments) {
        if (_activeSession?.tipoModelo == CashSessionModel.carteraMesero &&
            p.method != PaymentMethod.cash) {
          continue;
        }
        final effectiveCashNio = (p.method == PaymentMethod.cash && p.amountNio > 0)
            ? (p.amountNio - p.changeGiven)
            : p.amount;
        _sessionExpected[p.method] =
            (_sessionExpected[p.method] ?? 0.0) + effectiveCashNio;
      }

      if (_activeLoadedHoldTicket != null) {
        await _tableOrderService.liquidateOrder(_activeLoadedHoldTicket!.id);
        _activeLoadedHoldTicket = null;
      } else {
        // Direct counter sale: dispatch to kitchen KDS if items exist
        if (_cart.isNotEmpty) {
          try {
            await _kitchenOrderService.sendDirectSaleToKitchen(
              invoiceId: invoiceId,
              invoiceNumber: invoice.number,
              items: List.from(_cart),
              buzzerNumber: effectiveBuzzer,
              customerName: effectiveCustomerName,
              waiterName: user.name,
            );
          } catch (_) {
            // Graceful fallback for offline tests/setups
          }
        }
      }

      // Auto-Printing & Hardware Drawer Kick (PRD Batch 7)
      Invoice? savedInvoice;
      try {
        savedInvoice = await _salesRepository.getInvoiceById(invoiceId);
      } catch (_) {
        // Non-blocking fallback for offline environments or unstubbed test mocks
      }
      final invoiceToPrint = savedInvoice ?? invoice;
      _lastProcessedInvoice = invoiceToPrint;
      _lastPrintError = null;

      try {
        final printerConfig = await _printerConfigService.getPrinterConfig();
        final hasCashPayment = payments.any((p) => p.method == PaymentMethod.cash);

        final activePrinterPort = PrinterResolver.resolve(printerConfig);

        if (printerConfig.openDrawerOnCash && hasCashPayment) {
          await activePrinterPort.openCashDrawer();
        }

        List<int>? logoRasterBytes;
        if (printerConfig.isLogoEnabled &&
            printerConfig.logoBase64 != null) {
          try {
            final rawBytes = base64Decode(printerConfig.logoBase64!);
            if (ThermalLogoProcessor.isPng(rawBytes)) {
              logoRasterBytes = rawBytes;
            } else if (printerConfig.logoWidth != null && printerConfig.logoHeight != null) {
              logoRasterBytes = ThermalLogoProcessor.buildEscPosRasterFrom1Bit(
                raw1BitBitmap: rawBytes,
                width: printerConfig.logoWidth!,
                height: printerConfig.logoHeight!,
              );
            } else {
              logoRasterBytes = rawBytes;
            }
          } catch (_) {}
        }

        if (printerConfig.autoPrintInvoice) {
          final printResult = await activePrinterPort.printInvoice(
            invoiceToPrint,
            items: items,
            payments: payments,
            businessName: printerConfig.headerBusinessName,
            legalName: printerConfig.headerLegalName,
            ruc: printerConfig.headerRuc,
            address: printerConfig.headerAddress,
            phone: printerConfig.headerPhone,
            cashierName: user.name,
            logoRasterBytes: logoRasterBytes,
            taxRegime: TaxRegime.fromString(printerConfig.taxRegime),
            isTaxExempt: _isGlobalTaxExempt,
            paperWidthMm: printerConfig.paperWidthMm,
            loyaltyFeedback: _lastPostPaidFeedback,
          );

          if (!printResult.isSuccess) {
            _lastPrintError = printResult.message ?? 'Error de impresión en hardware';
          }
        }

        if (printerConfig.autoPrintKitchen && items.isNotEmpty) {
          await activePrinterPort.printKitchenOrder(
            ticketId: invoiceToPrint.id.length > 8 ? invoiceToPrint.id.substring(0, 8) : invoiceToPrint.id,
            orderTitle: 'Orden #${invoiceToPrint.number}',
            cashierName: user.name,
            timestamp: DateTime.now(),
            items: items,
            buzzerNumber: int.tryParse(effectiveBuzzer ?? ''),
            tableName: _activeLoadedHoldTicket?.name,
          );
        }
      } catch (e) {
        debugPrint('[SaleViewModel] Non-blocking hardware printing error: $e');
        _lastPrintError = e.toString();
      }

      _buzzerNumber = null;
      _customerName = null;
      _selectedCustomer = null;
      _errorMessage = null;
      clearCart();
      _consumeOverride();
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[SaleViewModel] processSale failed: $e');
      }
      _errorMessage = 'Error al procesar la venta: $e';
      notifyListeners();
      rethrow;
    }
  }

  /// Manually triggers a reprint of the last successfully processed invoice.
  Future<bool> reprintLastInvoice() async {
    if (_lastProcessedInvoice == null) return false;
    try {
      final config = await _printerConfigService.getPrinterConfig();
      final items = await _database.invoiceItemDao.getItemsByInvoiceId(_lastProcessedInvoice!.id);
      final domainItems = items.map((e) => InvoiceItem(
        id: e.id,
        invoiceId: e.invoiceId,
        productId: e.productId,
        productName: e.productName,
        quantity: e.quantity,
        unitPrice: e.unitPrice,
        originalTaxRate: e.originalTaxRate,
        appliedTaxRate: e.appliedTaxRate,
        taxAmount: e.taxAmount,
        total: e.total,
        discount: e.discount,
        variantId: e.variantId,
        notes: e.notes,
      )).toList();

      final payments = await _database.paymentDao.getPaymentsByInvoiceId(_lastProcessedInvoice!.id);
      final domainPayments = payments.map((e) => Payment(
        id: e.id,
        invoiceId: e.invoiceId,
        method: PaymentMethod.values.firstWhere(
          (m) => m.name == e.method,
          orElse: () => PaymentMethod.cash,
        ),
        amount: e.amount,
        currency: e.currency,
        exchangeRate: e.exchangeRate,
        amountNio: e.amountNio,
        changeGiven: e.changeGiven,
        changeCurrency: e.changeCurrency,
        voucherCode: e.voucherCode,
        cardBrand: e.cardBrand,
        bankPos: e.bankPos,
        last4: e.last4,
      )).toList();

      List<int>? logoRasterBytes;
      if (config.isLogoEnabled &&
          config.logoBase64 != null) {
        try {
          final rawBytes = base64Decode(config.logoBase64!);
          if (ThermalLogoProcessor.isPng(rawBytes)) {
            logoRasterBytes = rawBytes;
          } else if (config.logoWidth != null && config.logoHeight != null) {
            logoRasterBytes = ThermalLogoProcessor.buildEscPosRasterFrom1Bit(
              raw1BitBitmap: rawBytes,
              width: config.logoWidth!,
              height: config.logoHeight!,
            );
          } else {
            logoRasterBytes = rawBytes;
          }
        } catch (_) {}
      }

      final activePrinterPort = PrinterResolver.resolve(config);

      final res = await activePrinterPort.printInvoice(
        _lastProcessedInvoice!,
        items: domainItems,
        payments: domainPayments,
        businessName: config.headerBusinessName,
        legalName: config.headerLegalName,
        ruc: config.headerRuc,
        address: config.headerAddress,
        phone: config.headerPhone,
        logoRasterBytes: logoRasterBytes,
        taxRegime: TaxRegime.fromString(config.taxRegime),
        isTaxExempt: _lastProcessedInvoice?.globalTaxOverride ?? _isGlobalTaxExempt,
        paperWidthMm: config.paperWidthMm,
      );

      if (!res.isSuccess) {
        _lastPrintError = res.message;
        notifyListeners();
        return false;
      }
      return true;
    } catch (e) {
      _lastPrintError = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> processReturn(
    String invoiceNumber,
    String reason, {
    RefundReasonPolicy refundReasonPolicy =
        RefundReasonPolicy.restockOriginalBom,
    List<CreditNoteRefundLine>? lines,
  }) async {
    final currentUser = await _authRepository.getCurrentUser();
    final role = currentUser?.role;
    if (role == UserRole.cashier || role == UserRole.waiter) {
      _errorMessage = 'Acceso denegado.';
      notifyListeners();
      return;
    }

    _isLoading = true;
    notifyListeners();
    try {
      final original = await _salesRepository.getInvoiceByNumber(invoiceNumber);
      if (original == null) {
        _errorMessage = 'Factura no encontrada: $invoiceNumber';
        return;
      }

      if (original.isCanceled) {
        _errorMessage = 'La factura ya está anulada.';
        return;
      }

      await _salesRepository.createCreditNote(
        originalInvoiceId: original.id,
        reason: reason,
        authorizedByUserId: currentUser?.id ?? '',
        authorizedByRole: role ?? UserRole.cashier,
        refundReasonPolicy: refundReasonPolicy,
        lines: lines,
      );

      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Error al procesar devolución: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> voidInvoice(String invoiceId, String reason) async {
    final currentUser = await _authRepository.getCurrentUser();
    final role = currentUser?.role;
    if (role == UserRole.cashier || role == UserRole.waiter) {
      _errorMessage = 'Acceso denegado.';
      notifyListeners();
      return;
    }

    _isLoading = true;
    notifyListeners();
    try {
      await _salesRepository.voidInvoice(invoiceId, reason);
      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Error al anular factura: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _syncDebounceTimer?.cancel();
    _syncSubscription?.cancel();
    super.dispose();
  }
}
