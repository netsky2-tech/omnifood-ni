import 'dart:developer' as developer;
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
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
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/ui/features/sales/sales_permissions.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/config/discount_policy_service.dart';
import '../../../../domain/services/config/printer_config_service.dart';
import '../../../../domain/services/printer/printer_resolver.dart';
import '../../../../domain/services/printer/thermal_logo_processor.dart';
import 'dart:async';
import '../../../../domain/services/sales/invoice_fiscal_calculator.dart';
import '../../../../domain/services/sales/discount_origin_allocator.dart';
import '../../../../domain/ports/printer_port.dart';
import '../../../../domain/services/kitchen/kitchen_order_service.dart';
import '../../../../data/services/sync_service.dart';
import '../../../../domain/services/sales/tip_engine.dart';
import '../../../../domain/services/sales/split_bill_engine.dart';
import '../../../../domain/services/config/business_mode_evaluator.dart';

/// #67/T2a: why a recorded exchange rate could not be resolved. Recorded per
/// rate so the failure can be surfaced and diagnosed instead of silently
/// collapsing into a default number.
enum FxRateResolutionFailure {
  /// No configuration row exists for the key.
  absent,

  /// The stored value is not parseable as a number.
  unparseable,

  /// The stored value parses but is not a usable rate (<= 0).
  nonPositive,

  /// The DAO read itself failed.
  readError,
}

/// #67/T2a: named fail-closed state — one of the two recorded exchange rates
/// is absent, corrupt or unreadable, so no reliable rate exists and the
/// terminal must not sell. Its [message] is the directive Spanish text the
/// operator sees verbatim (same contract as FiscalSequenceUnconfiguredError).
class FiscalExchangeRateUnconfiguredError implements Exception {
  final String message;

  const FiscalExchangeRateUnconfiguredError(this.message);

  @override
  String toString() => 'FiscalExchangeRateUnconfiguredError: $message';
}

/// Audit #79: honest tri-state for the ANULADO copy printed after a void.
/// The old `bool` could not distinguish "the copy came out", "printing was
/// never requested (auto-print off)" and "printing was attempted and
/// failed" — the SnackBar fabricated a failure when auto-print was off.
/// The fiscal void is the fact; the print is derivative and NEVER reported
/// as a void failure.
enum VoidCopyPrintOutcome {
  /// The copy was requested and printed successfully.
  printed,

  /// The copy was NOT requested: `autoPrintInvoice` is off (audit #79 gate).
  /// Not a failure.
  notRequested,

