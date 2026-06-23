/// Catalog type registry (POS mirror of the backend `CATALOG_TYPE`).
///
/// The set of catalog TYPES is a system protocol/invariant: fixed by the
/// application contract and NOT tenant-configurable. Only the VALUES inside
/// each catalog are tenant-administrable (synced from the Admin backend and
/// cached locally for offline-first operation). This respects the OmniFood NI
/// rule: business/tenant catalogs must be administrable from the system, while
/// protocol/invariant states may remain as technical constants.
///
/// `uom` is the single shared units-of-measure catalog. Inventory consumption
/// UOM, purchase UOM and sales-product UOM all draw from this same pool.
class CatalogType {
  const CatalogType._(this.value);

  final String value;

  static const CatalogType uom = CatalogType._('UOM');
  static const CatalogType inventoryCategory = CatalogType._('INVENTORY_CATEGORY');
  static const CatalogType inventoryType = CatalogType._('INVENTORY_TYPE');
  static const CatalogType salesProductCategory =
      CatalogType._('SALES_PRODUCT_CATEGORY');
  static const CatalogType salesProductType = CatalogType._('SALES_PRODUCT_TYPE');

  static const List<CatalogType> all = <CatalogType>[
    uom,
    inventoryCategory,
    inventoryType,
    salesProductCategory,
    salesProductType,
  ];

  /// Parse a catalog type string coming from the backend sync payload.
  /// Returns `null` for unknown types so sync never crashes on a forward
  /// protocol extension it does not yet understand.
  static CatalogType? fromString(String raw) {
    for (final type in all) {
      if (type.value == raw) return type;
    }
    return null;
  }

  /// JSON deserialization helper for Freezed. Throws on unknown types: a
  /// persisted/synced value must reference a known protocol catalog type.
  static CatalogType fromJson(String raw) {
    final type = fromString(raw);
    if (type == null) {
      throw StateError('Unknown catalog type "$raw"');
    }
    return type;
  }

  /// JSON serialization helper for Freezed.
  static String toJson(CatalogType type) => type.value;

  @override
  bool operator ==(Object other) =>
      other is CatalogType && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => value;
}
