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

class ProductCardThumbnail extends StatelessWidget {
  final String? category;
  final String productName;
  final double size;
  final Color? color;
  final Color? backgroundColor;

  const ProductCardThumbnail({
    super.key,
    this.category,
    required this.productName,
    this.size = 40,
    this.color,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    final visual = ProductVisualResolver.resolve(
      category: category,
      productName: productName,
    );

    final resolvedColor = color ?? NhilosColors.brandPrimary;

    if (visual.icon != null) {
      return Icon(
        visual.icon,
        size: size,
        color: resolvedColor,
      );
    }

    // Monogram presentation (§12.6 Level 2)
    final bg = backgroundColor ?? NhilosColors.brandTealLight;
    final monogramSize = size * 0.42;

    return Center(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(size * 0.25),
        ),
        alignment: Alignment.center,
        child: Text(
          visual.monogram ?? 'N',
          style: TextStyle(
            color: resolvedColor,
            fontWeight: FontWeight.w700,
            fontSize: monogramSize.clamp(10, 18),
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
