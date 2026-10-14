import 'package:flutter/material.dart';

import '../../../design_system/nhilos_tokens.dart';

/// Horizontal, single-select category filter for the sales catalog (§14).
///
/// The first chip is always "Todas" and maps to a null category, so resetting
/// the filter is a visible state instead of a hidden gesture (§14.2). The bar
/// is only mounted when the catalog actually defines categories: an empty
/// filter row is noise (§43).
///
/// Chips (`ChoiceChip`) are the suite's established pattern for mutually
/// exclusive short options (§48).
class CategoryFilterBar extends StatelessWidget {
  const CategoryFilterBar({
    super.key,
    required this.categories,
    required this.selected,
    required this.onSelected,
  });

  final List<String> categories;

  /// Currently selected category, or null for "Todas".
  final String? selected;

  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      key: const Key('category_filter_bar'),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: SizedBox(
        height: 52,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          itemCount: categories.length + 1,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) {
            final isAll = index == 0;
            final category = isAll ? null : categories[index - 1];
            final isSelected = selected == category;
            final label = category ?? 'Todas';

            return ChoiceChip(
              label: Text(label),
              selected: isSelected,
              onSelected: (_) => onSelected(category),
              showCheckmark: false,
              selectedColor: NhilosColors.brandPrimary,
              backgroundColor: colorScheme.surface,
              side: BorderSide(
                color: isSelected
                    ? NhilosColors.brandPrimary
                    : colorScheme.outlineVariant,
              ),
              shape: const RoundedRectangleBorder(
                borderRadius: NhilosRadii.chipRadius,
              ),
              labelStyle: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.white : NhilosColors.textPrimary,
              ),
              labelPadding: const EdgeInsets.symmetric(horizontal: 6),
              visualDensity: VisualDensity.compact,
            );
          },
        ),
      ),
    );
  }
}
