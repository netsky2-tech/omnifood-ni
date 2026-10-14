import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../../design_system/nhilos_tokens.dart';

class ProductVisualResult {
  final IconData? icon;
  final String? monogram;

  const ProductVisualResult._({this.icon, this.monogram});

  factory ProductVisualResult.icon(IconData icon) =>
      ProductVisualResult._(icon: icon);

  factory ProductVisualResult.monogram(String monogram) =>
      ProductVisualResult._(monogram: monogram);
}

class ProductVisualResolver {
  static String _normalize(String input) {
    var text = input.trim().toLowerCase();
    text = text
        .replaceAll('á', 'a')
        .replaceAll('é', 'e')
        .replaceAll('í', 'i')
        .replaceAll('ó', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ü', 'u')
        .replaceAll('ñ', 'n');
    return text;
  }

  static ProductVisualResult resolve({
    String? category,
    required String productName,
  }) {
    final catNorm = category != null ? _normalize(category) : '';
    final nameNorm = _normalize(productName);

    // Burgers: only if explicitly categorized or named as burger/hamburguesa
    if (catNorm.contains('hamburguesa') ||
        catNorm.contains('burger') ||
        nameNorm.contains('hamburguesa') ||
        nameNorm.contains('burger')) {
      return ProductVisualResult.icon(Icons.lunch_dining_outlined);
    }

    // Level 1: Category glyph resolution (§12.6)
    if (catNorm.isNotEmpty) {
      if (catNorm.contains('cafe') ||
          catNorm.contains('caliente') ||
          catNorm.contains('espresso') ||
          catNorm.contains('latte') ||
          catNorm.contains('cappuccino') ||
          catNorm.contains('infusion') ||
          RegExp(r'\bte\b').hasMatch(catNorm) ||
          catNorm.contains('barista')) {
        return ProductVisualResult.icon(Icons.local_cafe_outlined);
      }

      if (catNorm.contains('fria') ||
          catNorm.contains('frio') ||
          catNorm.contains('bebida') ||
          catNorm.contains('jugo') ||
          catNorm.contains('refresco') ||
          catNorm.contains('batido') ||
          catNorm.contains('smoothie') ||
          catNorm.contains('agua') ||
          catNorm.contains('soda') ||
          catNorm.contains('gaseosa') ||
          catNorm.contains('coctel') ||
          catNorm.contains('cerveza')) {
        return ProductVisualResult.icon(Icons.local_drink_outlined);
      }

      if (catNorm.contains('reposteria') ||
          catNorm.contains('panaderia') ||
          catNorm.contains('pan') ||
          catNorm.contains('croissant') ||
          catNorm.contains('pastel') ||
          catNorm.contains('postre') ||
          catNorm.contains('dulce') ||
          catNorm.contains('galleta') ||
          catNorm.contains('cookie') ||
          catNorm.contains('torta')) {
        return ProductVisualResult.icon(Icons.bakery_dining_outlined);
      }

      if (catNorm.contains('comida') ||
          catNorm.contains('desayuno') ||
          catNorm.contains('almuerzo') ||
          catNorm.contains('cena') ||
          catNorm.contains('plato') ||
          catNorm.contains('quesillo') ||
          catNorm.contains('nacatamal') ||
          catNorm.contains('snack')) {
        return ProductVisualResult.icon(Icons.restaurant_outlined);
      }

      if (catNorm.contains('pizza')) {
        return ProductVisualResult.icon(Icons.local_pizza_outlined);
      }
    }

    // Level 2: Typographic monogram fallback (§12.6)
    final words = productName
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .toList();

    String monogram;
    if (words.length >= 2) {
      final first = words[0][0];
      // For word 2, if it starts with digits (e.g. 12oz), capture up to 2 chars, else 1 char
      final second = words[1];
      if (RegExp(r'^\d').hasMatch(second)) {
        monogram = '$first${second.length >= 2 ? second.substring(0, 2) : second}';
      } else {
        monogram = '$first${second[0]}';
      }
    } else if (words.isNotEmpty && words[0].isNotEmpty) {
      final word = words[0];
      monogram = word.length >= 2 ? word.substring(0, 2) : word;
    } else {
      monogram = 'N';
    }

    return ProductVisualResult.monogram(monogram.toUpperCase());
  }
}

/// Renders the product identity: the stored 1:1 photo when there is one, or
/// the two-level fallback of §12.6 (category glyph, then typographic
/// monogram) when there is not.
///
/// [size] is the historical square shorthand. [width]/[height] size the box
/// explicitly for the full-width catalog photo, and every fallback scales with
/// the box, so the glyph is not lost inside a large tile.
class ProductCardThumbnail extends StatelessWidget {
  final String? imageUrl;
  final String? category;
  final String productName;
  final double size;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final bool showBorder;
  final Color? color;
  final Color? backgroundColor;