  /// The copy was requested but the print failed; [SaleViewModel.lastPrintError]
  /// carries the reason.
  failed,
}

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
  final bool _hasCustomPrinterPort;
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

    /// M11: customer identification service (QR/code/phone/search adapter
    /// chain). Null disables identifyCustomer entirely, which is why the
    /// production wiring in main.dart MUST inject it (manual entry included).
    CustomerIdentificationService? identificationService,
  ]) : _tableOrderService = tableOrderService ?? TableOrderService(_database),
       _tenantConfigService =
           tenantConfigService ?? TenantConfigService(_database.localConfigDao),
       _kitchenOrderService =
           kitchenOrderService ?? KitchenOrderService(_database),
       _printerConfigService =
           printerConfigService ??
           PrinterConfigService(_database.localConfigDao),
       _hasCustomPrinterPort = printerPort != null,
       _printerPort =
           printerPort ?? PrinterResolver.resolve(const PrinterConfig()),
       _promotionsEngine = promotionsEngine ?? const PromotionsEngine(),
       _loyaltyService = loyaltyService ?? const LoyaltyService(),
       _postPaidFeedbackService = const PostPaidFeedbackService(),
       _identificationService = identificationService,
       _rewardInteraction = null,
       _evaluationService = null,
       _terminalId = terminalId {
    _syncService = syncService;
    if (syncService != null) {
      _syncSubscription = syncService.onInboundSync.listen((event) {
        if (event.productsCount > 0 || event.catalogValuesCount > 0) {
          loadProducts();
        }
        _reloadPromotionsOnInboundSync(event);
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
      loadDiscountCaps();
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
  }) : _tableOrderService = tableOrderService ?? TableOrderService(_database),
       _tenantConfigService =
           tenantConfigService ?? TenantConfigService(_database.localConfigDao),
       _kitchenOrderService =
           kitchenOrderService ?? KitchenOrderService(_database),
       _printerConfigService =
           printerConfigService ??
           PrinterConfigService(_database.localConfigDao),
       _hasCustomPrinterPort = printerPort != null,
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
        _reloadPromotionsOnInboundSync(event);
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
      loadDiscountCaps();
      loadCompanyTaxRegime();
    }
  }

  String? _lastPrintError;
  String? get lastPrintError => _lastPrintError;

  Invoice? _lastProcessedInvoice;
  Invoice? get lastProcessedInvoice => _lastProcessedInvoice;

  /// Whether the LAST void's ANULADO copy actually printed. The success
  /// SnackBar branches on this: claiming a print that did not happen would
  /// be the same fabrication failure #548 called out.
  bool _lastVoidPrintSucceeded = false;
  bool get lastVoidPrintSucceeded => _lastVoidPrintSucceeded;

  /// Audit #79: tri-state outcome of the LAST void's ANULADO copy. True
  /// honesty for the SnackBar: `printed` confirms paper, `notRequested`
  /// states the copy was skipped because auto-print is off (NOT a failure),
  /// `failed` means the print was attempted and did not come out (the
  /// reason rides [lastPrintError]). The void itself is never rolled back
  /// nor reported failed because of a print problem.
  VoidCopyPrintOutcome _lastVoidCopyPrintOutcome =
      VoidCopyPrintOutcome.notRequested;
  VoidCopyPrintOutcome get lastVoidCopyPrintOutcome =>
      _lastVoidCopyPrintOutcome;

  /// Whether the LAST reprint's copy actually printed (D-13 honesty rule:
  /// the SnackBar claims only what happened; the audit stands either way).
  bool _lastReprintPrintSucceeded = false;
  bool get lastReprintPrintSucceeded => _lastReprintPrintSucceeded;

  /// H8: honest split for credit notes — issuance success and the fiscal
  /// print outcome are reported SEPARATELY. A failed print never un-happens
  /// the committed note; the failure detail rides [lastPrintError] and the
  /// manual REIMPRIMIR path covers credit notes (D-13).
  bool _lastCreditNotePrintSucceeded = false;
  bool get lastCreditNotePrintSucceeded => _lastCreditNotePrintSucceeded;

  PostPaidFeedback? _lastPostPaidFeedback;
  PostPaidFeedback? get lastPostPaidFeedback => _lastPostPaidFeedback;

  /// Last structured loyalty failure (audit B1/B2/H9): redeem persistence,
  /// earn persistence, or cart re-evaluation. Diagnostic-only surface —
  /// loyalty failures NEVER block the local sale path (offline-first),
  /// but they can no longer be silently swallowed.
  String? _lastLoyaltyError;
  String? get lastLoyaltyError => _lastLoyaltyError;

  /// POS-B (re-audit): armed when a sale completes while [_lastLoyaltyError]
  /// is set, so the view can surface a NON-blocking cashier warning. The
  /// sale IS registered — this flag only exists so loyalty drift is never
  /// invisible at the point of sale.
  bool _pendingLoyaltyWarning = false;
  bool get hasPendingLoyaltyWarning => _pendingLoyaltyWarning;

  /// Consumes the armed post-sale loyalty warning exactly once (the view
  /// calls this right before showing the warning SnackBar).
  void consumePendingLoyaltyWarning() {
    _pendingLoyaltyWarning = false;
  }

  void _recordLoyaltyFailure(String operation, Object error) {
    _lastLoyaltyError = 'loyalty $operation failed: $error';
    debugPrint('[SaleViewModel] $_lastLoyaltyError (non-blocking)');
  }

  // --- Loyalty wiring: evaluation + reward selection state ---
  LoyaltyEvaluation? _currentEvaluation;
  LoyaltyEvaluation? get currentEvaluation => _currentEvaluation;

  /// P3 defect #2: the terminal's local tenant binding, resolved from the
  /// 'tenant_id' local config key — the SAME source the sync service uses
  /// when it writes the loyalty rows. Empty when the terminal has no
  /// binding, which fails closed (no programs, no rewards, no loyalty
  /// surface); a tenant is never fabricated from the customer or elsewhere.
  String _resolvedLocalTenantId = '';

  RewardDefinitionLocal? _selectedReward;
  RewardDefinitionLocal? get selectedReward => _selectedReward;

  /// P3 defect #3: the cart discount granted by the SELECTED reward. The old
  /// code recorded WHICH reward was chosen (for the points ledger at
  /// checkout) but never turned its benefit into a discount — the cart's
  /// loyalty money came only from the free-points path, whose only setter
  /// (applyLoyaltyPoints) has no production caller. The discount is granted
  /// ONCE, at selection time, against the residual the customer actually
  /// pays (same apply-time ceiling contract as applyLoyaltyPoints →
  /// validateRedemption), and is removed exactly by clearReward()/deselect.
  double _selectedRewardDiscount = 0.0;
  double get selectedRewardDiscount => _selectedRewardDiscount;

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
  ///
  /// P3 defect #3: selecting a reward must also GRANT its benefit to the
  /// cart, not only record it for the ledger. A DISCOUNT_AMOUNT reward turns
  /// `benefitConfigJson.amountNio` into the cart's loyaltyDiscount; anything
  /// that cannot be granted safely is refused with an operator-visible
  /// Spanish message and NO state mutation (money path: never fabricate a
  /// discount, never exceed the residual the customer pays).
  void selectReward(String rewardId) {
    if (_rewardInteraction == null || _currentEvaluation == null) return;
    RewardDefinitionLocal? reward;
    try {
      reward = _cachedRewards.firstWhere((r) => r.id == rewardId);
    } catch (_) {
      reward = null;
    }
    // Resolve the cart discount BEFORE committing the selection: a refusal
    // must not leave a ledger selection that the cart never honored.
    final cartDiscount = reward == null ? 0.0 : _resolveRewardCartDiscount(reward);
    if (cartDiscount == null) return; // refused + messaged; nothing mutated
    _rewardInteraction!.selectReward(_currentEvaluation!, rewardId);
    _selectedReward = _resolveSelectedReward();
    _selectedRewardDiscount = cartDiscount;
    notifyListeners();
  }

  /// Clears the current reward selection.
  void clearReward() {
    _rewardInteraction?.clearSelection();
    _selectedReward = null;
    _selectedRewardDiscount = 0.0;
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
      // P3 defect #2: the local tenant id MUST come from the terminal
      // binding ('tenant_id' local config key — the same source the sync
      // service uses when it WRITES the loyalty rows), not from the selected
      // customer. LoyaltyProgramEntity.tenantId is a real indexed column;
      // querying by the customer id always returned an empty catalog, so
      // LoyaltyCompactWidget and RewardCtaWidget never rendered. Fail
      // closed: an unbound terminal resolves to an empty tenant, the scoped
      // lookups return nothing, and no tenant is ever fabricated.
      final tenantConfig =
          await _database.localConfigDao.getConfigByKey('tenant_id');
      _resolvedLocalTenantId = tenantConfig?.value ?? '';
      final tenantId = _resolvedLocalTenantId;
      final programs = await _database.loyaltyProgramDao.getActivePrograms(
        tenantId,
      );
      final rewards = await _database.loyaltyRewardDao.getActiveRewards(
        tenantId,
      );

      // Build balance map from program IDs
      final balanceMap = <String, int>{};
      for (final p in programs) {
        balanceMap[p.id] = _selectedCustomer!.pointsBalance.toInt();
      }

      // Build snapshot from current cart
      final snapshot = _buildTicketSnapshot();

      final domainPrograms = programs
          .map(
            (e) => LoyaltyProgramLocal(
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
              startsAt: e.startsAt != null
                  ? DateTime.fromMillisecondsSinceEpoch(e.startsAt!)
                  : null,
              endsAt: e.endsAt != null
                  ? DateTime.fromMillisecondsSinceEpoch(e.endsAt!)
                  : null,
              earningRuleJson: e.earningRuleJson,
              eligibilityRuleJson: e.eligibilityRuleJson,
              configVersion: e.configVersion,
            ),
          )
          .toList();

      final domainRewards = rewards
          .map(
            (e) => RewardDefinitionLocal(
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
              startsAt: e.startsAt != null
                  ? DateTime.fromMillisecondsSinceEpoch(e.startsAt!)
                  : null,
              endsAt: e.endsAt != null
                  ? DateTime.fromMillisecondsSinceEpoch(e.endsAt!)
                  : null,
            ),
          )
          .toList();

      _currentEvaluation = _evaluationService!.evaluate(
        snapshot: snapshot,
        programs: domainPrograms,
        rewards: domainRewards,
        balanceMap: balanceMap,
      );

      // Cache rewards for resolution
      _cachedRewards = domainRewards;

      // Validate current reward selection is still eligible
      if (_rewardInteraction != null &&
          _rewardInteraction!.selectedRewardId != null) {
        _rewardInteraction!.validateAfterCartChange(_currentEvaluation!);
        _selectedReward = _resolveSelectedReward();
      }
    } catch (e) {
      // H9: re-evaluation is best-effort for the cart flow, but the
      // failure is now observable instead of silently swallowed.
      _recordLoyaltyFailure('re-evaluate', e);
    }
  }

  LoyaltyTicketSnapshot _buildTicketSnapshot() {
    final lines = _cart
        .map(
          (item) => TicketLineSnapshot(
            lineId: item.productId,
            productId: item.productId,
            quantity: item.quantity.toInt(),
            netAmount: item.subtotal,
            source: TicketLineSource.normal,
          ),
        )
        .toList();

    return LoyaltyTicketSnapshot(
      tenantId: _resolvedLocalTenantId,
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

  // --- P3 defect #3: reward benefit → cart loyalty discount ---

  /// The residual the customer actually pays after ALL already-granted
  /// discounts. The SAME base applyLoyaltyPoints uses as its redemption
  /// ceiling (raw subtotal minus promotions and manual), so both loyalty
  /// paths enforce one identical money rule.
  double _residualPayableAfterGrantedDiscounts() {
    final rawSubtotal = _cart.fold(
      0.0,
      (sum, item) => sum + item.subtotal + item.modifiersTotal,
    );
    return rawSubtotal - _promotionDiscount - _manualDiscount;
  }

  static const _msgRewardDiscountExceedsOrder =
      'El descuento por recompensa (C\$ {amount}) no puede exceder el total de la orden (C\$ {order}).';
  static const _msgRewardBenefitUnreadable =
      'No se pudo aplicar la recompensa: su configuración de beneficio no es válida. Pedile al dueño o a un encargado que la revise en el panel de negocio.';
  static const _msgRewardNotApplicableToCart =
      'La recompensa «{name}» aún no puede aplicarse al cobro en este terminal; se registrará en el programa de puntos pero el total no cambia. Avisá al encargado si esperabas un descuento.';

  /// Reads the DISCOUNT_AMOUNT benefit (`{"amountNio": <num>}`) from the
  /// reward's stored config. Returns null when the shape is absent, corrupt
  /// or non-positive — the caller must then refuse; a fabricated amount is
  /// never invented, and neither is a fabricated 0.
  double? _parseDiscountBenefitAmount(RewardDefinitionLocal reward) {
    try {
      final decoded = jsonDecode(reward.benefitConfigJson);
      if (decoded is! Map) return null;
      final raw = decoded['amountNio'];
      if (raw is num && raw > 0) return raw.toDouble();
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Resolves the cart discount a reward grants, with the operator-visible
  /// outcome for everything that cannot be granted. Returns null ONLY for a
  /// refusal (state must stay untouched); a returned value is the exact
  /// discount to apply.
  ///
  /// CEILING DECISION: REFUSED, not clamped — the same contract the
  /// free-points path enforces through LoyaltyService.validateRedemption
  /// ('…no puede exceder el total de la orden…'). A clamp would silently
  /// grant a different amount than the owner configured; a silent zero would
  /// hide the failure. Refusal mutates NO state.
  ///
  /// FREE_PRODUCT (and other non-amount types) GAP: no line-level
  /// application exists today and inventing one (zeroing/removing a line,
  /// retro-fitting promotions) is out of scope, so the selection is still
  /// recorded for the points ledger (unchanged REDEEM behavior) while the
  /// operator SEES a directive message that the total does not change. No
  /// silent no-op.
  double? _resolveRewardCartDiscount(RewardDefinitionLocal reward) {
    switch (reward.rewardType) {
      case RewardType.discountAmount:
        final benefit = _parseDiscountBenefitAmount(reward);
        if (benefit == null) {
          _errorMessage = _msgRewardBenefitUnreadable;
          notifyListeners();
          return null;
        }
        final residual = _residualPayableAfterGrantedDiscounts();
        if (benefit > residual) {
          _errorMessage = _msgRewardDiscountExceedsOrder
              .replaceFirst('{amount}', benefit.toStringAsFixed(2))
              .replaceFirst('{order}', residual.toStringAsFixed(2));
          notifyListeners();
          return null;
        }
        _errorMessage = null;
        return benefit;
      case RewardType.freeProduct:
      case RewardType.discountPercentage:
      case RewardType.freeShipping:
        _errorMessage = _msgRewardNotApplicableToCart
            .replaceFirst('{name}', reward.name);
        notifyListeners();
        return 0.0;
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
    _buzzerNumber = (number != null && number.trim().isNotEmpty)
        ? number.trim()
        : null;
    notifyListeners();
  }

  String? _customerName;
  String? get customerName => _customerName;

  String? _customerTaxId;
  String? get customerTaxId => _customerTaxId;

  Customer? _selectedCustomer;
  Customer? get selectedCustomer => _selectedCustomer;

  /// Selects a customer and re-evaluates loyalty state.
  /// Returns a Future that completes when evaluation is done.
  Future<void> selectCustomer(Customer? customer) async {
    _selectedCustomer = customer;
    _customerName = customer?.name;
    _customerTaxId = customer?.taxId;
    _pointsToRedeem = 0.0;
    clearReward();
    await _reEvaluateLoyalty();
    notifyListeners();
  }

  void clearCustomer() {
    _selectedCustomer = null;
    _customerName = null;
    _customerTaxId = null;
    _pointsToRedeem = 0.0;
    _currentEvaluation = null;
    clearReward();
    notifyListeners();
  }

  double _pointsToRedeem = 0.0;
  double get pointsToRedeem => _pointsToRedeem;

  /// P3 defect #3: the cart's loyalty money now has TWO sources — the
  /// free-points path (unchanged; selectCustomer zeroes `_pointsToRedeem`,
  /// so the production flows are mutually exclusive) and the selected
  /// reward's DISCOUNT_AMOUNT benefit. Reward-less carts are unaffected:
  /// `_selectedRewardDiscount` is 0.0 and this getter returns exactly what
  /// it returned before.
  double get loyaltyDiscount =>
      _loyaltyService.calculateDiscountFromPoints(_pointsToRedeem) +
      _selectedRewardDiscount;
  double get promoDiscounts => _promotionDiscount;

  RedemptionValidationResult applyLoyaltyPoints(double points) {
    if (_selectedCustomer == null) {
      return RedemptionValidationResult.failure(
        'Debe seleccionar un cliente para redimir puntos.',
      );
    }
    // orderTotal acts ONLY as a ceiling on the redeemable amount, so it must
    // be the residual the customer actually pays after ALL already-granted
    // discounts. A larger ceiling would let points be redeemed against value
    // the manual or promotion discount already gave away. The SAME residual
    // rule caps the selected-reward discount (P3 defect #3).
    final currentSubtotal = _residualPayableAfterGrantedDiscounts();
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
    _customerName = (name != null && name.trim().isNotEmpty)
        ? name.trim()
        : null;
    notifyListeners();
  }

  void setCustomerTaxId(String? taxId) {
    _customerTaxId = (taxId != null && taxId.trim().isNotEmpty)
        ? taxId.trim().toUpperCase()
        : null;
    notifyListeners();
  }

  Future<List<Customer>> searchCustomers(String query) async {
    if (query.trim().isEmpty) {
      final entities = await _database.customerDao.getAllCustomers();
      return entities.map(CustomerMapper.toDomain).toList();
    }
    final entities = await _database.customerDao.searchCustomers(
      query.trim(),
      20,
    );
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
      taxId: (taxId != null && taxId.trim().isNotEmpty)
          ? taxId.trim().toUpperCase()
          : null,
      phone: (phone != null && phone.trim().isNotEmpty) ? phone.trim() : null,
      email: (email != null && email.trim().isNotEmpty) ? email.trim() : null,
      address: (address != null && address.trim().isNotEmpty)
          ? address.trim()
          : null,
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

  // SOHO-P3 S1b: owner-configured manual discount caps, projected from the
  // fiscal snapshot into local_configs and read through the typed accessor
  // layer. null = NO CAP (unconfigured or explicitly cleared) — same
  // three-state contract as the wire: a cap of 0 forbids manual discounts
  // entirely. Refreshed at construction and again before every prompt (see
  // SaleView), so a synced cap change reaches a running terminal without a
  // restart.
  double? _maxDiscountAmountCap;
  double? get maxDiscountAmountCap => _maxDiscountAmountCap;

  double? _maxDiscountPercentCap;
  double? get maxDiscountPercentCap => _maxDiscountPercentCap;

  Future<void> loadDiscountCaps() async {
    try {
      _maxDiscountAmountCap = await _tenantConfigService.getMaxDiscountAmount();
      _maxDiscountPercentCap =
          await _tenantConfigService.getMaxDiscountPercent();
      notifyListeners();
    } catch (_) {
      // Non-blocking fallback: keep the last known caps.
    }
  }

  /// Operator-visible configured limit for the manual discount prompt, shown
  /// BEFORE the cashier types an amount. Null when no cap is configured.
  /// Both bounds are shown when both are configured; the effective (binding)
  /// limit is the minimum and is stated verbatim in the rejection message.
  String? get manualDiscountLimitLabel {
    final amount = _maxDiscountAmountCap;
    final percent = _maxDiscountPercentCap;
    if (amount == null && percent == null) return null;
    final parts = <String>[
      if (amount != null) 'C\$ ${amount.toStringAsFixed(2)} por monto',
      if (percent != null)
        '${percent % 1 == 0 ? percent.toStringAsFixed(0) : percent.toString()}% del subtotal',
    ];
    return 'Límite de descuento manual: ${parts.join(' · ')}';
  }

  TaxRegime? _companyTaxRegime;
  TaxRegime? get companyTaxRegime => _companyTaxRegime;

  bool _taxRegimeOverrideActive = false;

  void setCompanyTaxRegime(TaxRegime? regime) {
    _taxRegimeOverrideActive = true;
    _companyTaxRegime = regime;
    notifyListeners();
  }

  Future<void> loadCompanyTaxRegime() async {
    if (_taxRegimeOverrideActive) return;
    try {
      final entity = await _database.localConfigDao.getConfigByKey(
        'tax_regime',
      );
      if (entity != null && entity.value.trim().isNotEmpty) {
        _companyTaxRegime = TaxRegime.fromString(entity.value);
      } else {
        _companyTaxRegime = null;
      }
      notifyListeners();
    } catch (_) {
      // Non-blocking fallback
    }
  }

  // #67/T2a: an absent, corrupt or unreadable rate is a STATE, never a
  // number. 0.0 means "unknown"; the reliability flags below are the ONLY
  // signal a reader may consult before producing a fiscal artifact. A reader
  // that forgets to check cannot fabricate a fiscal figure: the domain
  // calculator throws on a non-positive rate and finalization fails closed.
  double _commercialRate = 0.0;
  double get commercialRate => _commercialRate;

  double _bcnOfficialRate = 0.0;
  double get bcnOfficialRate => _bcnOfficialRate;

  bool _hasCommercialRate = false;
  bool get hasCommercialRate => _hasCommercialRate;

  bool _hasBcnOfficialRate = false;
  bool get hasBcnOfficialRate => _hasBcnOfficialRate;

  FxRateResolutionFailure? _commercialRateFailure;
  FxRateResolutionFailure? get commercialRateFailure => _commercialRateFailure;

  FxRateResolutionFailure? _bcnRateFailure;
  FxRateResolutionFailure? get bcnOfficialRateFailure => _bcnRateFailure;

  String _checkoutFxMode = 'COMMERCIAL';
  String get checkoutFxMode => _checkoutFxMode;

  double get activeCheckoutRate =>
      _checkoutFxMode == 'BCN_OFFICIAL' ? _bcnOfficialRate : _commercialRate;

  String get activeCheckoutRateLabel {
    if (_checkoutFxMode == 'BCN_OFFICIAL') {
      return _hasBcnOfficialRate
          ? 'TC BCN: ${_bcnOfficialRate.toStringAsFixed(4)}'
          : 'TC BCN: no configurada';
    }
    return _hasCommercialRate
        ? 'TC Comercial: ${_commercialRate.toStringAsFixed(2)}'
        : 'TC Comercial: no configurada';
  }

  Future<void> loadExchangeRates() async {
    // #67/T2a: each rate is resolved independently; any absent, corrupt,
    // non-positive or unreadable value leaves that rate UNKNOWN (0.0) with
    // the failure reason recorded. There is no default FX rate anymore.
    Future<void> resolveRate(
      String key,
      void Function(double value) onValid,
      void Function(FxRateResolutionFailure failure) onUnknown,
    ) async {
      try {
        final row = await _database.localConfigDao.getConfigByKey(key);
        if (row == null) {
          onUnknown(FxRateResolutionFailure.absent);
          return;
        }
        final parsed = double.tryParse(row.value);
        if (parsed == null) {
          onUnknown(FxRateResolutionFailure.unparseable);
          return;
        }
        if (parsed <= 0) {
          onUnknown(FxRateResolutionFailure.nonPositive);
          return;
        }
        onValid(parsed);
      } catch (_) {
        onUnknown(FxRateResolutionFailure.readError);
      }
    }

    await resolveRate(
      'commercial_exchange_rate',
      (value) {
        _commercialRate = value;
        _hasCommercialRate = true;
        _commercialRateFailure = null;
      },
      (failure) {
        _commercialRate = 0.0;
        _hasCommercialRate = false;
        _commercialRateFailure = failure;
      },
    );
    await resolveRate(
      'bcn_official_exchange_rate',
      (value) {
        _bcnOfficialRate = value;
        _hasBcnOfficialRate = true;
        _bcnRateFailure = null;
      },
      (failure) {
        _bcnOfficialRate = 0.0;
        _hasBcnOfficialRate = false;
        _bcnRateFailure = failure;
      },
    );
    try {
      final modeVal = await _database.localConfigDao.getConfigByKey(
        'checkout_fx_mode',
      );
      if (modeVal != null && modeVal.value.isNotEmpty) {
        _checkoutFxMode = modeVal.value;
      }
    } catch (_) {
      // Non-blocking: the mode default keeps the last known value.
    }
    notifyListeners();
  }

  static const _msgCommercialRateAbsent =
      'No se puede vender: la tasa de cambio comercial no está configurada en este terminal. Pedile al dueño o a un encargado que la configure en Perfil del Negocio.';
  static const _msgCommercialRateUnverifiable =
      'No se puede vender: la tasa de cambio comercial no pudo verificarse en este terminal. Pedile al dueño o a un encargado que la revise en Perfil del Negocio.';
  static const _msgBcnRateAbsent =
      'No se puede vender: la tasa oficial BCN no está configurada en este terminal. Pedile al dueño o a un encargado que la configure en Perfil del Negocio.';
  static const _msgBcnRateUnverifiable =
      'No se puede vender: la tasa oficial BCN no pudo verificarse en este terminal. Pedile al dueño o a un encargado que la revise en Perfil del Negocio.';

  /// #67/T2a: the directive Spanish reason the sale is blocked when either
  /// recorded rate is unreliable (both are persisted AND printed on every
  /// invoice), or null when the checkout may proceed. The message names who
  /// can fix it: the FX fields are owner/manager-only since #66, so it must
  /// point at the owner or a manager in Perfil del Negocio, never at an
  /// action the cashier could perform.
  String? _fxRateBlockReason() {
    if (!_hasCommercialRate) {
      return _commercialRateFailure == FxRateResolutionFailure.absent
          ? _msgCommercialRateAbsent
          : _msgCommercialRateUnverifiable;
    }
    if (!_hasBcnOfficialRate) {
      return _bcnRateFailure == FxRateResolutionFailure.absent
          ? _msgBcnRateAbsent
          : _msgBcnRateUnverifiable;
    }
    return null;
  }

  /// Non-consuming read of the directive block reason for the persistent
  /// cart-panel banner. Unlike [gateCheckoutOnFxRates] it must NEVER write
  /// [_errorMessage] or clear anything: the banner has to stay visible
  /// while the operator keeps working, and the transient SnackBar channel
  /// stays reserved for the other error paths.
  String? get fxCheckoutBlockReason => _fxRateBlockReason();

  /// R-4: the last GENERAL checkout failure (missing recipe, fiscal sequence
  /// error, database exception, ...) recorded by [processSale]. Distinct from
  /// the FX guard state above: the FX reason is authoritative while it exists
  /// (non-dismissible), while a general checkout error stays in the banner
  /// until the operator discards it or the cart/sale state moves on.
  String? _lastCheckoutError;

  /// Non-consuming read for the persistent cart-panel banner: the FX block
  /// reason wins when present, otherwise the last general checkout error.
  String? get checkoutBlockReason => fxCheckoutBlockReason ?? _lastCheckoutError;

  /// Dismisses the general checkout error banner (the 'Descartar' action).
  /// Never touches the FX guard state: a missing-rate block stays on screen.
  void clearCheckoutError() {
    if (_lastCheckoutError != null) {
      _lastCheckoutError = null;
      notifyListeners();
    }
  }

  /// Checkout seam: called by the view right after loadExchangeRates() and
  /// BEFORE the checkout dialog opens, so the operator learns about the
  /// missing rate before ringing up the whole sale, not after COBRAR.
  /// Surfaces the reason through the standard error path and returns it
  /// (null when the checkout may proceed).
  String? gateCheckoutOnFxRates() {
    final reason = _fxRateBlockReason();
    if (reason != null) {
      _errorMessage = reason;
      notifyListeners();
    }
    return reason;
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

  // T7 (open-accounts slice): the in-memory `_sessionExpected` counter was
  // retired with CloseBoxDialog. It reset on every checkActiveSession and
  // ignored movements/USD, so the drawer expectation it fed was weaker than
  // the Corte Z figure (CashShiftViewModel.effectiveExpectedNio/Usd), which
  // re-queries the DB at close time.

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

  /// D-15: the void gate is permission-based (SalesPermission resolver),
  /// never a role-label check. Owner/manager hold sales.void.any, cashier
  /// holds sales.void.own_current_shift, waiter holds nothing. The actual
  /// three-predicate evaluation happens in [voidInvoice].
  bool get canVoidInvoice =>
      resolveSalesPermissions(_currentUserRole).isNotEmpty;

  /// D-13: reprint capability (owner/manager/cashier; never waiter).
  bool get canReprint => hasSalesPermission(
      _currentUserRole, SalesPermission.reprintDocument);

  /// H5: the credit-note affordance is visible only to the roles that can
  /// actually issue one (manager/owner — the same gate [processReturn]
  /// enforces inside the view model as defense-in-depth). Cashier/waiter
  /// never see the control, so a denied tap cannot be part of the flow.
  bool get canIssueCreditNote =>
      (_currentUserRole == UserRole.owner ||
          _currentUserRole == UserRole.manager) &&
      isCreditNoteAvailableForRegime;

  /// Owner decision 2026-10-10: the credit note is **regime-conditional**.
  ///
  /// DT 09-2007 TERCERO 3.4 requires a credit note for a return on a day
  /// after the invoice — but the disposición governs computerized invoicing
  /// and its 1.9 frames the IVA break-out of the General regime; whether it
  /// binds a CUOTA_FIJA business that does not collect IVA stayed an open
  /// legal question (#535 Q4c). A CUOTA_FIJA business cancels the ticket
  /// inside the shift (the void path, already same-day only) and records an
  /// out-of-date administrative refund as a petty-cash expense, which never
  /// touches a closed fiscal document.
  ///
  /// Fails closed: an unresolved regime is NOT a licence to issue.
  bool get isCreditNoteAvailableForRegime =>
      _companyTaxRegime?.isRegimenGeneral ?? false;

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

    // SOHO-P3 S1b — DD-2: the supervisor override does NOT bypass the cap.
    // The override authorizes WHO may discount; the cap is the owner's
    // policy on HOW MUCH. If the owner wants a higher limit for supervisors,
    // the owner raises the cap — so this gate runs for every role, after the
    // authorization gate above.
    //
    // SOHO-P3 S1b — DD-3: the cap is evaluated against the RESULTING
    // ACCUMULATED manual discount (`_manualDiscount + requestedAmount`), not
    // against each request in isolation, so two successive requests under
    // the cap cannot together exceed it. The percent base is the order's
    // GROSS subtotal from the fiscal calculation (grossSubtotal), which does
    // not depend on discounts, so there is no circular dependency.
    final decision = const DiscountPolicyService().evaluateManualDiscount(
      requestedAmount: discountAmount,
      accumulatedManualDiscount: _manualDiscount,
      grossSubtotal: grossSubtotal,
      maxDiscountAmount: _maxDiscountAmountCap,
      maxDiscountPercent: _maxDiscountPercentCap,
    );
    if (!decision.allowed) {
      // Rejection mutates NO state: the accumulated discount and any prior
      // state stay untouched; the operator learns the effective limit and
      // which cap bound it through the standard error channel.
      _errorMessage = decision.rejectionMessage;
      notifyListeners();
      return;
    }

    _manualDiscount += discountAmount;
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> _loadCurrentUserRole() async {
    final user = await _authRepository.getCurrentUser();
    _currentUserRole = user?.role;
    notifyListeners();
  }

  static const _fiscalCalculator = InvoiceFiscalCalculator();

  FiscalCalculationResult get currentFiscalCalculation {
    // #67/T2a: an unknown rate must not fabricate a USD figure, but the NIO
    // figures (tax included) never depend on a rate, so the preview keeps
    // them exact and withholds only totalUsd. The missing-REGIME case still
    // degrades to the zero-tax baseline below.
    final ratesUsable = _hasCommercialRate && _hasBcnOfficialRate;
    try {
      return _fiscalCalculator.calculate(
        cart: _cart,
        taxRegime: _companyTaxRegime,
        isGlobalTaxExempt: _isGlobalTaxExempt,
        totalDiscounts: totalDiscounts,
        // T2b/#67: the fiscal snapshot must carry the conversion actually
        // APPLIED at checkout. In BCN_OFFICIAL mode that is the BCN rate, so
        // invoice.commercialRate and totalUsd follow the charged conversion;
        // the office configuration itself lives in local_configs / the
        // business-profile mirror, and bcnOfficialRate keeps the BCN snapshot.
        commercialRate: activeCheckoutRate,
        bcnOfficialRate: _bcnOfficialRate,
        requireFiscalRates: ratesUsable,
      );
    } on FiscalConfigurationException {
      // Cart browsing must remain usable before the business configures
      // its DGI regime. Finalization still fails closed in processSale.
      final grossSubtotal = _cart.fold<double>(
        0.0,
        (sum, item) => sum + item.grossAmount,
      );
      final totalDiscount = totalDiscounts.clamp(0.0, grossSubtotal);
      final lines = _cart
          .map((item) {
            final proportion = grossSubtotal > 0
                ? item.grossAmount / grossSubtotal
                : 0.0;
            final discount = totalDiscount * proportion;
            final lineSubtotal = item.grossAmount - discount;
            return FiscalLineCalculation(
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              modifiersTotal: item.modifiersTotal,
              grossAmount: item.grossAmount,
              discount: discount,
              taxableBase: 0.0,
              nominalTaxRate: item.taxRate,
              appliedTaxRate: 0.0,
              taxAmount: 0.0,
              lineSubtotal: lineSubtotal,
              lineTotal: lineSubtotal,
            );
          })
          .toList(growable: false);
      final subtotal = grossSubtotal - totalDiscount;
      return FiscalCalculationResult(
        taxRegime: null,
        lines: lines,
        grossSubtotal: grossSubtotal,
        totalDiscount: totalDiscount,
        subtotal: subtotal,
        taxableSubtotal: 0.0,
        exemptSubtotal: subtotal,
        totalTax: 0.0,
        total: subtotal,
        commercialRate: activeCheckoutRate,
        bcnOfficialRate: _bcnOfficialRate,
        totalUsd: activeCheckoutRate > 0 ? subtotal / activeCheckoutRate : 0.0,
      );
    }
  }

  double get subtotal => currentFiscalCalculation.subtotal;
  double get grossSubtotal => currentFiscalCalculation.grossSubtotal;
  double get totalTax => currentFiscalCalculation.totalTax;
  double get total => currentFiscalCalculation.total;
  double get taxableSubtotal => currentFiscalCalculation.taxableSubtotal;
  double get exemptSubtotal => currentFiscalCalculation.exemptSubtotal;

  double getCartItemLineAmount(CartItem item) {
    return item.grossAmount;
  }

  // SOHO-P3: manual and promotion discounts are INDEPENDENT accumulators.
  // One shared accumulator let `_applyPromotions()` erase a manual discount
  // (and vice versa) on every cart mutation. `totalDiscounts` stays the
  // fiscal aggregate the calculator, mapper, receipt and sync already
  // consume: promo + manual + loyalty.
  double _promotionDiscount = 0.0;
  /// SOHO P3: per-product promotion amounts from the LAST engine evaluation
  /// for THIS cart (PromotionsEngineResult.itemDiscounts). The origin
  /// allocator consumes it at checkout so promotion weight lands on the
  /// lines of the product that earned it. A discarded value here would make
  /// every promotion distribute by line gross alone; a RETAINED value would
  /// leak one cart's weights into the next — same defect class S1a fixed:
  /// a value that belongs to ONE cart must not survive into the next
  /// (cleared in [clearCart]).
  Map<String, double> _promotionItemDiscounts = const {};
  double _manualDiscount = 0.0;
  double get totalDiscounts =>
      _promotionDiscount + _manualDiscount + loyaltyDiscount;
  double get manualDiscount => _manualDiscount;

  /// SOHO P3: converts the checkout fiscal snapshot's per-line discounts into
  /// the wire per-line breakdown ({promotion?, manual?, loyalty?}, positive
  /// amounts only) for the persisted [InvoiceItem] rows.
  ///
  /// Computed ONCE per checkout from THIS snapshot ([calc]) plus the cart's
  /// retained origin totals; index-matched to the cart exactly like
  /// `calc.lines`. Empty allocations become NULL — null means legacy/unknown
  /// and is never fabricated as an empty map.
  List<Map<String, double>?> _buildDiscountOriginBreakdowns(
    FiscalCalculationResult calc,
  ) {
    final allocation = allocateDiscountOrigins(
      lineGrosses: [for (final line in calc.lines) line.grossAmount],
      lineDiscounts: [for (final line in calc.lines) line.discount],
      lineProductIds: [for (final line in calc.lines) line.productId],
      promotionDiscount: _promotionDiscount,
      manualDiscount: _manualDiscount,
      loyaltyDiscount: loyaltyDiscount,
      promotionItemDiscounts: _promotionItemDiscounts,
    );
    return [
      for (final lineAllocation in allocation)
        _discountOriginToWire(lineAllocation),
    ];
  }

  /// Converts one line's allocator output into the wire map. Keys are
  /// iterated in [DiscountOrigin.values] order so the serialized order is
  /// always promotion, manual, loyalty regardless of the allocator's
  /// internal map order; an empty allocation maps to null.
  Map<String, double>? _discountOriginToWire(
    Map<DiscountOrigin, double> allocation,
  ) {
    if (allocation.isEmpty) return null;
    return {
      for (final origin in DiscountOrigin.values)
        if (allocation.containsKey(origin)) origin.wire: allocation[origin]!,
    };
  }

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
    // T2b/#67: the tip USD snapshot converts at the rate actually applied
    // at checkout (the BCN rate in BCN_OFFICIAL mode), matching the
    // invoice's own conversion.
    commercialRate: activeCheckoutRate,
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

  /// SOHO P3 S2 (defect 1): the open checkout must re-evaluate promotions
  /// when a delta delivers rows. We use the precise `promotionsCount`
  /// signal instead of reloading on every inbound sync:
  /// [InboundSyncResult] already carries per-delta counts and the
  /// promotions delta populates it at the source, so a promotions-only
  /// delta is the only thing that pays for this reload (one local SQLite
  /// read plus a re-evaluation). The cloud is authoritative: without this
  /// reload, a promotion created or changed in the owner dashboard stayed
  /// invisible until the view model was rebuilt.
  void _reloadPromotionsOnInboundSync(InboundSyncResult event) {
    if (event.promotionsCount > 0) {
      loadPromotions();
    }
  }

  // SOHO P3 S2 (defect 2): `togglePromotion` was removed. The cloud is
  // authoritative for promotions — a local-only write here was silently
  // reverted by the next cloud delta, offering the operator a write control
  // that never stuck. Activation/deactivation happens ONLY in the business
  // panel (web); the POS renders promotion state read-only.

  void _applyPromotions() {
    final result = _promotionsEngine.evaluate(
      cart: _cart,
      promotions: _promotions,
    );
    _promotionDiscount = result.totalDiscount;
    _promotionItemDiscounts = result.itemDiscounts;
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

  /// Accent-fold table for text search. It is the EXACT mirror of the admin
  /// backend's `normalizeSearchTerm` / `translate(lower(col), …)` character
  /// table (apps/admin_backend/src/modules/inventory/product.service.ts,
  /// ACCENT_SEARCH_FROM / ACCENT_SEARCH_TO): the two apps must agree on what
  /// a search matches, so any change to one table MUST change both.
  static const String _accentSearchFrom = 'áàäâãéèëêíìïîóòöôõúùüûñç';
  static const String _accentSearchTo = 'aaaaaeeeeiiiiooooouuuunc';

  /// Lowercases [term] and folds the accented characters in
  /// [_accentSearchFrom] to their ASCII counterparts, so an operator typing
  /// 'cafe' finds «Café de Olla» exactly like the backend search does.
  static String _foldSearchTerm(String term) {
    final lowered = term.toLowerCase();
    final buffer = StringBuffer();
    for (final rune in lowered.runes) {
      final ch = String.fromCharCode(rune);
      final index = _accentSearchFrom.indexOf(ch);
      buffer.write(index >= 0 ? _accentSearchTo[index] : ch);
    }
    return buffer.toString();
  }

  /// Null-safe folded contains. skus and barcodes are folded too: they are
  /// usually ASCII (so folding is a no-op for them) and folding every side
  /// keeps ONE contains predicate instead of diverging match semantics per
  /// field — an accented character in a sku still matches its ASCII typing.
  static bool _foldContains(String? source, String foldedQuery) =>
      source != null && _foldSearchTerm(source).contains(foldedQuery);

  List<Product> get filteredProducts {
    if (_searchQuery.isEmpty) return _products;
    final q = _foldSearchTerm(_searchQuery);
    return _products
        .where(
          (p) =>
              _foldContains(p.name, q) ||
              _foldContains(p.sku, q) ||
              _foldContains(p.barcode, q),
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
      // F1 (open accounts fix): a recalled account's cart is its COMPLETE
      // state, so re-parking REPLACES the stored contents (and applies the
      // typed name). The old appendItemsToOrder call here doubled the
      // balance on every recover+save cycle and discarded the name.
      await _tableOrderService.replaceOrderItems(
        ticketId: _activeLoadedHoldTicket!.id,
        name: name,
        items: List.from(_cart),
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

  /// F4 (open accounts fix): discard a parked account the operator decided
  /// never to invoice. A hold ticket is pre-invoice local SQLite state — it
  /// never emitted a DGI document, so discarding it is not a fiscal deletion
  /// and needs no cancellation record. Parking never dispatches a kitchen
  /// comanda either, so nothing can be orphaned.
  ///
  /// Reuses the existing safe deletion path (`liquidateOrder` →
  /// `deleteHoldTicketWithItems`), which also releases the occupied table.
  Future<void> abandonHoldTicket(HoldTicket ticket) async {
    await _tableOrderService.liquidateOrder(ticket.id);

    if (_activeLoadedHoldTicket?.id == ticket.id) {
      _activeLoadedHoldTicket = null;
      clearCart();
    }

    await loadHoldTickets();
  }

  Future<void> checkActiveSession() async {
    await loadCompanyTaxRegime();
    // Issue #552: the open-session lookup is scoped to BOTH the acting user
    // and the terminal — the same two values openSession/checkout stamp.
    // The topology-blind getActiveSession() would bind a cashier to another
    // cashier's concurrent shift. No logged-in user means no user+terminal
    // session can match.
    final user = await _authRepository.getCurrentUser();
    final effectiveTerminalId =
        _terminalId.trim().isNotEmpty ? _terminalId.trim() : 'TERM-01';
    final sessionEntity = user == null
        ? null
        : await _database.cashierSessionDao
            .getActiveSessionForUserAndTerminal(user.id, effectiveTerminalId);
    if (sessionEntity != null) {
      _activeSession = SalesMapper.toSessionDomain(sessionEntity);
    } else {
      _activeSession = null;
    }
    notifyListeners();
  }

  Future<void> openSession(
    double balance, {
    // D-21: the box-opening screen collects the initial float in BOTH
    // currencies, mirroring CashShiftViewModel.openShift. Optional with a
    // 0.0 default so existing callers and tests compile unchanged.
    double balanceUsd = 0.0,
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
      // D-15 (JD-A-002): the session MUST carry the same terminal the sale
      // path stamps on invoices — otherwise
      // getActiveSessionForUserAndTerminal never matches and every cashier
      // void degrades to deniedShiftUnknown. Mirrors the effectiveTerminalId
      // resolution below (and CashShiftViewModel's opener).
      terminalId: _terminalId.trim().isNotEmpty ? _terminalId.trim() : 'TERM-01',
      openedAt: DateTime.now(),
      tipoModelo: tipoModelo,
      openingBalance: balance,
      openingBalanceNio: balance,
      openingBalanceUsd: balanceUsd,
      expectedNio: balance,
      // D-21: same semantics as CashShiftViewModel.openShift — the shift's
      // base expectedUsd is the opening USD float; the close flow adds the
      // USD cash sales on top via effectiveExpectedUsd.
      expectedUsd: balanceUsd,
      totalExpected: balance,
    );
    await _database.cashierSessionDao.insertSession(
      SalesMapper.toSessionEntity(session),
    );
    _activeSession = session;
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
        } catch (e, st) {
          // Re-audit (observability): unknown variant falls back to the
          // base product price/name so the sale keeps flowing; the pricing
          // drift must be observable.
          developer.log(
            'Variant $variantId not found on product ${product.id}; '
            'falling back to base price/name.',
            name: 'SaleViewModel',
            level: 900, // WARNING
            error: e,
            stackTrace: st,
          );
        }
      }

      final itemTaxRate = product.effectiveTaxRate;
      _cart.add(
        CartItem(
          productId: product.id,
          productName: productName,
          quantity: quantity,
          unitPrice: unitPrice,
          taxRate: itemTaxRate,
          category: product.category,
          categoryId: product.categoryId,
          variantId: variantId,
          selectedModifiers: modifiers,
        ),
      );
    }
    _applyPromotions();
    // R-4: a cart change supersedes a stale checkout failure banner.
    _lastCheckoutError = null;
    // Re-evaluate loyalty when cart changes (fire-and-forget async)
    if (_selectedCustomer != null &&
        _rewardInteraction?.selectedRewardId != null) {
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
    // R-4: a cart change supersedes a stale checkout failure banner.
    _lastCheckoutError = null;
    _clearCustomerWhenCartEmptied();
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
      // R-4: a cart change supersedes a stale checkout failure banner.
      _lastCheckoutError = null;
      _clearCustomerWhenCartEmptied();
      notifyListeners();
    }
  }

  /// Round-2 D-2: `clearCart()` covers the explicit paths; this covers the
  /// operator emptying the cart item by item, which never calls it (the
  /// reported field defect: the customer stayed selected for the next sale).
  void _clearCustomerWhenCartEmptied() {
    if (_cart.isEmpty) clearCustomer();
  }

  void toggleGlobalTaxExempt() {
    _isGlobalTaxExempt = !_isGlobalTaxExempt;
    notifyListeners();
  }

  void clearCart() {
    _cart.clear();
    // Round-2 D-2: the selected customer — and every loyalty fact derived
    // from them (evaluation, points to redeem, selected reward) — belongs to
    // ONE cart. clearCart runs after every successful checkout and on every
    // explicit discard, so a retained customer would award points or redeem
    // a reward for somebody who already left the counter.
    clearCustomer();
    _isGlobalTaxExempt = false;
    _promotionDiscount = 0.0;
    // D-7/S1a-class hygiene: the per-product promotion weights belong to ONE
    // cart. clearCart runs after every successful checkout, so a retained
    // map would smuggle the previous cart's promotion provenance into the
    // next sale.
    _promotionItemDiscounts = const {};
    _manualDiscount = 0.0;
    _pointsToRedeem = 0.0;
    _activeLoadedHoldTicket = null;
    _lastPostPaidFeedback = null;
    _lastCheckoutError = null;
    _currentEvaluation = null;
    clearReward();
    // D-7: a voluntary tip belongs to ONE ticket only. It must never leak
    // into the next sale (clearCart runs after every successful checkout).
    _tipType = TipType.none;
    _customTipPercentage = 0.0;
    _fixedTipAmount = 0.0;
    notifyListeners();
  }

  Future<void> finalizeSale(List<PaymentMethod> methods) =>
      processSale(methods);

  /// True while a sale attempt is in flight. UI layers must consult it so a
  /// single interaction can never launch two sale attempts (go-live fix:
  /// the operator may retry, but never silently or concurrently).
  bool _isProcessingSale = false;
  bool get isProcessingSale => _isProcessingSale;

  /// Marker text from the data layer's prepared-product guard
  /// (sales_repository_impl). Matched by content: the repository stays a
  /// plain StateError and this view-model boundary is the only place the
  /// operator-facing translation happens.
  static const String _missingRecipeErrorMarker =
      'cannot be sold without a published active recipe version';

  static final RegExp _preparedProductIdPattern = RegExp(
    r'Prepared product (\S+)',
  );

  /// Resolves the failing product's NAME from the cart when [error] is the
  /// data layer's missing-recipe denial. Returns null when the error is not
  /// that denial or the product can no longer be identified. The raw id is
  /// extracted only to look the name up — it never reaches user-facing copy.
  String? _missingRecipeProductNameFromCart(Object error) {
    final text = error.toString();
    if (!text.contains(_missingRecipeErrorMarker)) return null;
    final match = _preparedProductIdPattern.firstMatch(text);
    if (match == null) return null;
    final productId = match.group(1);
    for (final item in _cart) {
      if (item.productId == productId) return item.productName;
    }
    return null;
  }

  Future<void> processSale(
    List<PaymentMethod> methods, {
    List<Payment>? customPayments,
    String? buzzerNumber,
    String? customerName,

    /// The customer tax id to stamp on the invoice snapshot. Tri-state at
    /// the checkout boundary (odd/factura-con-nombre, post-review ITEM 3):
    ///  - `null`  → not supplied: legacy prefill from the selected customer
    ///    (a freshly opened dialog must not force the operator to retype).
    ///  - empty/whitespace → EXPLICITLY CLEARED by the operator: the invoice
    ///    snapshot carries NO tax id, never the catalog value — the snapshot
    ///    records what was printed, not the catalog.
    ///  - non-empty → used verbatim (trimmed, uppercased).
    String? customerTaxId,
  }) async {
    if (_isProcessingSale) {
      throw StateError('A sale attempt is already in progress');
    }
    _isProcessingSale = true;
    try {
      await _processSaleInternal(
        methods,
        customPayments: customPayments,
        buzzerNumber: buzzerNumber,
        customerName: customerName,
        customerTaxId: customerTaxId,
      );
    } finally {
      _isProcessingSale = false;
    }
  }

  /// Issue #785 (legacy-path parity): single kitchen KDS dispatch point for
  /// the checkout commit path. Called from BOTH the direct-sale branch and
  /// the hold-ticket branch so the two paths cannot drift. Fire-and-forget
  /// semantics are identical to the original direct-sale dispatch: an
  /// offline/missing kitchen backend never blocks a committed fiscal
  /// invoice (offline-first).
  Future<void> _dispatchCartToKitchen({
    required String invoiceId,
    required String invoiceNumber,
    required String? effectiveBuzzer,
    required String? effectiveCustomerName,
    required String waiterName,
  }) async {
    if (_cart.isEmpty) return;
    try {
      await _kitchenOrderService.sendDirectSaleToKitchen(
        invoiceId: invoiceId,
        invoiceNumber: invoiceNumber,
        items: List.from(_cart),
        buzzerNumber: effectiveBuzzer,
        customerName: effectiveCustomerName,
        waiterName: waiterName,
      );
    } catch (_) {
      // Graceful fallback for offline tests/setups
    }
  }

  Future<void> _processSaleInternal(
    List<PaymentMethod> methods, {
    List<Payment>? customPayments,
    String? buzzerNumber,
    String? customerName,
    String? customerTaxId,
  }) async {
    final user = await _authRepository.getCurrentUser();
    if (user == null) {
      _errorMessage = 'Usuario no autenticado';
      notifyListeners();
      throw StateError('Usuario no autenticado');
    }

    // #67/T2a: fail closed BEFORE any DGI sequence number is consumed — the
    // guard runs ahead of the repository/numbering path, so a blocked sale
    // never touches the consecutivo. Both rates are validated because every
    // invoice persists AND prints both.
    // A never-resolved state (no rate ever loaded on this terminal) is not a
    // verdict: resolve once, then judge. A genuine absent/corrupt/read
    // failure still blocks with its own message.
    if (!_hasCommercialRate &&
        !_hasBcnOfficialRate &&
        _commercialRateFailure == null &&
        _bcnRateFailure == null) {
      await loadExchangeRates();
    }
    final fxBlockReason = _fxRateBlockReason();
    if (fxBlockReason != null) {
      _errorMessage = fxBlockReason;
      notifyListeners();
      throw FiscalExchangeRateUnconfiguredError(fxBlockReason);
    }

    if (_companyTaxRegime == null) {
      await loadCompanyTaxRegime();
    }
    if (_companyTaxRegime == null) {
      _errorMessage =
          'Empresa sin régimen fiscal DGI configurado. Configure la Información de Empresa en Configuración antes de facturar.';
      notifyListeners();
      throw const FiscalConfigurationException(
        'Empresa sin régimen fiscal DGI configurado. Debe seleccionar Cuota Fija o Régimen General en Información de Empresa.',
      );
    }

    final invoiceId = const Uuid().v4();
    // D-7: the money actually collected must equal what the operator
    // confirmed — fiscal total + voluntary tip. The tip stays OUT of the
    // taxable total below (DGI INV-16.1); it is charged ON TOP of it.
    final grandTotalNio = grandTotalWithTip;
    // T2b/#67: same applied-rate convention as the fiscal snapshot — the
    // BCN rate in BCN_OFFICIAL mode, the commercial rate otherwise.
    final totalUsd = activeCheckoutRate > 0
        ? ((total / activeCheckoutRate) * 100).round() / 100
        : 0.0;

    final effectiveBuzzer =
        (buzzerNumber != null && buzzerNumber.trim().isNotEmpty)
        ? buzzerNumber.trim()
        : _buzzerNumber;
    final effectiveCustomerName =
        (customerName != null && customerName.trim().isNotEmpty)
        ? customerName.trim()
        : _customerName;
    // odd/factura-con-nombre (post-review ITEM 3): distinguish "not
    // supplied" from "explicitly cleared" at the checkout boundary.
    //  - null → not supplied: prefill from the selected customer (legacy
    //    contract; the freshly opened dialog must not force a retype).
    //  - empty/whitespace → the operator ERASED the RUC/Cédula field: the
    //    snapshot carries NO tax id — never the catalog value.
    //  - non-empty → used verbatim.
    final String? effectiveCustomerTaxId;
    if (customerTaxId == null) {
      effectiveCustomerTaxId =
          ((_selectedCustomer?.taxId != null && _selectedCustomer!.taxId!.trim().isNotEmpty)
              ? _selectedCustomer!.taxId!.trim().toUpperCase()
              : _customerTaxId);
    } else {
      effectiveCustomerTaxId =
          customerTaxId.trim().isNotEmpty ? customerTaxId.trim().toUpperCase() : null;
    }

    final calc = currentFiscalCalculation;
    // SOHO P3: split the AUTHORITATIVE per-line discount back into the
    // origin amounts that produced it, ONCE, from this exact fiscal
    // snapshot. The breakdown must reach the persisted InvoiceItem (the
    // outbound payload is rebuilt from LOCAL rows at upload time), not only
    // an in-memory payload map.
    final discountOriginBreakdowns = _buildDiscountOriginBreakdowns(calc);
    // Batch 7 Slice 2 (PRD §21 / §33.4 / AD-10): the tip snapshot is fixed
    // at checkout — NIO amount, USD conversion, effective percentage and
    // the eligible base — and never recomputed afterwards. A tip of 0 (or
    // no tip selected) persists as null, never as a fabricated snapshot.
    final tip = tipCalculation;
    final hasTip = tip.tipAmountNio > 0;
    final items = <InvoiceItem>[];
    for (var i = 0; i < _cart.length; i++) {
      final cartItem = _cart[i];
      final l = calc.lines[i];
      items.add(
        InvoiceItem(
          id: const Uuid().v4(),
          invoiceId: invoiceId,
          productId: l.productId,
          productName: l.productName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          originalTaxRate: l.nominalTaxRate,
          appliedTaxRate: l.appliedTaxRate,
          taxAmount: l.taxAmount,
          total: l.lineTotal,
          discount: l.discount,
          variantId: cartItem.variantId,
          notes: cartItem.notes,
          selectedModifiers: cartItem.selectedModifiers,
          discountOrigin: discountOriginBreakdowns[i],
        ),
      );
    }

    final invoice = Invoice(
      id: invoiceId,
      number: 'PENDING',
      createdAt: DateTime.now(),
      userId: user.id,
      customerId: _selectedCustomer?.id,
      customerName: (effectiveCustomerName != null && effectiveCustomerName.trim().isNotEmpty)
          ? effectiveCustomerName.trim()
          : null,
      customerTaxId: (effectiveCustomerTaxId != null && effectiveCustomerTaxId.trim().isNotEmpty)
          ? effectiveCustomerTaxId.trim()
          : null,
      subtotal: calc.subtotal,
      totalTax: calc.totalTax,
      total: calc.total,
      globalTaxOverride: _isGlobalTaxExempt,
      bcnOfficialRate: calc.bcnOfficialRate,
      commercialRate: calc.commercialRate,
      totalUsd: calc.totalUsd,
      terminalId: _terminalId,
      tipAmountNio: hasTip ? tip.tipAmountNio : null,
      tipAmountUsd: hasTip ? tip.tipAmountUsd : null,
      tipPercentage: hasTip ? tip.effectivePercentage : null,
      tipEligibleBaseNio: hasTip ? tip.subtotalNio : null,
    );

    final payments = customPayments != null && customPayments.isNotEmpty
        ? customPayments
              .map(
                (p) => p.copyWith(
                  invoiceId: invoiceId,
                  id: p.id.isEmpty ? const Uuid().v4() : p.id,
                ),
              )
              .toList()
        : methods
              .map(
                (m) => Payment(
                  id: const Uuid().v4(),
                  invoiceId: invoiceId,
                  method: m,
                  amount: grandTotalNio / methods.length,
                  currency: 'NIO',
                  // T2b/#67: the payment records the conversion actually
                  // applied at checkout, not the office's configured
                  // commercial rate (they differ in BCN_OFFICIAL mode).
                  exchangeRate: activeCheckoutRate,
                  amountNio: grandTotalNio / methods.length,
                  changeGiven: 0.0,
                  changeCurrency: 'NIO',
                ),
              )
              .toList();

    final effectiveTerminalId = _terminalId.trim().isNotEmpty
        ? _terminalId.trim()
        : 'TERM-01';

    try {
      final prepService = CheckoutInventoryPreparationService(_database);
      final prepResult = await prepService.prepare(
        invoice: invoice.copyWith(terminalId: effectiveTerminalId),
        items: items,
        offlineUserId: user.id,
        tenantId: user.tenantId ?? '',
        terminalId: effectiveTerminalId,
      );

      await _salesRepository.saveSale(
        invoice: prepResult.invoice,
        items: prepResult.items,
        payments: payments,
      );

      // Fire-and-forget: trigger cloud sync after 3s debounce
      // (batches rapid consecutive sales into one sync pass)
      if (_syncService != null) {
        _syncDebounceTimer?.cancel();
        _syncDebounceTimer = Timer(const Duration(seconds: 3), () {
          _syncService?.triggerManualSync();
        });
      }

      // Loyalty ops of THIS sale begin here: reset the diagnostic error
      // BEFORE any redeem/earn attempt so lastLoyaltyError — and the
      // post-sale warning armed from it — reflects ONLY this sale's
      // failures. A historical loyalty failure must never re-arm the
      // warning on a later successful sale, including sales with no
      // loyalty activity. The reset sits AFTER saveSale, so a rejected
      // sale never masks a prior error. Cart-phase re-evaluation errors
      // (H9) remain readable via lastLoyaltyError but intentionally do
      // not arm the post-sale warning: preview staleness, not unposted
      // points.
      _lastCheckoutError = null;
      _lastLoyaltyError = null;

      // Process Customer Loyalty (single write path via LoyaltyRewardInteractionService)
      if (_selectedCustomer != null) {
        final now = DateTime.now().millisecondsSinceEpoch;

        // 1. Process REDEEM from the selected reward or legacy points flow.
        final redeemUnits =
            (_rewardInteraction?.selectedRewardId != null &&
                _selectedReward != null)
            ? _selectedReward!.costUnits.toDouble()
            : _pointsToRedeem;
        if (redeemUnits > 0) {
          final currentBalance = _selectedCustomer!.pointsBalance;
          final newBalance = currentBalance - redeemUnits;
          final redeemTx = _loyaltyService.createRedeemTransaction(
            customerId: _selectedCustomer!.id,
            currentBalance: currentBalance,
            pointsToRedeem: redeemUnits,
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
            _selectedCustomer = _selectedCustomer!.copyWith(
              pointsBalance: newBalance,
            );
          } catch (e) {
            // B1: redeem persistence failed. The sale must still complete
            // locally (offline-first), but the failure is now observable.
            _recordLoyaltyFailure('redeem', e);
          }
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
            _selectedCustomer = _selectedCustomer!.copyWith(
              pointsBalance: earnTx.balanceAfter,
            );
          } catch (e) {
            // B2: earn persistence failed. The sale must still complete
            // locally (offline-first), but the failure is now observable.
            _recordLoyaltyFailure('earn', e);
          }
        }

        // 3. Compute PostPaidFeedback using real LoyaltyEvaluation (not hardcoded)
        final redeemPts = redeemUnits.toInt();
        final earnedPts = pointsEarned.toInt();
        final newBalance = _selectedCustomer!.pointsBalance.toInt();
        final feedbackEvaluation =
            _currentEvaluation ??
            LoyaltyEvaluation(
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

      // T7 (open-accounts slice): the per-payment `_sessionExpected`
      // increment (and its carteraMesero non-cash skip) was retired with
      // the weak close path. The drawer expectation is the Corte Z figure:
      // CashShiftViewModel recomputes net cash per payment row from the DB
      // (getCashPaymentsForShift) at close time.

      // Issue #795/U2: the in-memory invoice still carries the 'PENDING'
      // placeholder at this point — the real DGI sequential number is
      // assigned inside the repository's saveSale fiscal transaction, which
      // has ALREADY committed above. Re-read the persisted invoice ONCE and
      // use its number for BOTH the kitchen dispatch and the printed ticket,
      // so the KDS shows 'Ticket 001-001-01-00000005', never 'Ticket
      // PENDING'. If the re-read fails (offline edge or unstubbed test mock)
      // we fall back to the in-memory invoice — offline-first: a committed
      // sale is never blocked by a relabel.
      Invoice? savedInvoice;
      try {
        savedInvoice = await _salesRepository.getInvoiceById(invoiceId);
      } catch (_) {
        // Non-blocking fallback for offline environments or unstubbed test mocks
      }
      final invoiceToProcess = savedInvoice ?? invoice;

      if (_activeLoadedHoldTicket != null) {
        // Issue #785 (legacy-path parity): a sale resumed from a hold ticket
        // must reach the kitchen exactly like a direct counter sale. Dispatch
        // BEFORE liquidation so the kitchen comanda exists even if the hold
        // liquidation fails.
        await _dispatchCartToKitchen(
          invoiceId: invoiceId,
          invoiceNumber: invoiceToProcess.number,
          effectiveBuzzer: effectiveBuzzer,
          effectiveCustomerName: effectiveCustomerName,
          waiterName: user.name,
        );
        await _tableOrderService.liquidateOrder(_activeLoadedHoldTicket!.id);
        _activeLoadedHoldTicket = null;
        // K1 (device verification): liquidateOrder deletes the SQLite row, but
        // _holdTickets is the list the recall dialog renders. Without this
        // refresh the billed account stays on screen as if it were still open,
        // and recalling it invites a second charge of an account that no
        // longer exists. The list must agree with the DB the moment the sale
        // commits.
        await loadHoldTickets();
      } else {
        // Direct counter sale: dispatch to kitchen KDS if items exist
        await _dispatchCartToKitchen(
          invoiceId: invoiceId,
          invoiceNumber: invoiceToProcess.number,
          effectiveBuzzer: effectiveBuzzer,
          effectiveCustomerName: effectiveCustomerName,
          waiterName: user.name,
        );
      }

      // Issue #795/U2: if any kitchen comanda for this invoice was already
      // created with the 'PENDING' placeholder label, retitle it to the
      // committed fiscal number. Buzzer/customer labels are preserved by the
      // service. Fire-and-forget: a KDS relabel failure never blocks a
      // committed fiscal invoice (offline-first).
      try {
        await _kitchenOrderService.updateTicketInvoiceNumber(
          ticketId: invoiceId,
          invoiceNumber: invoiceToProcess.number,
        );
      } catch (_) {
        // Non-blocking fallback: KDS relabel is best-effort.
      }

      // Auto-Printing & Hardware Drawer Kick (PRD Batch 7)
      final invoiceToPrint = invoiceToProcess;
      _lastProcessedInvoice = invoiceToPrint;
      _lastPrintError = null;

      try {
        final printerConfig = await _printerConfigService.getPrinterConfig();
        final hasCashPayment = payments.any(
          (p) => p.method == PaymentMethod.cash,
        );

        final activePrinterPort = _hasCustomPrinterPort
            ? _printerPort
            : PrinterResolver.resolve(printerConfig);

        if (printerConfig.openDrawerOnCash && hasCashPayment) {
          await activePrinterPort.openCashDrawer();
        }

        List<int>? logoRasterBytes;
        if (printerConfig.isLogoEnabled && printerConfig.logoBase64 != null) {
          try {
            final rawBytes = base64Decode(printerConfig.logoBase64!);
            if (ThermalLogoProcessor.isPng(rawBytes)) {
              logoRasterBytes = rawBytes;
            } else if (printerConfig.logoWidth != null &&
                printerConfig.logoHeight != null) {
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
            ruc: printerConfig.fiscalRuc,
            address: printerConfig.headerAddress,
            phone: printerConfig.headerPhone,
            cashierName: user.name,
            logoRasterBytes: logoRasterBytes,
            taxRegime: _companyTaxRegime!,
            isTaxExempt: _isGlobalTaxExempt,
            paperWidthMm: printerConfig.paperWidthMm,
            loyaltyFeedback: _lastPostPaidFeedback,
            fiscalAuthorizationNumber: printerConfig.dgiAuthorizationCode,
          );

          if (!printResult.isSuccess) {
            _lastPrintError =
                printResult.message ?? 'Error de impresión en hardware';
          }
        }

        if (printerConfig.autoPrintKitchen && items.isNotEmpty) {
          await activePrinterPort.printKitchenOrder(
            ticketId: invoiceToPrint.id.length > 8
                ? invoiceToPrint.id.substring(0, 8)
                : invoiceToPrint.id,
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
      // POS-B: the sale completed locally; if any loyalty operation failed
      // along the way, arm the non-blocking cashier warning. Arming before
      // clearCart() so its notifyListeners() carries the state to the view.
      _pendingLoyaltyWarning = _lastLoyaltyError != null;
      clearCart();
      _consumeOverride();
    } catch (e, stackTrace) {
      debugPrint('[SaleViewModel] Error al procesar la venta: $e\n$stackTrace');
      // D-16: the fiscal sequence states are configuration states the
      // operator acts on — surface the directive message without the raw
      // error wrapper.
      if (e is FiscalSequenceUnconfiguredError) {
        _errorMessage = e.message;
      } else if (e is FiscalExchangeRateUnconfiguredError) {
        // #67/T2a: same directive-message contract — the operator acts on
        // the configuration state, verbatim.
        _errorMessage = e.message;
      } else {
        // Go-live fix (NHILOS §4.1): user-facing copy never carries raw
        // errors, UUIDs or English data-layer text. The repository's
        // missing-recipe denial is translated to honest Spanish naming the
        // product; anything unmapped gets a generic Spanish message. The
        // raw error above goes to logs only.
        final productName = _missingRecipeProductNameFromCart(e);
        if (productName != null) {
          _errorMessage =
              'No se puede vender «$productName»: no tiene receta publicada. Avisá al encargado.';
        } else if (e.toString().contains(_missingRecipeErrorMarker)) {
          _errorMessage =
              'No se puede completar la venta: hay un producto sin receta publicada. Avisá al encargado.';
        } else {
          _errorMessage =
              'No se pudo procesar la venta. Intentá de nuevo; si el problema continúa, avisá al encargado.';
        }
      }
      // R-4: record the failure so the persistent cart-panel banner surfaces
      // it above COBRAR, not only in the transient (occluded) SnackBar.
      _lastCheckoutError = _errorMessage;
      notifyListeners();
      rethrow;
    }
  }

  /// Prints a committed invoice copy on the SAME printer path the sale used
  /// (config + resolver + printInvoice). Shared by the reprint and the
  /// ANULADO copy — never build a second printer path. [cashierName] is the
  /// document identity: the void passes the VOIDER's name (AC-9); reprints
  /// pass null and keep the historical behavior. B1d's chain rule: the
  /// fiscal authorization number rides this call site too.
  Future<bool> _printInvoiceCopy(
    Invoice invoice, {
    String? cashierName,
    Map<String, String>? fiscalHeader,
    TaxRegime? snapshotRegimeProvided,

    /// D-13: true when printing a REIMPRESIÓN of the immutable fiscal
    /// snapshot. A reprint reproduces the document as issued.
    bool isReprint = false,
    DateTime? reprintAt,

    /// REQ-8 (slice 8a): the origin invoice's HUMAN fiscal number for credit
    /// notes. Null → the origin line is omitted; never the internal UUID.
    String? originDocumentReference,
  }) async {
    try {
      final config = await _printerConfigService.getPrinterConfig();
      final items = await _database.invoiceItemDao.getItemsByInvoiceId(
        invoice.id,
      );
      final domainItems = items
          .map(
            (e) => InvoiceItem(
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
            ),
          )
          .toList();

      final payments = await _database.paymentDao.getPaymentsByInvoiceId(
        invoice.id,
      );
      final domainPayments = payments
          .map(
            (e) => Payment(
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
            ),
          )
          .toList();

      List<int>? logoRasterBytes;
      if (config.isLogoEnabled && config.logoBase64 != null) {
        try {
          final rawBytes = base64Decode(config.logoBase64!);
          if (ThermalLogoProcessor.isPng(rawBytes)) {
            logoRasterBytes = rawBytes;
          } else if (config.logoWidth != null &&
              config.logoHeight != null) {
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

      final activePrinterPort = _hasCustomPrinterPort
          ? _printerPort
          : PrinterResolver.resolve(config);

      // D-13 (JD-B-003/R2-5): when a fiscal snapshot is provided it is
      // AUTHORITATIVE — its regime governs and the live-regime guard does
      // NOT apply (a complete snapshot must reprint even with absent live
      // config). The live guard only governs the non-snapshot path.
      final fromSnapshot = fiscalHeader != null;
      final TaxRegime effectiveRegime;
      if (fromSnapshot) {
        // R2-6: consume the engine-parsed regime; fall back to parsing the
        // header only for direct callers that pass raw header values.
        final snapshotRegime = snapshotRegimeProvided ??
            TaxRegime.fromString(fiscalHeader['taxRegime']);
        if (snapshotRegime == null) {
          _lastPrintError =
              'Empresa sin régimen fiscal DGI configurado. No se puede reimprimir.';
          notifyListeners();
          return false;
        }
        effectiveRegime = snapshotRegime;
      } else {
        if (_companyTaxRegime == null) {
          _lastPrintError =
              'Empresa sin régimen fiscal DGI configurado. No se puede reimprimir.';
          notifyListeners();
          return false;
        }
        effectiveRegime = _companyTaxRegime!;
      }
      final res = await activePrinterPort.printInvoice(
        invoice,
        items: domainItems,
        payments: domainPayments,
        businessName: fromSnapshot
            ? fiscalHeader['businessName']
            : config.headerBusinessName,
        legalName:
            fromSnapshot ? null : config.headerLegalName,
        ruc: fromSnapshot ? fiscalHeader['ruc'] : config.fiscalRuc,
        address: fromSnapshot ? fiscalHeader['address'] : config.headerAddress,
        phone: fromSnapshot ? fiscalHeader['phone'] : config.headerPhone,
        cashierName: cashierName,
        logoRasterBytes: logoRasterBytes,
        taxRegime: effectiveRegime,
        isTaxExempt: invoice.globalTaxOverride,
        paperWidthMm: config.paperWidthMm,
        fiscalAuthorizationNumber: fromSnapshot
            ? fiscalHeader['fiscalAuthorizationNumber']
            : config.dgiAuthorizationCode,
        isReprint: isReprint,
        reprintAt: reprintAt,
        originDocumentReference: originDocumentReference,
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

  /// D-13: reprints ANY issued invoice from its immutable fiscal snapshot.
  /// Honest return: true = the reprint request was accepted by the engine
  /// (audit committed); the print outcome is reported separately through
  /// [lastReprintPrintSucceeded] — a failed print does not un-happen the
  /// accepted request (the void precedent). Policy denials set
  /// [errorMessage] to the specific Spanish message.
  Future<bool> reprintInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  }) async {
    // The role is resolved from the freshly fetched principal (same pattern
    // as the void guard) so the check never depends on the async initial
    // role load.
    final currentUser = await _authRepository.getCurrentUser();
    if (!hasSalesPermission(
      currentUser?.role,
      SalesPermission.reprintDocument,
    )) {
      _errorMessage = 'No tiene permiso para reimprimir comprobantes.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    notifyListeners();
    try {
      final preparation = await _salesRepository.prepareReprintInvoice(
        invoiceId,
        reasonCode,
        reasonDetail: reasonDetail,
      );

      _lastReprintPrintSucceeded = false;
      _lastReprintPrintSucceeded = await _printInvoiceCopy(
        preparation.invoice,
        fiscalHeader: preparation.fiscalHeader,
        snapshotRegimeProvided: preparation.taxRegime,
        isReprint: true,
        reprintAt: DateTime.now(),
      );

      _errorMessage = null;
      return true;
    } on StateError catch (error) {
      // Named engine denials carry the operator-facing Spanish copy.
      _errorMessage = error.message.contains(reprintSnapshotUnavailableCode)
          ? reprintSnapshotUnavailableMessage
          : 'No se pudo reimprimir el comprobante.';
      // ignore: avoid_print
      print('REPRINT-DEBUG StateError: ' + error.message);
      return false;
    } catch (error) {
      // ignore: avoid_print
      print('REPRINT-DEBUG generic: ' + error.toString());
      _errorMessage = 'No se pudo reimprimir el comprobante.';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// H5 (batch 8 slice 8a): RESTORED production call site for POS-side
  /// credit-note issuance. The manager/owner hard gate below is KEPT as
  /// defense-in-depth behind the UI's [canIssueCreditNote] visibility gate;
  /// DSI-6 will add the backend authorization-evidence path later. The
  /// note is created locally and stays pending upstream acceptance.
  ///
  /// Returns the NEW credit note id (needed by the UI to print the fiscal
  /// copy from the persisted rows), or null when nothing was issued. A
  /// locally created note is still pending validation at sync time; a
  /// non-null result never claims upstream acceptance.
  Future<String?> processReturn(
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
      return null;
    }

    // Defense-in-depth behind the UI's visibility gate (the button is not
    // rendered when this is false): a CUOTA_FIJA terminal must never write a
    // credit note. The copy names the two paths that DO exist for it.
    if (!isCreditNoteAvailableForRegime) {
      _errorMessage =
          'La nota de crédito no está disponible para este régimen fiscal. '
          'Para anular, usá ANULAR FACTURA dentro del turno; si hay que '
          'reintegrar dinero de días anteriores, registralo como egreso de '
          'caja menor (Gasto Menor).';
      notifyListeners();
      return null;
    }

    _isLoading = true;
    notifyListeners();
    try {
      final original = await _salesRepository.getInvoiceByNumber(invoiceNumber);
      if (original == null) {
        _errorMessage = 'Factura no encontrada: $invoiceNumber';
        return null;
      }

      if (original.isCanceled) {
        _errorMessage = 'La factura ya está anulada.';
        return null;
      }

      final creditNoteId = await _salesRepository.createCreditNote(
        originalInvoiceId: original.id,
        reason: reason,
        authorizedByUserId: currentUser?.id ?? '',
        authorizedByRole: role ?? UserRole.cashier,
        refundReasonPolicy: refundReasonPolicy,
        lines: lines,
        // JD-B-002/R2-3: the issuing terminal — same source as the sale path.
        terminalId: _terminalId.trim().isNotEmpty ? _terminalId.trim() : 'TERM-01',
      );

      // H8: print the fiscal copy from the PERSISTED rows of the new note
      // (its own immutable snapshot + origin-copied regime), mirroring the
      // reprint machinery — never live config, never fabricated values.
      // Offline-first: a print failure must NOT roll back or fail the
      // committed credit note; the outcome is surfaced separately through
      // [lastCreditNotePrintSucceeded] and the manual REIMPRIMIR path.
      _lastCreditNotePrintSucceeded = false;
      final creditNote = await _salesRepository.getInvoiceById(creditNoteId);
      if (creditNote != null) {
        await _printCreditNoteCopy(
          creditNote,
          issuerName: currentUser?.name,
        );
      }

      _errorMessage = null;
      return creditNoteId;
    } catch (e) {
      _errorMessage = 'Error al procesar devolución: $e';
      return null;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// H8: prints the committed credit note through the SAME printer path the
  /// sale used ([_printInvoiceCopy] with the note's OWN fiscal snapshot).
  /// Decisions (justified):
  /// - autoPrint gating follows the sale path (printerConfig.autoPrintInvoice,
  ///   sale_view_model.dart:1470): the operator's hardware profile decides
  ///   whether the copy prints automatically; when gated off the existing
  ///   REIMPRIMIR action still prints credit notes (D-13 reprints any
  ///   invoice from its snapshot).
  /// - payments: the credit note has NO payment rows by contract (issued
  ///   with an empty tender list); the empty list is passed through and the
  ///   formatter renders 'Condicion: Contado' — consistent with the note's
  ///   persisted paymentStatus 'paid'. No tender lines are fabricated.
  /// - snapshot anomalies (missing/corrupt header snapshot) surface as a
  ///   print failure in [lastPrintError]; the committed note is unaffected.
  Future<void> _printCreditNoteCopy(
    Invoice creditNote, {
    String? issuerName,
  }) async {
    try {
      final config = await _printerConfigService.getPrinterConfig();
      if (!config.autoPrintInvoice) return;

      final entity = await _database.invoiceDao.getInvoiceById(creditNote.id);
      final snapshot = _parseFiscalHeaderSnapshot(
        entity?.fiscalHeaderSnapshot,
        creditNote.id,
      );
      if (snapshot == null) return;

      // REQ-8 (slice 8a): a credit note must name the origin invoice by its
      // HUMAN fiscal number (e.g. 001-001-01-00000042), never the internal
      // originInvoiceId UUID (a DGI fiscal document must not expose internal
      // identifiers). Resolved read-only at print time; when the origin row
      // cannot be loaded the line is simply omitted — the print NEVER fails
      // for the origin reference and no placeholder is fabricated.
      String? originDocumentReference;
      final originId = creditNote.originInvoiceId;
      if (originId != null && originId.isNotEmpty) {
        final originEntity = await _database.invoiceDao
            .getInvoiceById(originId)
            .catchError((_) => null);
        final originNumber = originEntity?.number.trim() ?? '';
        if (originNumber.isNotEmpty) {
          originDocumentReference = originNumber;
        }
      }

      _lastCreditNotePrintSucceeded = await _printInvoiceCopy(
        creditNote,
        cashierName: issuerName,
        fiscalHeader: snapshot.header,
        snapshotRegimeProvided: snapshot.regime,
        originDocumentReference: originDocumentReference,
      );
    } catch (e) {
      _lastPrintError = e.toString();
      notifyListeners();
    }
  }

  /// Decodes the persisted fiscal header snapshot of a document. Any
  /// anomaly (missing, corrupted, unknown regime) returns null after
  /// recording the reason in [lastPrintError] — the same fail-closed rule
  /// as prepareReprintInvoice, because printing from live config would
  /// fabricate a legal document.
  _FiscalSnapshotHeader? _parseFiscalHeaderSnapshot(
    String? rawSnapshot,
    String invoiceId,
  ) {
    final raw = rawSnapshot?.trim() ?? '';
    if (raw.isEmpty) {
      _lastPrintError =
          'La nota de crédito $invoiceId no tiene instantánea fiscal guardada.';
      notifyListeners();
      return null;
    }
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final rawRegime = decoded['taxRegime'];
      if (rawRegime is! String) {
        throw const FormatException('taxRegime is missing or not a string');
      }
      final regime = TaxRegime.fromString(rawRegime);
      if (regime == null) {
        throw const FormatException('taxRegime is not a known regime code');
      }
      return _FiscalSnapshotHeader(
        header: decoded.map(
          (key, value) => MapEntry(key, value is String ? value : ''),
        ),
        regime: regime,
      );
    } catch (e) {
      _lastPrintError =
          'La instantánea fiscal de $invoiceId está corrupta o incompleta: $e';
      notifyListeners();
      return null;
    }
  }

  /// D-15: voids an invoice under the three-predicate guard (own invoice +
  /// open current shift + same local calendar date). Returns true only when
  /// the void is committed locally (the processReturn precedent: nothing
  /// more is claimed). Every policy denial sets [errorMessage] to the
  /// guard's specific Spanish message and returns false; repository
  /// invariant errors (double void, loyalty) surface as the honest generic
  /// message because they are bugs reaching the UI, not policy.
  Future<bool> voidInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  }) async {
    final currentUser = await _authRepository.getCurrentUser();
    if (currentUser == null) {
      _errorMessage = 'Debe iniciar sesión para anular facturas.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    notifyListeners();
    try {
      // Guard inputs come from the data layer: the domain Invoice
      // deliberately does not carry shift membership or the local issue
      // date (B1a-4 Option A).
      final entity = await _database.invoiceDao.getInvoiceById(invoiceId);
      if (entity == null) {
        _errorMessage = 'No se encontró la factura solicitada.';
        return false;
      }

      // Ratified terminal fallback: the shift that owns the ticket lives on
      // the ticket's terminal (same convention as the checkout site).
      final session = await _database.cashierSessionDao
          .getActiveSessionForUserAndTerminal(
        currentUser.id,
        entity.terminalId ?? 'pos-${currentUser.id}',
      );
      final decision = evaluateVoidRequest(
        actorCanVoidAny: hasSalesPermission(
            currentUser.role, SalesPermission.voidAnyInvoice),
        actorCanVoidOwnCurrentShift: hasSalesPermission(
            currentUser.role, SalesPermission.voidOwnCurrentShiftSale),
        actorUserId: currentUser.id,
        invoiceUserId: entity.userId,
        invoiceShiftId: entity.shiftId,
        invoiceLocalIssueDate: entity.localIssueDate,
        invoiceCreatedAt:
            DateTime.fromMillisecondsSinceEpoch(entity.createdAt),
        currentShiftId: session?.id,
        comparedTo: DateTime.now(),
      );
      if (!decision.isAllowed) {
        _errorMessage = decision.uiMessage;
        return false;
      }

      await _salesRepository.voidInvoice(
        invoiceId,
        reasonCode,
        reasonDetail: reasonDetail,
      );

      // AC-10: print the ANULADO copy on the same printer path the sale
      // used, with the VOIDER's name as the document identity (AC-9).
      // Audit #79: the copy follows the SAME auto-print policy as the sale
      // and credit-note paths — the printer config is read at print time
      // and `autoPrintInvoice` is respected. The void is already committed
      // here and is NEVER rolled back or reported failed because of a print
      // problem: the fiscal void is the fact, the print is derivative.
      _lastVoidPrintSucceeded = false;
      _lastVoidCopyPrintOutcome = VoidCopyPrintOutcome.notRequested;
      final voided = await _salesRepository.getInvoiceById(invoiceId);
      if (voided != null) {
        _lastProcessedInvoice = voided;
        try {
          final printerConfig =
              await _printerConfigService.getPrinterConfig();
          if (printerConfig.autoPrintInvoice) {
            _lastVoidPrintSucceeded = await _printInvoiceCopy(
              voided,
              cashierName: currentUser.name,
            );
            _lastVoidCopyPrintOutcome = _lastVoidPrintSucceeded
                ? VoidCopyPrintOutcome.printed
                : VoidCopyPrintOutcome.failed;
          }
        } catch (e) {
          // Printer-unavailability must not silently pass as "not
          // requested" nor un-happen the committed void: it is a failed
          // print attempt whose reason the operator sees.
          _lastPrintError = e.toString();
          _lastVoidCopyPrintOutcome = VoidCopyPrintOutcome.failed;
          notifyListeners();
        }
      }

      _errorMessage = null;
      return true;
    } on StateError catch (e, st) {
      // D-8: never swallow the cause. The operator gets an actionable,
      // non-technical message; the log keeps the domain error for diagnosis.
      // The invoice is left untouched by the rollback, so every message below
      // stays truthful about that.
      developer.log(
        'voidInvoice StateError: ${e.message}',
        name: 'SaleViewModel',
        level: 1000, // SEVERE
        error: e,
        stackTrace: st,
      );
      _errorMessage = _voidFailureMessage(e);
      return false;
    } catch (e, st) {
      developer.log(
        'voidInvoice failed: $e',
        name: 'SaleViewModel',
        level: 1000, // SEVERE
        error: e,
        stackTrace: st,
      );
      _errorMessage = _voidFailureMessage(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// D-8: maps a void failure to the operator-facing message. The raw domain
  /// error is NOT shown verbatim (NHILOS: no internals to the operator) but it
  /// is logged by the caller. Every branch states that the invoice was left
  /// intact, which is true because the whole void is one atomic unit.
  String _voidFailureMessage(Object error) {
    final raw = error is StateError ? error.message : error.toString();
    if (raw.contains('already canceled')) {
      return 'La factura ya está anulada.';
    }
    if (raw.contains('requires an original movement') ||
        raw.contains('Recipe version') ||
        raw.contains('Insufficient stock') ||
        raw.contains('missing locally') ||
        raw.contains('no recipe to record')) {
      return 'No se pudo anular por un problema de inventario. '
          'La factura no se modificó.';
    }
    return 'No se pudo anular la factura. La factura no se modificó.';
  }

  @override
  void dispose() {
    _syncDebounceTimer?.cancel();
    _syncSubscription?.cancel();
    super.dispose();
  }
}

/// H8: the decoded fiscal header snapshot of a document (header facts plus
/// the regime AS ISSUED). Produced only from persisted snapshot bytes —
/// never from live configuration.
class _FiscalSnapshotHeader {
  final Map<String, String> header;
  final TaxRegime regime;

  const _FiscalSnapshotHeader({
    required this.header,
    required this.regime,
  });
}
