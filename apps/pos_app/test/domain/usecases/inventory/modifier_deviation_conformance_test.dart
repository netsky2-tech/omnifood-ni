import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/usecases/inventory/modifier_deviation_resolver.dart';
import 'package:pos_app/domain/usecases/inventory/sub_recipe_bom_explosion.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

/// R28 / M4 — the terminal's side of the CONFORMANCE CONTRACT.
///
/// The vectors live in `fixtures/modifier-deviation/v1/vectors.json` and are
/// executed against BOTH implementations: this resolver (the terminal) and
/// the cloud's mirror. They are the same file, so the two sides cannot drift
/// apart without one of the two suites failing: the demand the cloud
/// recomputes and the demand the terminal sent are only comparable because
/// both mean the same thing.
void main() {
  final vectors = jsonDecode(
    File('../../fixtures/modifier-deviation/v1/vectors.json')
        .readAsStringSync(),
  ) as Map<String, dynamic>;

  final cases = (vectors['cases'] as List).cast<Map<String, dynamic>>();

  test('the shared contract is read', () {
    expect(vectors['version'], 'v1');
    expect(cases, isNotEmpty);
  });

  for (final testCase in cases) {
    test(testCase['name'] as String, () {
      final leaves = ((testCase['leaves'] as List).cast<Map<String, dynamic>>())
          .map(
            (leaf) => BomLeaf(
              insumoId: leaf['insumoId'] as String,
              quantityPerSaleUnit: (leaf['quantityPerSaleUnit'] as num).toDouble(),
              rootComponentId: leaf['rootComponentId'] as String?,
            ),
          )
          .toList();
      final rootComponents =
          ((testCase['rootComponents'] as List).cast<Map<String, dynamic>>())
              .map(
                (component) => AuthorityComponent(
                  id: component['id'] as String,
                  tenantId: 't1',
                  recipeId: 'rec-1',
                  insumoId: component['insumoId'] as String,
                  quantityPerSaleUnit:
                      (component['quantityPerSaleUnit'] as num).toDouble(),
                ),
              )
              .toList();
      final insumosById = <String, AuthorityInsumo>{
        for (final insumo
            in ((testCase['tenantInsumos'] as List).cast<Map<String, dynamic>>()))
          insumo['id'] as String: AuthorityInsumo(
            id: insumo['id'] as String,
            tenantId: 't1',
            consumptionUom: insumo['consumptionUom'] as String,
            // The catalog's active state travels with the insumo: an effect
            // that points at a deactivated insumo does not apply.
            isActive: (insumo['isActive'] as bool?) ?? true,
          ),
      };
      final modifiers = ((testCase['modifiers'] as List)
              .cast<Map<String, dynamic>>())
          .map(
            (modifier) => Modifier(
              id: (modifier['optionId'] as String?) ?? 'opt',
              name: 'Opción',
              extraPrice: 0,
              optionId: modifier['optionId'] as String?,
              inventoryEffect: (modifier['inventoryEffect'] as String?) ?? 'NONE',
              effectInsumoId: modifier['effectInsumoId'] as String?,
              effectTargetInsumoId: modifier['effectTargetInsumoId'] as String?,
              effectQuantity: (modifier['effectQuantity'] as num?)?.toDouble(),
              effectFactor: (modifier['effectFactor'] as num?)?.toDouble(),
            ),
          )
          .toList();

      final resolution = const ModifierDeviationResolver().resolve(
        leaves: leaves,
        rootComponents: rootComponents,
        modifiers: modifiers,
        insumosById: insumosById,
      );

      // The demand, insumo by insumo. An insumo the deviation removed is
      // ABSENT (not zero): the demand did not include it.
      final demand = <String, double>{};
      for (final leaf in resolution.leaves) {
        demand[leaf.insumoId] = leaf.quantityPerSaleUnit;
      }
      final expectedDemand = <String, double>{
        for (final entry in (testCase['expectedDemand'] as Map).entries)
          entry.key as String: (entry.value as num).toDouble(),
      };
      expect(demand, equals(expectedDemand));

      final expectedOutcomes =
          (testCase['expectedOutcomes'] as List).cast<Map<String, dynamic>>();
      expect(
        resolution.effects.map((effect) => {
              'optionId': effect.optionId,
              'effect': effect.effect,
              'applied': effect.applied,
              if (effect.skipReason != null)
                'skipReason': effect.skipReason!.wireName,
            }).toList(),
        equals(expectedOutcomes),
      );
    });
  }
}
