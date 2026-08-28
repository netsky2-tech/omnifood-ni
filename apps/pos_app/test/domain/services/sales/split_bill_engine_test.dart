import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/sales/split_bill_engine.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';

void main() {
  group('SplitBillEngine - TDD & Triangulation (Equal & Itemized Splits)', () {
    const commercialRate = 36.50;

    group('Equal Split (By Covers / Partes Iguales)', () {
      test('Case 1 (Triangulation): 1 cover equals exact original total', () {
        final result = SplitBillEngine.splitEqual(
          subtotalNio: 500.00,
          taxNio: 75.00,
          tipNio: 50.00,
          discountNio: 0.00,
          coverCount: 1,
          commercialRate: commercialRate,
        );

        expect(result.shares.length, 1);
        expect(result.shares[0].shareIndex, 1);
        expect(result.shares[0].subtotalNio, 500.00);
        expect(result.shares[0].taxNio, 75.00);
        expect(result.shares[0].tipNio, 50.00);
        expect(result.shares[0].totalNio, 625.00);
        expect(result.shares[0].totalUsd, closeTo(625.00 / 36.50, 0.01));
        expect(result.totalDistributedNio, 625.00);
      });

      test('Case 2 (Triangulation): 2 covers split clean 50% without remainder', () {
        final result = SplitBillEngine.splitEqual(
          subtotalNio: 1000.00,
          taxNio: 150.00,
          tipNio: 100.00,
          discountNio: 50.00,
          coverCount: 2,
          commercialRate: commercialRate,
        );

        expect(result.shares.length, 2);
        // Total = 1000 - 50 + 150 + 100 = 1200 -> 600 per share
        expect(result.shares[0].totalNio, 600.00);
        expect(result.shares[1].totalNio, 600.00);
        expect(result.shares[0].subtotalNio, 500.00);
        expect(result.shares[1].subtotalNio, 500.00);
        expect(result.shares[0].discountNio, 25.00);
        expect(result.shares[1].discountNio, 25.00);
        expect(result.shares[0].taxNio, 75.00);
        expect(result.shares[1].taxNio, 75.00);
        expect(result.shares[0].tipNio, 50.00);
        expect(result.shares[1].tipNio, 50.00);
        expect(result.totalDistributedNio, 1200.00);
      });

      test('Case 3 (Triangulation - Centavo Remainder): 3 covers dividing C\$ 100.00 distributes 1 cent remainder', () {
        final result = SplitBillEngine.splitEqual(
          subtotalNio: 86.96,
          taxNio: 13.04,
          tipNio: 0.00,
          discountNio: 0.00,
          coverCount: 3,
          commercialRate: commercialRate,
        );

        expect(result.shares.length, 3);
        // 100 / 3 = 33.3333... -> 33.34 + 33.33 + 33.33 = 100.00
        final totalSum = result.shares.fold<double>(0.0, (acc, s) => acc + s.totalNio);
        expect(double.parse(totalSum.toStringAsFixed(2)), 100.00);
        expect(result.shares[0].totalNio, 33.34);
        expect(result.shares[1].totalNio, 33.33);
        expect(result.shares[2].totalNio, 33.33);
        expect(result.totalDistributedNio, 100.00);
      });

      test('Case 4 (Triangulation - Complex 7 Covers): C\$ 2,450.75 split among 7 guests', () {
        final result = SplitBillEngine.splitEqual(
          subtotalNio: 2000.00,
          taxNio: 300.00,
          tipNio: 200.00,
          discountNio: 49.25,
          coverCount: 7,
          commercialRate: commercialRate,
        );

        // Total = 2000 - 49.25 + 300 + 200 = 2450.75
        expect(result.shares.length, 7);
        final sumTotals = result.shares.fold<double>(0.0, (acc, s) => acc + s.totalNio);
        expect(double.parse(sumTotals.toStringAsFixed(2)), 2450.75);
        expect(result.totalDistributedNio, 2450.75);
      });

      test('Case 5 (Validation): Invalid cover counts throw ArgumentError', () {
        expect(
          () => SplitBillEngine.splitEqual(
            subtotalNio: 100.00,
            taxNio: 15.00,
            tipNio: 0.00,
            discountNio: 0.00,
            coverCount: 0,
            commercialRate: commercialRate,
          ),
          throwsArgumentError,
        );

        expect(
          () => SplitBillEngine.splitEqual(
            subtotalNio: 100.00,
            taxNio: 15.00,
            tipNio: 0.00,
            discountNio: 0.00,
            coverCount: -2,
            commercialRate: commercialRate,
          ),
          throwsArgumentError,
        );
      });
    });

    group('Itemized Split (By Selected Items / Por Ítems)', () {
      const itemBeer = CartItem(
        productId: 'prod-beer',
        productName: 'Toña 350ml',
        unitPrice: 60.00,
        quantity: 2,
        taxRate: 0.15,
      ); // Subtotal: 120, Tax: 18.00, Total: 138.00

      const itemBurger = CartItem(
        productId: 'prod-burger',
        productName: 'Hamburguesa Clásica',
        unitPrice: 200.00,
        quantity: 1,
        taxRate: 0.15,
      ); // Subtotal: 200, Tax: 30.00, Total: 230.00

      const itemDessert = CartItem(
        productId: 'prod-dessert',
        productName: 'Tres Leches',
        unitPrice: 80.00,
        quantity: 1,
        taxRate: 0.0, // Exento
      ); // Subtotal: 80, Tax: 0.00, Total: 80.00

      test('Case 6 (Triangulation): 2 Shares with distinct items & suggested 10% tip per share', () {
        final sharesInput = [
          const ItemizedShareInput(
            shareIndex: 1,
            label: 'Comensal 1 (Cervezas)',
            items: [itemBeer],
            tipType: TipType.suggestedTenPercent,
          ),
          const ItemizedShareInput(
            shareIndex: 2,
            label: 'Comensal 2 (Comida + Postre)',
            items: [itemBurger, itemDessert],
            tipType: TipType.suggestedTenPercent,
          ),
        ];

        final result = SplitBillEngine.splitByItems(
          shares: sharesInput,
          commercialRate: commercialRate,
        );

        expect(result.shares.length, 2);

        // Share 1: Subtotal 120.00, Tax 18.00, Tip (10% of 120) = 12.00 -> Total 150.00
        final s1 = result.shares[0];
        expect(s1.subtotalNio, 120.00);
        expect(s1.taxNio, 18.00);
        expect(s1.tipNio, 12.00);
        expect(s1.totalNio, 150.00);

        // Share 2: Subtotal 280.00 (200 + 80), Tax 30.00 (Burger only), Tip (10% of 280) = 28.00 -> Total 338.00
        final s2 = result.shares[1];
        expect(s2.subtotalNio, 280.00);
        expect(s2.taxNio, 30.00);
        expect(s2.tipNio, 28.00);
        expect(s2.totalNio, 338.00);

        // Grand total distributed
        expect(result.totalDistributedNio, 488.00); // 150 + 338
      });

      test('Case 7 (Triangulation): Itemized split preserves single item total invariant without tip', () {
        final sharesInput = [
          const ItemizedShareInput(
            shareIndex: 1,
            label: 'Comensal 1',
            items: [itemBeer],
            tipType: TipType.none,
          ),
          const ItemizedShareInput(
            shareIndex: 2,
            label: 'Comensal 2',
            items: [itemBurger],
            tipType: TipType.none,
          ),
          const ItemizedShareInput(
            shareIndex: 3,
            label: 'Comensal 3',
            items: [itemDessert],
            tipType: TipType.none,
          ),
        ];

        final result = SplitBillEngine.splitByItems(
          shares: sharesInput,
          commercialRate: commercialRate,
        );

        expect(result.shares.length, 3);
        expect(result.shares[0].totalNio, 138.00);
        expect(result.shares[1].totalNio, 230.00);
        expect(result.shares[2].totalNio, 80.00);
        expect(result.totalDistributedNio, 448.00); // 138 + 230 + 80
      });
    });
  });
}
