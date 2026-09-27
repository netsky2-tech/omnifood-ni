import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/inventory/authority_hydration_status.dart';
import 'package:pos_app/ui/features/sales/widgets/inventory_enrichment_warning_banner.dart';
import 'package:provider/provider.dart';

/// Minimal fake so the banner's best-effort refresh path (initialPendingCount
/// == null) can run without a database.
class _FakeSalesRepository implements SalesRepository {
  @override
  Future<int> getInventoryEnrichmentPendingCount() async => 3;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

AuthorityHydrationStatus _statusFor({
  Map<String, String> configs = const {},
  Map<String, int> insumoCounts = const {},
}) {
  return AuthorityHydrationStatus(
    readConfig: (key) async => {
      AuthorityHydrationStatus.tenantIdKey: 'tenant-alpha',
      ...configs,
    }[key],
    countAuthorityInsumos: (tenantId) async => insumoCounts[tenantId],
  );
}

Future<void> _pumpBanner(
  WidgetTester tester,
  AuthorityHydrationStatus status,
) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<SalesRepository>.value(value: _FakeSalesRepository()),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: InventoryEnrichmentWarningBanner(hydrationStatus: status),
        ),
      ),
    ),
  );
  // Flush the post-frame callback and the async best-effort refresh.
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  group('InventoryEnrichmentWarningBanner (Slice 11)', () {
    testWidgets('renders SizedBox.shrink when pending count is 0', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: InventoryEnrichmentWarningBanner(initialPendingCount: 0),
          ),
        ),
      );

      expect(
        find.byKey(const Key('inventory_enrichment_warning_banner')),
        findsNothing,
      );
    });

    testWidgets(
      'renders warning banner when pending count is greater than 0 without blocking UI',
      (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  InventoryEnrichmentWarningBanner(initialPendingCount: 3),
                  ElevatedButton(
                    key: Key('checkout_button'),
                    onPressed: null,
                    child: Text('Checkout'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(
          find.byKey(const Key('inventory_enrichment_warning_banner')),
          findsOneWidget,
        );
        expect(
          find.textContaining('3 ventas con inventario pendiente'),
          findsOneWidget,
        );
        // Checkout button remains present and unblocked
        expect(find.byKey(const Key('checkout_button')), findsOneWidget);
      },
    );

    group('#519 U5 three-state guard', () {
      Future<void> unmountBanner(WidgetTester tester) async {
        // Unmount so the banner's periodic refresh timer is cancelled.
        await tester.pumpWidget(const SizedBox.shrink());
      }

      testWidgets('notHydrated renders the actionable never-hydrated copy',
          (tester) async {
        // rows == 0 and hydration has NEVER completed for this terminal.
        await _pumpBanner(tester, _statusFor());

        expect(
          find.byKey(const Key('inventory_enrichment_warning_banner')),
          findsOneWidget,
        );
        expect(
          find.textContaining(
            'este terminal todavía no ha recibido su autoridad de recetas',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('no mueven inventario'), findsOneWidget);
        await unmountBanner(tester);
      });

      testWidgets(
          'hydrated with a REFUSED last pull stays silent (existing message '
          'byte-identical): yesterday\'s good hydration plus today\'s bad '
          'pull must NOT raise the never-hydrated alarm', (tester) async {
        await _pumpBanner(
          tester,
          _statusFor(
            configs: {
              AuthorityHydrationStatus.resultKey: 'refused',
              AuthorityHydrationStatus.reasonKey: 'mixed_tenant_delta',
              AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
            },
            insumoCounts: {'tenant-alpha': 7},
          ),
        );

        expect(
          find.byKey(const Key('inventory_enrichment_warning_banner')),
          findsOneWidget,
        );
        expect(
          find.text(
            '3 ventas con inventario pendiente de enriquecer (operación de venta normal activa)',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('no ha recibido su autoridad de recetas'),
          findsNothing,
        );
        await unmountBanner(tester);
      });

      testWidgets('hydratedEmpty keeps the existing pending-count message',
          (tester) async {
        // rows == 0 but a hydration HAS completed successfully: the tenant
        // genuinely has no published recipe authority. Informational only.
        await _pumpBanner(
          tester,
          _statusFor(
            configs: {
              AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
            },
          ),
        );

        expect(
          find.text(
            '3 ventas con inventario pendiente de enriquecer (operación de venta normal activa)',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('no ha recibido su autoridad de recetas'),
          findsNothing,
        );
        await unmountBanner(tester);
      });
    });
  });
}
