import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/usecases/inventory/sale_inventory_outcome_planner.dart';
import 'package:pos_app/domain/usecases/inventory/sale_time_inventory_snapshot_builder.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

void main() {
  final authority = _authority();
  final planner = SaleInventoryOutcomePlanner();
  final builder = SaleTimeInventorySnapshotBuilder();

  test('freezes sorted recipe bindings and canonical inventory fragment', () {
    final result = builder.build(
      authority: authority,
      plan: planner.plan(
        authority: authority,
        lines: const [
          SaleInventoryLine(id: 'line-z', productId: 'drink', quantity: 1),
          SaleInventoryLine(id: 'line-a', productId: 'meal', quantity: 2),
        ],
      ),
      terminalId: 'terminal-1',
      invoiceId: 'invoice-1',
      catalogRevision: 'revision-1',
      movementKind: 'SALE',
    );

    expect(result.lines.map((line) => line.lineId), ['line-a', 'line-z']);
    final recipe = result.lines.first.snapshot;
    expect(recipe.recipeVersionId, 'recipe-1');
    expect(
      recipe.bindings.map(
        (binding) => (
          binding.bindingOrdinal,
          binding.insumoId,
          binding.recipeComponentId,
        ),
      ),
      [(0, 'insumo-a', 'component-a'), (1, 'insumo-z', 'component-z')],
    );
    expect(
      recipe.bindings.first.saleCorrelationId,
      'a21491caf7f5c3703998a7df30e75542aba818dd0a24f5f070b3a8b260581124',
    );
    expect(
      result.canonicalInventoryPayloadFragment,
      '{"inventoryOutcome":"APPLIED","inventoryOutcomeReason":null,"items":[{"inventorySnapshot":{"bindings":[{"bindingOrdinal":0,"insumoId":"insumo-a","quantityPerSaleUnit":1.5,"recipeComponentId":"component-a","saleCorrelationId":"a21491caf7f5c3703998a7df30e75542aba818dd0a24f5f070b3a8b260581124"},{"bindingOrdinal":1,"insumoId":"insumo-z","quantityPerSaleUnit":2.0,"recipeComponentId":"component-z","saleCorrelationId":"b39563468b215191ef4a9bea4fdb20e0dc34e39169f074d4351533e7f60d2ba6"}],"catalogRevision":"revision-1","classification":"PREPARED","disposition":"RECIPE","mappingVersionId":null,"reasonCode":null,"recipeVersionId":"recipe-1"},"inventorySnapshotVersion":"SALE_TIME_V1","invoiceItemId":"line-a"},{"inventorySnapshot":{"bindings":[{"bindingOrdinal":0,"insumoId":"insumo-d","quantityPerSaleUnit":1.0,"recipeComponentId":null,"saleCorrelationId":"b19b8e665d677878ede9baf6afc2dd2f05516a7562cd369ac62de90861e8069f"}],"catalogRevision":"revision-1","classification":"SIMPLE","disposition":"DIRECT","mappingVersionId":"mapping-1","reasonCode":null,"recipeVersionId":null},"inventorySnapshotVersion":"SALE_TIME_V1","invoiceItemId":"line-z"}],"policyVersion":"SALE_TIME_V1"}',
    );
  });

  test(
    'R28: the snapshot carries the demand the modifiers actually produced',
    () {
      // The almond milk REPLACES the recipe's whole milk: the whole milk is
      // not downloaded and the substitute is, in the component's own
      // quantity. The snapshot is what the cloud will apply (M4 recomputes
      // it and compares).
      final milkAuthority = _authorityWithMilk();
      final result = builder.build(
        authority: milkAuthority,
        plan: planner.plan(
          authority: milkAuthority,
          lines: const [
            SaleInventoryLine(
              id: 'line-swap',
              productId: 'meal',
              quantity: 1,
              modifiers: [
                Modifier(
                  id: 'opt-almendras',
                  name: 'Leche: Almendras',
                  extraPrice: 10,
                  optionId: 'opt-almendras',
                  groupId: 'grp-leche',
                  inventoryEffect: 'SWAP',
                  effectTargetInsumoId: 'insumo-leche',
                  effectInsumoId: 'insumo-almendras',
                ),
              ],
            ),
          ],
        ),
        terminalId: 'terminal-1',
        invoiceId: 'invoice-1',
        catalogRevision: 'revision-1',
        movementKind: 'SALE',
      );

      final bindings = result.lines.first.snapshot.bindings;
      // The whole milk is GONE from the demand...
      expect(
        bindings.any((binding) => binding.insumoId == 'insumo-leche'),
        isFalse,
      );
      // ...and the substitute is there, in the component's own quantity,
      // WITHOUT a recipe component id (it is not a component of the recipe:
      // the backend validates that id against the root recipe's details).
      final substitute = bindings.firstWhere(
        (binding) => binding.insumoId == 'insumo-almendras',
      );
      expect(substitute.quantityPerSaleUnit, 150);
      expect(substitute.recipeComponentId, isNull);
      // The rest of the recipe is untouched.
      expect(
        bindings.any((binding) => binding.insumoId == 'insumo-a'),
        isTrue,
      );
    },
  );

  test(
    'R28: an effect whose insumo is not in the catalog leaves the demand alone',
    () {
      // THE SOHO GUARANTEE: a company that has not registered the insumo
      // keeps selling exactly as before. The effect does not apply, the
      // recipe's demand is unchanged, and the sale is NOT blocked.
      final milkAuthority = _authorityWithMilk();
      final result = builder.build(
        authority: milkAuthority,
        plan: planner.plan(
          authority: milkAuthority,
          lines: const [
            SaleInventoryLine(
              id: 'line-swap',
              productId: 'meal',
              quantity: 1,
              modifiers: [
                Modifier(
                  id: 'opt-almendras',
                  name: 'Leche: Almendras',
                  extraPrice: 10,
                  optionId: 'opt-almendras',
                  inventoryEffect: 'SWAP',
                  effectTargetInsumoId: 'insumo-leche',
                  effectInsumoId: 'insumo-que-no-existe',
                ),
              ],
            ),
          ],
        ),
        terminalId: 'terminal-1',
        invoiceId: 'invoice-1',
        catalogRevision: 'revision-1',
        movementKind: 'SALE',
      );

      final bindings = result.lines.first.snapshot.bindings;
      // The whole milk is still consumed: the swap did not apply.
      expect(
        bindings.any((binding) => binding.insumoId == 'insumo-leche'),
        isTrue,
      );
      expect(
        bindings.any((binding) => binding.insumoId == 'insumo-que-no-existe'),
        isFalse,
      );
      // And the sale is NOT pending: it applies with the recipe's demand.
      expect(result.outcome, InvoiceInventoryOutcome.applied);
    },
  );

  test(
    'preserves pending/no-impact snapshots without bindings or correlations',
    () {
      final result = builder.build(
        authority: authority,
        plan: planner.plan(
          authority: authority,
          lines: const [
            SaleInventoryLine(
              id: 'pending',
              productId: 'pending-product',
              quantity: 1,
            ),
            SaleInventoryLine(
              id: 'no-impact',
              productId: 'unmapped',
              quantity: 1,
            ),
          ],
        ),
        terminalId: 'terminal-1',
        invoiceId: 'invoice-1',
        catalogRevision: 'revision-1',
        movementKind: 'SALE',
      );

      expect(result.outcome, InvoiceInventoryOutcome.appliedInventoryPending);
      expect(result.lines.expand((line) => line.snapshot.bindings), isEmpty);
      expect(
        result.lines.first.snapshot.reasonCode,
        'NO_EXPLICIT_INSUMO_MAPPING',
      );
      expect(result.lines.last.snapshot.reasonCode, 'MISSING_PUBLISHED_RECIPE');
    },
  );

  test(
    'structural correlation inputs cannot collide through delimiter characters',
    () {
      final first = builder.build(
        authority: authority,
        plan: planner.plan(
          authority: authority,
          lines: const [
            SaleInventoryLine(id: 'line', productId: 'drink', quantity: 1),
          ],
        ),
        terminalId: 'x|invoice',
        invoiceId: 'id',
        catalogRevision: 'revision',
        movementKind: 'SALE',
      );
      final second = builder.build(
        authority: authority,
        plan: planner.plan(
          authority: authority,
          lines: const [
            SaleInventoryLine(id: 'line', productId: 'drink', quantity: 1),
          ],
        ),
        terminalId: 'x',
        invoiceId: 'invoice|id',
        catalogRevision: 'revision',
        movementKind: 'SALE',
      );

      expect(
        first.lines.single.snapshot.bindings.single.saleCorrelationId,
        isNot(second.lines.single.snapshot.bindings.single.saleCorrelationId),
      );
    },
  );
}