  /// Share of the box the category glyph occupies.
  static const double _iconRatio = 0.36;

  /// Share of the box the typographic monogram occupies.
  static const double _monogramRatio = 0.28;

  const ProductCardThumbnail({
    super.key,
    this.imageUrl,
    this.category,
    required this.productName,
    this.size = 40,
    this.width,
    this.height,
    this.borderRadius,
    this.showBorder = true,
    this.color,
    this.backgroundColor,
  });

  Uint8List? _tryDecodeBase64DataUrl(String raw) {
    if (!raw.startsWith('data:image/')) return null;
    final commaIndex = raw.indexOf(',');
    if (commaIndex == -1) return null;
    try {
      final base64String = raw.substring(commaIndex + 1).trim();
      return base64Decode(base64String);
    } catch (_) {
      return null;
    }
  }

  /// Fills the whole box: a pastel surface carrying the category glyph or the
  /// product monogram. Neither the glyph nor the monogram keeps a fixed size,
  /// so the fallback stays intentional at any tile size (§12.6).
  Widget _buildFallback(
    ProductVisualResult visual,
    Color resolvedColor,
    double box,
  ) {
    return Container(
      width: box,
      height: box,
      color: backgroundColor ?? NhilosColors.brandTealLight,
      alignment: Alignment.center,
      child: visual.icon != null
          ? Icon(
              visual.icon,
              size: box * _iconRatio,
              color: resolvedColor,
            )
          : Text(
              visual.monogram ?? 'N',
              style: TextStyle(
                color: resolvedColor,
                fontWeight: FontWeight.w700,
                fontSize: (box * _monogramRatio).clamp(10.0, 96.0),
                letterSpacing: 0.5,
              ),
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visual = ProductVisualResolver.resolve(
      category: category,
      productName: productName,
    );

    final resolvedColor = color ?? NhilosColors.brandPrimary;
    final boxWidth = width ?? size;
    final boxHeight = height ?? size;
    final box = boxWidth < boxHeight ? boxWidth : boxHeight;
    final radius = borderRadius ?? BorderRadius.circular(size * 0.22);

    Widget? photo;
    final cleanUrl = imageUrl?.trim() ?? '';

    // 1. Data URL (client-compressed WebP/JPEG, 100% offline-first)
    if (cleanUrl.startsWith('data:image/')) {
      final bytes = _tryDecodeBase64DataUrl(cleanUrl);
      if (bytes != null && bytes.isNotEmpty) {
        photo = Image.memory(
          bytes,
          width: boxWidth,
          height: boxHeight,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) =>
              _buildFallback(visual, resolvedColor, box),
        );
      }
      // 2. HTTP network URL
    } else if (cleanUrl.startsWith('http://') ||
        cleanUrl.startsWith('https://')) {
      photo = Image.network(
        cleanUrl,
        width: boxWidth,
        height: boxHeight,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) =>
            _buildFallback(visual, resolvedColor, box),
      );
    }

    return Container(
      width: boxWidth,
      height: boxHeight,
      decoration: showBorder
          ? BoxDecoration(
              borderRadius: radius,
              border: Border.all(
                color: Theme.of(context)
                    .colorScheme
                    .outlineVariant
                    .withValues(alpha: 0.6),
                width: 0.8,
              ),
            )
          : null,
      child: ClipRRect(
        borderRadius: radius,
        child: photo ?? _buildFallback(visual, resolvedColor, box),
      ),
    );
  }
}
