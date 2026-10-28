import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/ui/features/sales/widgets/inventory_divergence_banner.dart';
import 'package:provider/provider.dart';

/// Minimal fake so the banner's best-effort refresh path can run without a
/// database.
class _FakeSalesRepository implements SalesRepository {
  _FakeSalesRepository(this.divergenceCount);

  final int divergenceCount;

  @override
  Future<int> getInventoryDivergenceCount() async => divergenceCount;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// FD-01 (openspec/changes/fiscal-no-se-congela-por-inventario): the sales
/// the cloud applied while DECLARING that part of the stock was not backed.
///
/// The banner is a MESSAGE, never a control: it must not look like an error
/// that stops the register, and it must be silent when there is nothing to
/// reconcile.
void main() {
  group('InventoryDivergenceBanner (FD-01)', () {
    testWidgets('renders nothing when there is nothing to reconcile', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: InventoryDivergenceBanner(initialCount: 0)),
        ),
      );

      expect(find.byType(Text), findsNothing);
    });

    testWidgets('says the sale went through and the difference waits', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: InventoryDivergenceBanner(initialCount: 2)),
        ),
      );

      expect(find.textContaining('2 ventas'), findsOneWidget);
      expect(
        find.textContaining('quedó facturada'),
        findsOneWidget,
      );
      expect(
        find.textContaining('backoffice'),
        findsOneWidget,
      );
    });

    testWidgets('reads the count from the repository (best effort)', (
      tester,
    ) async {
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<SalesRepository>.value(
              value: _FakeSalesRepository(4),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: InventoryDivergenceBanner()),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.textContaining('4 ventas'), findsOneWidget);
    });

    testWidgets('a failing repository never crashes the register', (
      tester,
    ) async {
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<SalesRepository>.value(
              value: _ThrowingSalesRepository(),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: InventoryDivergenceBanner()),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));

      expect(tester.takeException(), isNull);
      expect(find.byType(Text), findsNothing);
    });
  });
}

class _ThrowingSalesRepository implements SalesRepository {
  @override
  Future<int> getInventoryDivergenceCount() async =>
      throw StateError('offline');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
