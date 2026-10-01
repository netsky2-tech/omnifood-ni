import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/usecases/inventory/sale_inventory_outcome_planner.dart';
import 'package:pos_app/domain/usecases/inventory/sale_time_inventory_snapshot_builder.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

class PreparedSaleInventoryResult {
  final Invoice invoice;
  final List<InvoiceItem> items;

  const PreparedSaleInventoryResult({
    required this.invoice,
    required this.items,
  });
}

class CheckoutInventoryPreparationService {
  final AppDatabase _database;

  const CheckoutInventoryPreparationService(this._database);

  Future<PreparedSaleInventoryResult> prepare({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required String offlineUserId,
    required String tenantId,
    required String terminalId,
  }) async {
    if (offlineUserId.trim().isEmpty || terminalId.trim().isEmpty) {
      throw const CheckoutAuthorityException();
    }
    if (tenantId.trim().isEmpty) {
      // A blank per-user tenant (e.g. staff rows whose users.tenant_id is NULL)
      // must not by itself force the legacy path: the terminal binding is the
      // authoritative tenant for the terminal's own inventory operations.
      final binding = await _database.localConfigDao.getConfigByKey('tenant_id');
      tenantId = binding?.value.trim() ?? '';
    }
    if (tenantId.isEmpty) {
      // Genuinely unbound terminals (never activated, no authority data) must
      // remain able to sell offline. Their sales stay on the repository's
      // legacy inventory path and never claim SALE_TIME_V1.
      return PreparedSaleInventoryResult(invoice: invoice, items: items);
    }

    final authorityDao = _database.authorityProjectionDao;
    final nowIso = invoice.createdAt.toUtc().toIso8601String();

    // Identity-keyed accumulation: the authority validator rejects any
    // repeated fact id, and the same product/recipe/component/insumo can
    // legitimately appear in several cart lines (the cart only merges lines
    // when product, variant AND modifiers all match, and two products can
    // share a recipe insumo). Facts are therefore collapsed by the same
    // identity the validator uses (fact.id) while every distinct fact is
    // kept.
    final authorityProductsById = <String, AuthorityProduct>{};
    final authorityInsumosById = <String, AuthorityInsumo>{};
    final authorityMappingsById = <String, AuthorityMapping>{};
    final authorityRecipesById = <String, AuthorityRecipe>{};
    final authorityComponentsById = <String, AuthorityComponent>{};

    for (final item in items) {
      // 1. Product & mapping
      final productEntity = await _database.productDao.findProductById(
        item.productId,
      );
      final productType = productEntity?.productType ?? 'SIMPLE';
      final kind = switch (productType) {
        'PREPARED' => AuthorityInventoryKind.prepared,
        'COMPOUND' => AuthorityInventoryKind.compound,
        _ => AuthorityInventoryKind.simple,
      };

      authorityProductsById.putIfAbsent(
        item.productId,
        () => AuthorityProduct(
          id: item.productId,
          tenantId: tenantId,
          inventoryKind: kind,
        ),
      );

      if (productEntity?.mappingVersionId != null &&
          productEntity?.insumoId != null) {
        authorityMappingsById.putIfAbsent(
          productEntity!.mappingVersionId!,
          () => AuthorityMapping(
            id: productEntity.mappingVersionId!,
            tenantId: tenantId,
            productId: item.productId,
            insumoId: productEntity.insumoId!,
          ),
        );

        // Direct-mapping insumo resolution. The authority projection is
        // hydrated from recipe component closures, but a product with a
        // DIRECT mapping (mappingVersionId + insumoId) and no published
        // recipe contributes a mapping whose insumo must still resolve,
        // or the authority guard fails closed for the entire cart. Resolve
        // it here when the projection carries it; a genuinely dangling
        // mapping is left untouched so the guard keeps failing closed.
        final directInsumoId = productEntity.insumoId!;
        if (!authorityInsumosById.containsKey(directInsumoId)) {
          final directInsumo = await authorityDao.findInsumoById(
            tenantId,
            directInsumoId,
          );
          if (directInsumo != null) {
            authorityInsumosById[directInsumo.id] = AuthorityInsumo(
              id: directInsumo.id,
              tenantId: tenantId,
            );
          }
        }
      }

      // 2. Active published recipe version
      final activeVersions = await authorityDao.findActivePublishedVersions(
        tenantId,
        item.productId,
        nowIso,
      );

      if (activeVersions.isNotEmpty) {
        final active = activeVersions.first;
        authorityRecipesById.putIfAbsent(
          active.id,
          () => AuthorityRecipe(
            id: active.id,
            tenantId: tenantId,
            productId: item.productId,
            isPublished: active.publicationState == 'PUBLISHED',
          ),
        );

        // 3. Components
        final components = await authorityDao.findComponentsByVersion(
          tenantId,
          active.id,
        );

        for (final c in components) {
          authorityComponentsById.putIfAbsent(
            c.id,
            () => AuthorityComponent(
              id: c.id,
              tenantId: tenantId,
              recipeId: active.id,
              insumoId: c.insumoId,
              quantityPerSaleUnit: c.grossQuantity,
            ),
          );

          final insumo = await authorityDao.findInsumoById(
            tenantId,
            c.insumoId,
          );
          if (insumo != null) {
            authorityInsumosById.putIfAbsent(
              insumo.id,
              () => AuthorityInsumo(id: insumo.id, tenantId: tenantId),
            );
          }
        }
      }
    }

    final authority = ValidatedSaleInventoryAuthority.validate(
      context: CheckoutAuthorityContext(
        checkoutId: invoice.id,
        offlineUserId: offlineUserId,
        offlineTenantId: tenantId,
        provisionedTenantId: tenantId,
      ),
      products: authorityProductsById.values.toList(),
      insumos: authorityInsumosById.values.toList(),
      mappings: authorityMappingsById.values.toList(),
      recipes: authorityRecipesById.values.toList(),
      components: authorityComponentsById.values.toList(),
    );

    final planner = SaleInventoryOutcomePlanner();
    final plan = planner.plan(
      lines: items
          .map(
            (i) => SaleInventoryLine(
              id: i.id,
              productId: i.productId,
              quantity: i.quantity,
            ),
          )
          .toList(),
      authority: authority,
    );

    final builder = SaleTimeInventorySnapshotBuilder();
    final buildResult = builder.build(
      plan: plan,
      authority: authority,
      terminalId: terminalId,
      invoiceId: invoice.id,
      catalogRevision: 'pos:local:rev1',
      movementKind: 'SALE',
    );

    final snapshotsByLineId = {
      for (final l in buildResult.lines) l.lineId: l.snapshot,
    };

    final frozenItems = items.map((item) {
      final snapshot = snapshotsByLineId[item.id];
      return item.copyWith(
        inventorySnapshotVersion: 'SALE_TIME_V1',
        inventorySnapshot: snapshot,
      );
    }).toList();

    final outcomeName = switch (buildResult.outcome) {
      InvoiceInventoryOutcome.applied => 'APPLIED',
      InvoiceInventoryOutcome.appliedNoInventoryImpact =>
        'APPLIED_NO_INVENTORY_IMPACT',
      InvoiceInventoryOutcome.appliedInventoryPending =>
        'APPLIED_INVENTORY_PENDING',
    };

    final reasonName = buildResult.reason == null
        ? null
        : switch (buildResult.reason!.code) {
            InvoiceInventoryReasonCode.noExplicitInsumoMapping =>
              'NO_EXPLICIT_INSUMO_MAPPING',
            InvoiceInventoryReasonCode.missingPublishedRecipe =>
              'MISSING_PUBLISHED_RECIPE',
          };

    final updatedInvoice = invoice.copyWith(
      inventoryPolicyVersion: 'SALE_TIME_V1',
      inventoryOutcome: outcomeName,
      inventoryOutcomeReason: reasonName,
    );

    return PreparedSaleInventoryResult(
      invoice: updatedInvoice,
      items: frozenItems,
    );
  }
}
