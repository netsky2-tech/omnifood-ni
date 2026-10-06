import '../../domain/models/inventory/product.dart';
import '../models/modifiers/modifier_group_entity.dart';
import '../models/modifiers/modifier_option_entity.dart';
import '../models/modifiers/category_modifier_group_entity.dart';
import '../models/modifiers/product_modifier_group_entity.dart';

/// Resolves the EFFECTIVE modifier groups of one product from the local
/// mirror, mirroring the server rule (§30) byte-for-byte in behavior:
///
/// 1. Category side (inherited): `product.categoryId` — the uuid stored
///    since the cloud product delta shipped ids; it IS `catalog_values.id`,
///    which is why the server resolves by `category_code` and the device by
///    id and both are equivalent by design — selects the
///    `category_modifier_groups` rows with that `catalog_value_id`. A null
///    or absent categoryId yields an EMPTY inherited set, never a failure.
/// 2. Product side (exceptions): `product_modifier_groups` rows with the
///    product's id.
/// 3. Union deduplicated by `group_id`: a group attached at BOTH levels
///    appears ONCE with source 'product' (the explicit exception wins),
///    even if its category attachment had a lower sort_order.
/// 4. Deterministic order: all 'category' items first, ordered by
///    (attachment.sort_order, group.name, group.id); then all 'product'
///    items ordered the same way over the product attachments.
/// 5. Fail-closed filtering: only groups with `is_active = true`; each
///    returned group carries only `is_active = true` options ordered by
///    (option.sort_order, option.name, option.id). An attachment whose
///    group is not in the loaded set (impossible via snapshot, defensive
///    anyway) is skipped, never a crash.
///
/// Pure function over the Floor entities: NO database access, NO I/O. The
/// caller fetches the four datasets once and resolves every product in
/// memory — the mirror is a small full snapshot, so this is cheap.
class ModifierResolutionService {
  const ModifierResolutionService._();

  static List<EffectiveModifierGroup> resolveEffective({
    required String productId,
    required String? categoryId,
    required List<ModifierGroupEntity> groups,
    required List<ModifierOptionEntity> options,
    required List<CategoryModifierGroupEntity> categoryAttachments,
    required List<ProductModifierGroupEntity> productAttachments,
  }) {
    final groupById = <String, ModifierGroupEntity>{
      for (final group in groups) group.id: group,
    };

    // Fail-closed option closure: only active options, ordered
    // deterministically, grouped once in memory (no per-group scans).
    final activeOptions = options
        .where((option) => option.isActive)
        .toList()
      ..sort((a, b) {
        final bySortOrder = a.sortOrder.compareTo(b.sortOrder);
        if (bySortOrder != 0) return bySortOrder;
        final byName = a.name.compareTo(b.name);
        if (byName != 0) return byName;
        return a.id.compareTo(b.id);
      });
    final optionsByGroupId = <String, List<EffectiveModifierOption>>{};
    for (final option in activeOptions) {
      optionsByGroupId.putIfAbsent(option.groupId, () => []).add(
            EffectiveModifierOption(
              id: option.id,
              name: option.name,
              priceDelta: option.priceDelta,
              isDefault: option.isDefault,
            ),
          );
    }

    EffectiveModifierGroup? buildEntry(
      String groupId,
      String source,
    ) {
      final group = groupById[groupId];
      // Defensive: a dangling attachment is skipped, never a crash, and an
      // inactive group drops out (fail-closed) on either side.
      if (group == null || !group.isActive) return null;
      return EffectiveModifierGroup(
        id: group.id,
        name: group.name,
        minSelected: group.minSelected,
        maxSelected: group.maxSelected,
        allowQuantities: group.allowQuantities,
        source: source,
        options: optionsByGroupId[groupId] ?? const [],
      );
    }

    // The product's OWN exceptions (this product only) are computed FIRST:
    // the dedup is per-product, so an exception on product A must never
    // leak into product B's inherited list.
    final ownAttachments = productAttachments
        .where((attachment) => attachment.productId == productId)
        .toList();
    final productGroupIds = ownAttachments
        .map((attachment) => attachment.groupId)
        .toSet();
    final inheritedAttachments = categoryAttachments
        .where(
          (attachment) =>
              categoryId != null &&
              attachment.catalogValueId == categoryId &&
              !productGroupIds.contains(attachment.groupId),
        )
        .toList();

    String attachmentTiebreak(
      String groupId, {
      required int attachmentSortOrder,
    }) {
      final group = groupById[groupId];
      return '${attachmentSortOrder.toString().padLeft(12, '0')}'
          '::${group?.name ?? ''}::$groupId';
    }

    inheritedAttachments.sort((a, b) => attachmentTiebreak(
          a.groupId,
          attachmentSortOrder: a.sortOrder,
        ).compareTo(attachmentTiebreak(
          b.groupId,
          attachmentSortOrder: b.sortOrder,
        )));
    ownAttachments.sort((a, b) => attachmentTiebreak(
          a.groupId,
          attachmentSortOrder: a.sortOrder,
        ).compareTo(attachmentTiebreak(
          b.groupId,
          attachmentSortOrder: b.sortOrder,
        )));

    final result = <EffectiveModifierGroup>[];
    for (final attachment in inheritedAttachments) {
      final entry = buildEntry(attachment.groupId, 'category');
      if (entry != null) result.add(entry);
    }
    for (final attachment in ownAttachments) {
      final entry = buildEntry(attachment.groupId, 'product');
      if (entry != null) result.add(entry);
    }
    return result;
  }
}