ValidatedSaleInventoryAuthority _authority() =>
    ValidatedSaleInventoryAuthority.validate(
      context: const CheckoutAuthorityContext(
        checkoutId: 'checkout',
        offlineUserId: 'user',
        offlineTenantId: 'tenant',
        provisionedTenantId: 'tenant',
      ),
      products: const [
        AuthorityProduct(
          id: 'meal',
          tenantId: 'tenant',
          inventoryKind: AuthorityInventoryKind.prepared,
        ),
        AuthorityProduct(id: 'drink', tenantId: 'tenant'),
        AuthorityProduct(id: 'unmapped', tenantId: 'tenant'),
        AuthorityProduct(
          id: 'pending-product',
          tenantId: 'tenant',
          inventoryKind: AuthorityInventoryKind.compound,
        ),
      ],
      insumos: const [
        AuthorityInsumo(id: 'insumo-a', tenantId: 'tenant'),
        AuthorityInsumo(id: 'insumo-z', tenantId: 'tenant'),
        AuthorityInsumo(id: 'insumo-d', tenantId: 'tenant'),
      ],
      mappings: const [
        AuthorityMapping(
          id: 'mapping-1',
          tenantId: 'tenant',
          productId: 'drink',
          insumoId: 'insumo-d',
        ),
      ],
      recipes: const [
        AuthorityRecipe(
          id: 'recipe-1',
          tenantId: 'tenant',
          productId: 'meal',
          isPublished: true,
        ),
      ],
      components: const [
        AuthorityComponent(
          id: 'component-z',
          tenantId: 'tenant',
          recipeId: 'recipe-1',
          insumoId: 'insumo-z',
          quantityPerSaleUnit: 2,
        ),
        AuthorityComponent(
          id: 'component-a',
          tenantId: 'tenant',
          recipeId: 'recipe-1',
          insumoId: 'insumo-a',
          quantityPerSaleUnit: 1.5,
        ),
      ],
    );

