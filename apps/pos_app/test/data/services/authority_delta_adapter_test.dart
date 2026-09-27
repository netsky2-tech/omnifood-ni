import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/authority_delta_adapter.dart';

/// Unit tests for the inbound `recipeVersions` delta adapter (#519 U2).
///
/// The adapter is pure: no I/O, no database, no clock. It adapts the nested
/// delta wire shape produced by the backend (each version carries its own
/// components and insumo authority closure) into the flat
/// `AuthorityHydrationPayload` document `AuthorityHydrationPayload.fromJson`
/// requires.
void main() {
  // A minimal valid version row in the nested wire shape.
  Map<String, dynamic> versionRow({
    String id = 'rv-1',
    String tenantId = 'tenant-alpha',
    String productId = 'prod-pizza',
    String effectiveAt = '2026-09-01T00:00:00Z',
    List<dynamic> components = const [],
    List<dynamic> insumos = const [],
  }) {
    return {
      'id': id,
      'recipeVersionId': id,
      'tenantId': tenantId,
      'productId': productId,
      'versionNumber': 1,
      'isActive': true,
      'publicationState': 'PUBLISHED',
      'effectiveAt': effectiveAt,
      'effectiveUntil': null,
      'yieldQuantity': 1.0,
      'technicalShrinkPct': 0.0,
      'publishedAt': null,
      'createdAt': '2026-08-30T00:00:00Z',
      'components': components,
      'insumos': insumos,
    };
  }

  Map<String, dynamic> componentRow({
    String id = 'comp-1',
    String tenantId = 'tenant-alpha',
    String versionId = 'rv-1',
    int componentOrdinal = 0,
    String ingredientName = 'Grated Mozzarella',
    String insumoId = 'ins-1',
  }) {
    return {
      'id': id,
      'tenantId': tenantId,
      'recipeVersionId': versionId,
      'componentOrdinal': componentOrdinal,
      'insumoId': insumoId,
      'quantityPerSaleUnit': 0.25,
      'grossQuantity': 0.2,
      'technicalShrinkPct': 0.0,
      'ingredientName': ingredientName,
      'ingredientType': 'DIRECT',
      'componentUom': 'KG',
      'referenceVersionId': null,
    };
  }

  Map<String, dynamic> closureInsumoRow({
    String id = 'ins-1',
    String tenantId = 'tenant-alpha',
    String name = 'Mozzarella',
    String uom = 'KG',
  }) {
    return {'id': id, 'tenantId': tenantId, 'name': name, 'uom': uom};
  }

  group('rename table (delta wire names -> hydrator flat names)', () {
    test('maps effectiveAt -> effectiveFrom on the version', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(effectiveAt: '2026-10-01T00:00:00Z'),
      ]);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      expect(
        adaptation.payload!.recipeVersions.single.effectiveFrom,
        '2026-10-01T00:00:00Z',
      );
    });

    test('maps componentOrdinal -> ordinal on the component', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(components: [componentRow(componentOrdinal: 3)]),
      ]);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      expect(adaptation.payload!.components.single.ordinal, 3);
    });

    test('maps ingredientName -> componentName on the component', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          components: [componentRow(ingredientName: 'Queso Rallado')],
        ),
      ]);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      expect(adaptation.payload!.components.single.componentName,
          'Queso Rallado');
    });
  });

  group('U1 closure payoff', () {
    test(
        'a version whose closure references an insumo absent from the '
        'top-level insumos delta hydrates completely', () {
      // The incremental `insumos` delta does NOT contain ins-closure:
      // the only authority facts for it travel inside the version closure.
      final deltas = {
        'insumos': [
          closureInsumoRow(id: 'ins-top-level', name: 'Top Level Only'),
        ],
        'recipeVersions': [
          versionRow(
            insumos: [closureInsumoRow(id: 'ins-closure', name: 'Closure')],
            components: [
              componentRow(id: 'comp-1', versionId: 'rv-1'),
            ],
          ),
        ],
      };

      final adaptation = adaptAuthorityDelta(deltas['recipeVersions']);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      final insumoIds =
          adaptation.payload!.insumos.map((i) => i.id).toSet();
      // The closure fact hydrates...
      expect(insumoIds, contains('ins-closure'));
      // ...and the adapter never pulls from the top-level delta for
      // hydration purposes.
      expect(insumoIds, isNot(contains('ins-top-level')));
      expect(adaptation.payload!.recipeVersions, hasLength(1));
      expect(adaptation.payload!.components, hasLength(1));
    });
  });

  group('nested components -> flat root', () {
    test(
        'components land at root with correct recipeVersionId linkage and '
        'closure insumos are de-duplicated by id across versions', () {
      final sharedInsumo = closureInsumoRow(id: 'ins-shared');
      final adaptation = adaptAuthorityDelta([
        versionRow(
          id: 'rv-1',
          insumos: [sharedInsumo],
          components: [
            componentRow(
                id: 'comp-1a', versionId: 'rv-1', componentOrdinal: 1),
            componentRow(
                id: 'comp-1b', versionId: 'rv-1', componentOrdinal: 0),
          ],
        ),
        versionRow(
          id: 'rv-2',
          insumos: [
            // Deliberate wire duplication of the same closure fact.
            closureInsumoRow(id: 'ins-shared'),
            closureInsumoRow(id: 'ins-other', name: 'Harina'),
          ],
          components: [
            componentRow(
                id: 'comp-2a',
                versionId: 'rv-2',
                componentOrdinal: 0,
                ingredientName: 'Harina'),
          ],
        ),
      ]);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      final payload = adaptation.payload!;

      // All components at the root, linked to their parent version.
      expect(payload.components, hasLength(3));
      final byVersion = <String, List<int>>{};
      for (final c in payload.components) {
        byVersion.putIfAbsent(c.versionId, () => []).add(c.ordinal);
      }
      expect(byVersion.keys.toSet(), {'rv-1', 'rv-2'});
      // componentOrdinal is the authority for order: within rv-1 the
      // component with ordinal 0 comes before ordinal 1 regardless of the
      // order it arrived on the wire.
      expect(byVersion['rv-1'], orderedEquals([0, 1]));

      // Closure insumos de-duplicated across versions by id.
      final insumoNames = payload.insumos.map((i) => i.name).toList()..sort();
      expect(insumoNames, ['Harina', 'Mozzarella']);
      expect(payload.insumos, hasLength(2));
      expect(adaptation.versionCount, 2);
      expect(adaptation.componentCount, 3);
      expect(adaptation.insumoCount, 2);
    });

    test('quantityPerSaleUnit is not mapped into the payload', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(components: [componentRow()]),
      ]);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      // grossQuantity is the authority quantity for hydration.
      expect(adaptation.payload!.components.single.grossQuantity, 0.2);
    });
  });

  group('fail-closed', () {
    test('empty input is an empty success, not an exception', () {
      expect(adaptAuthorityDelta(null).isSuccess, isTrue);
      expect(adaptAuthorityDelta(null).versionCount, 0);
      expect(adaptAuthorityDelta(const []).isSuccess, isTrue);
      expect(adaptAuthorityDelta(const []).insumoCount, 0);
    });

    test('mixed tenantId across rows hydrates nothing and reports a reason',
        () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          tenantId: 'tenant-alpha',
          insumos: [closureInsumoRow(tenantId: 'tenant-alpha')],
          components: [
            componentRow(tenantId: 'tenant-beta'),
          ],
        ),
      ]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
      expect(adaptation.failureReason, contains('tenant'));
    });

    test('missing tenant on a row hydrates nothing and reports a reason', () {
      final row = versionRow();
      row['tenantId'] = null;

      final adaptation = adaptAuthorityDelta([row]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
    });

    test('a malformed component row refuses the WHOLE version', () {
      // comp-1 is valid; comp-2 lost its insumoId on the wire. A partial
      // hydration (comp-1 without comp-2) would silently under-deduct.
      final adaptation = adaptAuthorityDelta([
        versionRow(
          insumos: [closureInsumoRow()],
          components: [
            componentRow(id: 'comp-1'),
            componentRow(id: 'comp-2')..remove('insumoId'),
          ],
        ),
      ]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
      expect(adaptation.failureReason, contains('component'));
    });

    test('a row that is not a Map refuses the payload', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(),
        'not-a-map',
      ]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
    });

    test('a version without required identity refuses the payload', () {
      final row = versionRow()..remove('productId');

      final adaptation = adaptAuthorityDelta([row]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
    });

    test('a version without effectiveAt refuses the payload', () {
      final row = versionRow()..remove('effectiveAt');

      final adaptation = adaptAuthorityDelta([row]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
    });

    test(
        'conflicting closure facts for the same insumo id refuse the payload',
        () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          id: 'rv-1',
          insumos: [closureInsumoRow(id: 'ins-1', uom: 'KG')],
        ),
        versionRow(
          id: 'rv-2',
          insumos: [closureInsumoRow(id: 'ins-1', uom: 'GR')],
        ),
      ]);

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, isNotNull);
    });
  });

  group('#613 per-record inert verdict', () {
    test(
        'a structurally valid recipe for a SIMPLE product is classified per '
        'record and returned alongside success, not refused', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          id: 'rv-good',
          productId: 'prod-pizza',
          insumos: [closureInsumoRow(id: 'ins-1')],
          components: [componentRow(id: 'comp-1', versionId: 'rv-good')],
        ),
        versionRow(
          id: 'rv-inert',
          productId: 'prod-simple',
          insumos: [closureInsumoRow(id: 'ins-2', name: 'Harina')],
          components: [
            componentRow(
              id: 'comp-inert',
              versionId: 'rv-inert',
              insumoId: 'ins-2',
              ingredientName: 'Harina',
            ),
          ],
        ),
      ], productTypes: {
        'prod-pizza': 'PREPARED',
        'prod-simple': 'SIMPLE',
      });

      // The payload still succeeds: inertness is a verdict, not a refusal.
      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);

      // The good recipe hydrates with its component and closure.
      expect(
        adaptation.payload!.recipeVersions.map((v) => v.id).toList(),
        ['rv-good'],
      );
      expect(adaptation.payload!.components.single.versionId, 'rv-good');
      expect(adaptation.payload!.insumos.map((i) => i.id).toList(), ['ins-1']);

      // The inert recipe is reported exactly once, with its identity.
      expect(adaptation.inertRecipes, hasLength(1));
      expect(adaptation.inertRecipes.single.recipeVersionId, 'rv-inert');
      expect(adaptation.inertRecipes.single.productId, 'prod-simple');
      expect(adaptation.inertRecipes.single.tenantId, 'tenant-alpha');
      expect(adaptation.inertRecipeVersionIds, ['rv-inert']);
    });

    test(
        'closure insumos referenced only by inert recipes are excluded; '
        'shared closure insumos referenced by kept recipes survive', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          id: 'rv-good',
          productId: 'prod-pizza',
          insumos: [
            closureInsumoRow(id: 'ins-shared'),
            closureInsumoRow(id: 'ins-good-only', name: 'Queso'),
          ],
          components: [
            componentRow(
              id: 'comp-good',
              versionId: 'rv-good',
              insumoId: 'ins-shared',
            ),
          ],
        ),
        versionRow(
          id: 'rv-inert',
          productId: 'prod-simple',
          insumos: [
            closureInsumoRow(id: 'ins-shared'),
            closureInsumoRow(id: 'ins-inert-only', name: 'Harina'),
          ],
          components: [
            componentRow(
              id: 'comp-inert',
              versionId: 'rv-inert',
              insumoId: 'ins-inert-only',
              ingredientName: 'Harina',
            ),
          ],
        ),
      ], productTypes: {
        'prod-pizza': 'PREPARED',
        'prod-simple': 'SIMPLE',
      });

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      final insumoIds = adaptation.payload!.insumos.map((i) => i.id).toSet();
      // Referenced by the kept recipe's component: stays.
      expect(insumoIds, contains('ins-shared'));
      expect(insumoIds, contains('ins-good-only'));
      // Referenced only by the inert recipe: inert material, excluded.
      expect(insumoIds, isNot(contains('ins-inert-only')));
    });

    test(
        'without product-type evidence nothing is classified inert '
        '(backward compatible default)', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(id: 'rv-1', productId: 'prod-simple'),
      ]);

      expect(adaptation.isSuccess, isTrue, reason: adaptation.failureReason);
      expect(adaptation.inertRecipes, isEmpty);
      expect(adaptation.inertRecipeVersionIds, isEmpty);
      expect(adaptation.payload!.recipeVersions, hasLength(1));
    });

    test(
        'mixed tenant still refuses the WHOLE payload even when one of the '
        'rows would be inert', () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          id: 'rv-a',
          tenantId: 'tenant-alpha',
          productId: 'prod-simple',
        ),
        versionRow(
          id: 'rv-b',
          tenantId: 'tenant-beta',
          productId: 'prod-pizza',
        ),
      ], productTypes: {'prod-simple': 'SIMPLE'});

      // Structural refusal wins over per-record classification: an
      // untrusted payload is never partially applied nor partially verdicted.
      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, contains('tenant'));
      expect(adaptation.inertRecipes, isEmpty);
    });

    test(
        'an inert row with a malformed component still refuses the payload',
        () {
      final adaptation = adaptAuthorityDelta([
        versionRow(
          id: 'rv-inert',
          productId: 'prod-simple',
          insumos: [closureInsumoRow()],
          components: [
            componentRow(id: 'comp-bad', versionId: 'rv-inert')
              ..remove('insumoId'),
          ],
        ),
      ], productTypes: {'prod-simple': 'SIMPLE'});

      expect(adaptation.isSuccess, isFalse);
      expect(adaptation.payload, isNull);
      expect(adaptation.failureReason, contains('component'));
      expect(adaptation.inertRecipes, isEmpty);
    });
  });
}
