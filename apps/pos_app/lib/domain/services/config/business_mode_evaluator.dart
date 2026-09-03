import '../../models/config/tenant_config.dart';

/// Checkout workflows supported by NHILOS POS.
enum CheckoutWorkflowType {
  fastCounterQsr,
  restaurantTable,
  hybridCounter,
  hybridTable;

  bool get isFastCounter => this == CheckoutWorkflowType.fastCounterQsr || this == CheckoutWorkflowType.hybridCounter;
  bool get isTableService => this == CheckoutWorkflowType.restaurantTable || this == CheckoutWorkflowType.hybridTable;
}

/// Evaluates business operation capabilities and workflows based on tenant configuration.
class BusinessModeEvaluator {
  final TenantConfig config;

  const BusinessModeEvaluator(this.config);

  bool get isFoodParkQsr => config.isFoodParkQsr;
  bool get isRestaurant => config.isRestaurant;
  bool get isHybrid => config.isHybrid;

  /// Whether table layout and table parking/hold are permitted.
  bool get canUseTableService => config.supportsTables;

  /// Whether buzzer/pager input is supported for customer pickup alerts.
  bool get canUseBuzzerPager => config.supportsBuzzerPager;

  /// Whether bill splitting (equal parts or by item) is enabled in the checkout flow.
  bool get isSplitBillAllowed => canUseTableService;

  /// Whether suggested voluntary tip (10% DGI exempt) prompt should be displayed during checkout.
  bool get isSuggestedTipPromptEnabled => canUseTableService;

  /// Resolves the optimal checkout workflow given the active order context.
  CheckoutWorkflowType resolveWorkflow({bool hasActiveTable = false}) {
    if (config.isFoodParkQsr) {
      return CheckoutWorkflowType.fastCounterQsr;
    }

    if (config.isRestaurant) {
      return CheckoutWorkflowType.restaurantTable;
    }

    // Hybrid mode: Dynamic branching based on whether a table is actively selected
    if (hasActiveTable) {
      return CheckoutWorkflowType.hybridTable;
    } else {
      return CheckoutWorkflowType.hybridCounter;
    }
  }
}