/// R28: the authority of a recipe with whole milk, plus the almond milk
/// that can replace it. A SEPARATE authority, so the frozen expectations of
/// the other specs stay untouched.
ValidatedSaleInventoryAuthority _authorityWithMilk() =>
    ValidatedSaleInventoryAuthority.validate(
      context: const CheckoutAuthorityContext(
        checkoutId: 'checkout',
        offlineUserId: 'user',
        offlineTenantId: 'tenant',
        provisionedTenantId: 'tenant',
      ),
      products: const [
        AuthorityProduct(
          id: 'meal',
          tenantId: 'tenant',
          inventoryKind: AuthorityInventoryKind.prepared,
        ),
      ],
      insumos: const [
        AuthorityInsumo(id: 'insumo-a', tenantId: 'tenant'),
        AuthorityInsumo(
          id: 'insumo-leche',
          tenantId: 'tenant',
          consumptionUom: 'ML',
        ),
        AuthorityInsumo(
          id: 'insumo-almendras',
          tenantId: 'tenant',
          consumptionUom: 'ML',
        ),
      ],
      mappings: const [],
      recipes: const [
        AuthorityRecipe(
          id: 'recipe-1',
          tenantId: 'tenant',
          productId: 'meal',
          isPublished: true,
        ),
      ],
      components: const [
        AuthorityComponent(
          id: 'component-a',
          tenantId: 'tenant',
          recipeId: 'recipe-1',
          insumoId: 'insumo-a',
          quantityPerSaleUnit: 1.5,
        ),
        AuthorityComponent(
          id: 'component-leche',
          tenantId: 'tenant',
          recipeId: 'recipe-1',
          insumoId: 'insumo-leche',
          quantityPerSaleUnit: 150,
        ),
      ],
    );
