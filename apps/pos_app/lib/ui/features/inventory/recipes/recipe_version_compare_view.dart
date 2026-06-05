import 'package:flutter/material.dart';

import 'recipe_view_model.dart';

class RecipeVersionCompareView extends StatelessWidget {
  const RecipeVersionCompareView({
    super.key,
    required this.rows,
  });

  final List<RecipeComparisonRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Center(child: Text('No hay versiones suficientes para comparar.'));
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: rows.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final row = rows[index];
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          title: Text(row.label, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(row.componentType == 'SUB_RECIPE' ? 'Sub-receta' : 'Insumo'),
          trailing: SizedBox(
            width: 220,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Neto ${row.baseNet.toStringAsFixed(2)} → ${row.targetNet.toStringAsFixed(2)}',
                  style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                ),
                Text(
                  'Merma ${row.baseShrink.toStringAsFixed(1)}% → ${row.targetShrink.toStringAsFixed(1)}%',
                  style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
