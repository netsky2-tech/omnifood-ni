import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/usecases/inventory/sale_inventory_outcome_planner.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

void main() {
  final authority = _authority();
  final line = SaleInventoryLine.new;
  test(
    'classifies direct, recipe, compound, and no-impact lines from authority',
    () {
      final plan = SaleInventoryOutcomePlanner().plan(
        authority: authority,
        lines: [
          line(id: '3', productId: 'c', quantity: 1),
          line(id: '2', productId: 'r', quantity: 1),
          line(id: '1', productId: 'd', quantity: 1),
        ],
      );
      expect(
        plan.lines.map((value) => (value.classification, value.disposition)),
        const [
          (SaleLineClassification.simple, SaleLineDisposition.direct),
          (SaleLineClassification.prepared, SaleLineDisposition.recipe),
          (SaleLineClassification.compound, SaleLineDisposition.recipe),
        ],
      );
      expect(plan.outcome, InvoiceInventoryOutcome.applied);
    },
  );
  test('uses exact sorted deciding line IDs and rejects ambiguous plans', () {
    final planner = SaleInventoryOutcomePlanner();
    final noImpact = planner.plan(
      authority: authority,
      lines: [
        line(id: 'z', productId: 'n', quantity: 1),
        line(id: 'a', productId: 'n', quantity: 1),
      ],
    );
    final pending = planner.plan(
      authority: authority,
      lines: [
        line(id: 'z', productId: 'd', quantity: 1),
        line(id: 'b', productId: 'p', quantity: 1),
        line(id: 'a', productId: 'p', quantity: 1),
      ],
    );
    expect(noImpact.outcome, InvoiceInventoryOutcome.appliedNoInventoryImpact);
    expect(noImpact.reason!.lineIds, const ['a', 'z']);
    expect(pending.outcome, InvoiceInventoryOutcome.appliedInventoryPending);
    expect(pending.reason!.lineIds, const ['a', 'b']);
    expect(
      () => planner.plan(
        authority: authority,
        lines: [line(id: 'a', productId: 'missing', quantity: 1)],
      ),
      throwsA(isA<SaleInventoryPlanningException>()),
    );
    expect(
      () => SaleInventoryOutcomePlan(
        lines: pending.lines,
        outcome: InvoiceInventoryOutcome.appliedInventoryPending,
        reason: InvoiceInventoryReason(
          code: InvoiceInventoryReasonCode.missingPublishedRecipe,
          lineIds: const ['a\u0000b'],
        ),
      ),
      throwsArgumentError,
    );
  });
}

ValidatedSaleInventoryAuthority
_authority() => ValidatedSaleInventoryAuthority.validate(
  context: const CheckoutAuthorityContext(
    checkoutId: 'co',
    offlineUserId: 'u',
    offlineTenantId: 't',
    provisionedTenantId: 't',
  ),
  products: const [
    AuthorityProduct(id: 'd', tenantId: 't'),
    AuthorityProduct(
      id: 'r',
      tenantId: 't',
      inventoryKind: AuthorityInventoryKind.prepared,
    ),
    AuthorityProduct(
      id: 'c',
      tenantId: 't',
      inventoryKind: AuthorityInventoryKind.compound,
    ),
    AuthorityProduct(id: 'n', tenantId: 't'),
    AuthorityProduct(
      id: 'p',
      tenantId: 't',
      inventoryKind: AuthorityInventoryKind.prepared,
    ),
  ],
  insumos: const [AuthorityInsumo(id: 'i', tenantId: 't')],
  mappings: const [
    AuthorityMapping(id: 'dm', tenantId: 't', productId: 'd', insumoId: 'i'),
    AuthorityMapping(id: 'cm', tenantId: 't', productId: 'c', insumoId: 'i'),
  ],
  recipes: const [
    AuthorityRecipe(id: 'rv', tenantId: 't', productId: 'r', isPublished: true),
    AuthorityRecipe(id: 'cv', tenantId: 't', productId: 'c', isPublished: true),
  ],
  components: const [
    AuthorityComponent(
      id: 'rc',
      tenantId: 't',
      recipeId: 'rv',
      insumoId: 'i',
      quantityPerSaleUnit: 1,
    ),
    AuthorityComponent(
      id: 'cc',
      tenantId: 't',
      recipeId: 'cv',
      insumoId: 'i',
      quantityPerSaleUnit: 1,
    ),
  ],
);
