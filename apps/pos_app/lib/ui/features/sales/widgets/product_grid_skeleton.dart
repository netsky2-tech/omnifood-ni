import 'package:flutter/material.dart';

import '../../../design_system/nhilos_tokens.dart';
import 'product_grid_geometry.dart';

/// Placeholder shown while the local catalog is being read.
///
/// The catalog comes from SQLite, so a full-page spinner would misrepresent
/// how long the work takes and would shift the whole layout when the data
/// lands (§28.1, §47). A static skeleton — deliberately without a shimmer
/// animation — keeps the operator's geometry and the search field usable
/// while the products arrive.
class ProductGridSkeleton extends StatelessWidget {
  const ProductGridSkeleton({super.key, this.rows = 2});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final geometry = ProductGridGeometry(
          viewportWidth: constraints.maxWidth,
          devicePixelRatio: MediaQuery.devicePixelRatioOf(context),
        );

        return GridView.builder(
          key: const Key('product_grid_skeleton'),
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.all(geometry.horizontalPadding),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: geometry.columns,
            childAspectRatio: geometry.childAspectRatio,
            crossAxisSpacing: geometry.crossAxisSpacing,
            mainAxisSpacing: geometry.mainAxisSpacing,
          ),
          itemCount: geometry.columns * rows,
          itemBuilder: (context, index) => const _SkeletonCard(),
        );
      },
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final placeholder = colorScheme.surfaceContainerHighest;

    Widget bar(double widthFactor) => FractionallySizedBox(
          widthFactor: widthFactor,
          child: Container(
            height: 10,
            decoration: BoxDecoration(
              color: placeholder,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        );

    return Card(
      margin: const EdgeInsets.all(ProductGridGeometry.cardMargin),
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: NhilosRadii.cardRadius,
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: ColoredBox(color: placeholder),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 8,
                vertical: 6,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  bar(1),
                  const SizedBox(height: 6),
                  bar(0.7),
                  const SizedBox(height: 6),
                  bar(0.45),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
