import 'package:flutter_test/flutter_test.dart';
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
