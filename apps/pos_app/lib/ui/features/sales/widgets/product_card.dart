import 'package:flutter/material.dart';

import '../../../design_system/nhilos_tokens.dart';
import '../../../../domain/models/inventory/product.dart';
import 'product_card_thumbnail.dart';
import 'product_grid_geometry.dart';

/// One product tile of the sales catalog.
///
/// The photo is the protagonist: it spans the full card width as a 1:1 square
/// and the name (two lines) plus the price live in a compact footer band under
/// it. The card adapts its type scale to its own rendered width, so the same
/// widget serves the 3-column phone band and the wider terminal bands without
/// a per-device flag (§12.6, §42.6, §42.7, §46).
class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    required this.onTap,
    this.promoLabel,
  });

  final Product product;

  /// Opens the product (or adds it straight to the cart when it has no
  /// options) — the catalog never decides that itself.
  final VoidCallback onTap;

  /// Short promotion label rendered as a floating badge (`2x1`, `-10%`,
  /// `PROMO`), or null when the product has no active promotion.
  final String? promoLabel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isPromo = promoLabel != null;
    final price = product.sellPrice.toStringAsFixed(2);

    // One accessible node: TalkBack reads product + price as a single button
    // instead of walking the photo, the name and the price separately (§46).
    return Semantics(
      container: true,
      button: true,
      excludeSemantics: true,
      label: isPromo
          ? '${product.name}, C\$ $price, promoción $promoLabel'
          : '${product.name}, C\$ $price',
      child: Card(
        margin: const EdgeInsets.all(ProductGridGeometry.cardMargin),
        elevation: 0,
        // The photo is flush with the card edges, so the card owns the clip.
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: NhilosRadii.cardRadius,
          side: BorderSide(
            color: isPromo ? colorScheme.primary : colorScheme.outlineVariant,
            width: isPromo ? 1.5 : 1,
          ),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final cardWidth = constraints.maxWidth;
            final compact = cardWidth < ProductGridGeometry.compactCardWidth;
            final nameSize = compact ? 11.0 : 12.0;
            final priceSize = compact ? 13.0 : 15.0;

            return InkWell(
              onTap: onTap,
              child: Stack(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      AspectRatio(
                        aspectRatio: 1,
                        child: ProductCardThumbnail(
                          imageUrl: product.imageUrl,
                          category: product.category,
                          productName: product.name,
                          width: cardWidth,
                          height: cardWidth,
                          borderRadius: BorderRadius.zero,
                          showBorder: false,
                          backgroundColor: colorScheme.surfaceContainerHighest,
                        ),
                      ),
                      Expanded(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(
                            compact ? 4 : 6,
                            compact ? 4 : 6,
                            compact ? 4 : 6,
                            compact ? 6 : 8,
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Flexible(
                                child: Text(
                                  product.name,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: nameSize,
                                    height: 1.15,
                                    color: colorScheme.onSurface,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'C\$ $price',
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: NhilosTextStyles.tabular(
                                  base: TextStyle(
                                    color: colorScheme.primary,
                                    fontWeight: FontWeight.bold,
                                    fontSize: priceSize,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (isPromo)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: const BoxDecoration(
                          color: NhilosColors.brandPrimary,
                          borderRadius: NhilosRadii.badgeRadius,
                        ),
                        child: Text(
                          promoLabel!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
