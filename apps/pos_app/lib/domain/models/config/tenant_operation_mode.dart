import 'package:freezed_annotation/freezed_annotation.dart';

/// Defines the operational mode of a tenant in OmniFood NI POS.
///
/// - [foodparkQsr]: Fast counter pre-pay + buzzer/pager queue. Direct cashier checkout without tables.
/// - [restaurant]: Full dining restaurant with table layout, open tabs (comandas), and table service.
/// - [hybrid]: Supports both counter service with buzzer/pager and table layout dining.
enum TenantOperationMode {
  @JsonValue('FOODPARK_QSR')
  foodparkQsr('FOODPARK_QSR', 'Food Park / QSR'),

  @JsonValue('RESTAURANT')
  restaurant('RESTAURANT', 'Restaurante / Mesas'),

  @JsonValue('HYBRID')
  hybrid('HYBRID', 'Híbrido (QSR + Mesas)');

  const TenantOperationMode(this.code, this.displayName);

  final String code;
  final String displayName;

  bool get isFoodParkQsr => this == TenantOperationMode.foodparkQsr;
  bool get isRestaurant => this == TenantOperationMode.restaurant;
  bool get isHybrid => this == TenantOperationMode.hybrid;

  /// Whether table layout, table assignment and table transfers/merges are supported.
  bool get supportsTables =>
      this == TenantOperationMode.restaurant || this == TenantOperationMode.hybrid;

  /// Whether buzzer / pager number input is supported for customer notification.
  bool get supportsBuzzerPager =>
      this == TenantOperationMode.foodparkQsr || this == TenantOperationMode.hybrid;

  /// Whether direct counter pre-pay checkout is the standard operational flow.
  bool get requiresDirectCheckout => this == TenantOperationMode.foodparkQsr;

  /// Safe parsing from string with fallback to defaultMode.
  static TenantOperationMode fromString(
    String? raw, {
    TenantOperationMode defaultMode = TenantOperationMode.foodparkQsr,
  }) {
    if (raw == null) return defaultMode;
    final normalized = raw.trim().toUpperCase();
    for (final mode in TenantOperationMode.values) {
      if (mode.code == normalized || mode.name.toUpperCase() == normalized) {
        return mode;
      }
    }
    return defaultMode;
  }
}
