import '../../models/sales/cart_item.dart';
import '../../models/sales/promotion.dart';

class AppliedPromotionInfo {
  final String promotionId;
  final String promotionName;
  final double discountAmount;
  final String? targetProductId;
  final String? targetCategoryId;

  const AppliedPromotionInfo({
    required this.promotionId,
    required this.promotionName,
    required this.discountAmount,
    this.targetProductId,
    this.targetCategoryId,
  });
}

class PromotionEvaluationResult {
  final double totalDiscount;
  final Map<String, double> itemDiscounts; // productId -> total discount
  final List<AppliedPromotionInfo> appliedPromotions;

  const PromotionEvaluationResult({
    required this.totalDiscount,
    required this.itemDiscounts,
    required this.appliedPromotions,
  });

  static const empty = PromotionEvaluationResult(
    totalDiscount: 0.0,
    itemDiscounts: {},
    appliedPromotions: [],
  );
}

class PromotionsEngine {
  const PromotionsEngine();

  PromotionEvaluationResult evaluate({
    required List<CartItem> cart,
    required List<Promotion> promotions,
    DateTime? currentTime,
  }) {
    if (cart.isEmpty || promotions.isEmpty) {
      return PromotionEvaluationResult.empty;
    }

    final now = currentTime ?? DateTime.now();
    final grossOrderTotal = cart.fold(
      0.0,
      (sum, i) => sum + (i.unitPrice * i.quantity),
    );

    // Filter active & temporally valid promotions sorted by priority (higher priority first)
    final eligiblePromotions = promotions
        .where((p) => p.isActive)
        .where((p) => _isWithinDateRange(p, now))
        .where((p) => _isWithinSchedule(p, now))
        .where((p) => p.minOrderAmount <= 0 || grossOrderTotal >= p.minOrderAmount)
        .toList()
      ..sort((a, b) => b.priority.compareTo(a.priority));

    if (eligiblePromotions.isEmpty) {
      return PromotionEvaluationResult.empty;
    }

    double totalDiscount = 0.0;
    final Map<String, double> itemDiscounts = {};
    final List<AppliedPromotionInfo> appliedList = [];

    for (final promo in eligiblePromotions) {
      double discountForThisPromo = 0.0;

      switch (promo.type) {
        case PromotionType.buyXGetYFree:
          if (promo.targetProductId != null &&
              (promo.buyQuantity + promo.getQuantity) > 0) {
            final matchingItems = cart.where(
              (i) => i.productId == promo.targetProductId,
            );
            if (matchingItems.isNotEmpty) {
              final totalQty = matchingItems
                  .fold(0.0, (sum, i) => sum + i.quantity)
                  .toInt();
              final setSize = promo.buyQuantity + promo.getQuantity;
              final sets = totalQty ~/ setSize;
              if (sets > 0) {
                final unitPrice = matchingItems.first.unitPrice;
                final discount = sets * promo.getQuantity * unitPrice;
                discountForThisPromo += discount;
                itemDiscounts[promo.targetProductId!] =
                    (itemDiscounts[promo.targetProductId!] ?? 0.0) + discount;
              }
            }
          }
          break;

        case PromotionType.percentageDiscount:
          final pct = (promo.discountValue / 100.0).clamp(0.0, 1.0);
          if (pct > 0) {
            for (final item in cart) {
              final matchesProduct = promo.targetProductId != null &&
                  item.productId == promo.targetProductId;
              final matchesCategory = promo.targetCategoryId != null &&
                  item.category?.toLowerCase() ==
                      promo.targetCategoryId!.toLowerCase();
              final isGlobal = promo.targetProductId == null &&
                  promo.targetCategoryId == null;

              if (matchesProduct || matchesCategory || isGlobal) {
                final lineGross = item.unitPrice * item.quantity;
                final discount = lineGross * pct;
                discountForThisPromo += discount;
                itemDiscounts[item.productId] =
                    (itemDiscounts[item.productId] ?? 0.0) + discount;
              }
            }
          }
          break;

        case PromotionType.fixedDiscount:
          if (promo.discountValue > 0) {
            for (final item in cart) {
              final matchesProduct = promo.targetProductId != null &&
                  item.productId == promo.targetProductId;
              final matchesCategory = promo.targetCategoryId != null &&
                  item.category?.toLowerCase() ==
                      promo.targetCategoryId!.toLowerCase();
              final isGlobal = promo.targetProductId == null &&
                  promo.targetCategoryId == null;

              if (matchesProduct || matchesCategory || isGlobal) {
                final discountPerUnit =
                    promo.discountValue.clamp(0.0, item.unitPrice);
                final discount = discountPerUnit * item.quantity;
                discountForThisPromo += discount;
                itemDiscounts[item.productId] =
                    (itemDiscounts[item.productId] ?? 0.0) + discount;
              }
            }
          }
          break;

        case PromotionType.comboPackage:
          break;
      }

      if (discountForThisPromo > 0) {
        totalDiscount += discountForThisPromo;
        appliedList.add(
          AppliedPromotionInfo(
            promotionId: promo.id,
            promotionName: promo.name,
            discountAmount: discountForThisPromo,
            targetProductId: promo.targetProductId,
            targetCategoryId: promo.targetCategoryId,
          ),
        );

        // If not stackable, stop evaluating further promotions
        if (!promo.isStackable) {
          break;
        }
      }
    }

    return PromotionEvaluationResult(
      totalDiscount: totalDiscount,
      itemDiscounts: itemDiscounts,
      appliedPromotions: appliedList,
    );
  }

  bool _isWithinDateRange(Promotion promo, DateTime now) {
    final nowMillis = now.millisecondsSinceEpoch;
    if (promo.startDate != null && nowMillis < promo.startDate!) return false;
    if (promo.endDate != null && nowMillis > promo.endDate!) return false;
    return true;
  }

  bool _isWithinSchedule(Promotion promo, DateTime now) {
    if (promo.daysOfWeek.isNotEmpty && !promo.daysOfWeek.contains(now.weekday)) {
      return false;
    }

    if (promo.startTime != null && promo.endTime != null) {
      final currentMinutes = now.hour * 60 + now.minute;
      final start = _parseTimeToMinutes(promo.startTime!);
      final end = _parseTimeToMinutes(promo.endTime!);

      if (start != null && end != null) {
        if (start <= end) {
          return currentMinutes >= start && currentMinutes <= end;
        } else {
          // Overnight window (e.g. 22:00 to 02:00)
          return currentMinutes >= start || currentMinutes <= end;
        }
      }
    }

    return true;
  }

  int? _parseTimeToMinutes(String timeStr) {
    final parts = timeStr.trim().split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return h * 60 + m;
  }
}
