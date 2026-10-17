import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/usecases/inventory/sale_inventory_outcome_planner.dart';
import 'package:pos_app/domain/usecases/inventory/sale_time_inventory_snapshot_builder.dart';
import 'package:pos_app/domain/usecases/inventory/sub_recipe_bom_explosion.dart';
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
      final kind = _inventoryKindOf(productEntity?.productType);

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
          final ingredientType = parseAuthorityIngredientType(c.ingredientType);
          authorityComponentsById.putIfAbsent(
            c.id,
            () => AuthorityComponent(
              id: c.id,
              tenantId: tenantId,
              recipeId: active.id,
              insumoId: c.insumoId,
              quantityPerSaleUnit: _netQuantityPerSaleUnit(
                grossQuantity: c.grossQuantity,
                technicalShrinkPct: c.technicalShrinkPct,
                yieldQuantity: active.yieldQuantity,
              ),
              ingredientType: ingredientType,
              referenceVersionId: c.referenceVersionId,
            ),
          );

          if (ingredientType == AuthorityIngredientType.subRecipe) {
            // R21 / S18: this component names a PRODUCT (the sub-recipe),
            // never an insumo. Descend into the sub-recipe's own published
            // version so the authority carries every leaf insumo the sale
            // will actually consume — the POS mirror of the backend's
            // BomExplosionService (R11).
            await _hydrateSubRecipeClosure(
              authorityDao: authorityDao,
              tenantId: tenantId,
              nowIso: nowIso,
              subRecipeProductId: c.insumoId,
              ancestors: <String>[item.productId],
              productsById: authorityProductsById,
              recipesById: authorityRecipesById,
              componentsById: authorityComponentsById,
              insumosById: authorityInsumosById,
            );
          } else {
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

    // R23: Evaluate negative_stock_policy fail-closed in checkout before committing.
    // If an insumo's resulting stock is negative and its policy is not ALLOW_TEMPORARY
    // (default RESTRICT), the checkout must abort with a typed exception naming the failing
    // product, insumo and quantities, rather than selling offline and wedging cloud sync.
    final totalRequiredByInsumo = <String, double>{};
    final insumoContributingProducts = <String, String>{};
    for (final line in buildResult.lines) {
      final item = items.firstWhere(
        (it) => it.id == line.lineId,
        orElse: () => items.first,
      );
      for (final binding in line.snapshot.bindings) {
        totalRequiredByInsumo[binding.insumoId] =
            (totalRequiredByInsumo[binding.insumoId] ?? 0.0) +
            (binding.quantityPerSaleUnit * item.quantity);
        insumoContributingProducts.putIfAbsent(
          binding.insumoId,
          () => item.productName,
        );
      }
    }

    for (final entry in totalRequiredByInsumo.entries) {
      final insumoId = entry.key;
      final requiredQty = entry.value;
      if (requiredQty <= 0) continue;

      final insumoRow = await _database.insumoDao.findInsumoById(insumoId);
      if (insumoRow == null) continue;

      final authInsumo = await authorityDao.findInsumoById(tenantId, insumoId);
      final policy = authInsumo?.negativeStockPolicy ??
          insumoRow.negativeStockPolicy;

      final availableStock = insumoRow.stock;
      final resultingStock = availableStock - requiredQty;

      if (policy != 'ALLOW_TEMPORARY' && resultingStock < 0) {
        final insumoName = authInsumo?.name ?? insumoRow.name;
        final productName =
            insumoContributingProducts[insumoId] ?? 'Producto';
        throw CheckoutAuthorityException(
          reason: CheckoutAuthorityFailureReason.negativeStockBlocked,
          productName: productName,
          insumoName: insumoName,
          requiredQuantity: requiredQty,
          availableQuantity: availableStock,
        );
      }
    }

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

  /// R21 / S18 — hydrates everything a SUB_RECIPE component needs for the
  /// explosion to reach its leaf insumos: the sub-recipe's product fact, its
  /// active published version, that version's components and their insumo
  /// facts, recursively.
  ///
  /// Fail closed on every gap the backend would reject as a DATA error
  /// (R11's `resolveActiveRecipeComponents` throws instead of silently
  /// dropping a sub-recipe's ingredients): unknown product, no active
  /// published version, a published version with no components, a leaf
  /// insumo the projection never received, a cycle or nesting beyond
  /// [SubRecipeBomExplosion.maxDepth]. The sale is blocked by the same
  /// `CheckoutAuthorityException` the flat-structure guard raises, so the
  /// operator sees the existing "no tiene receta publicada" directive.
  Future<void> _hydrateSubRecipeClosure({
    required AuthorityProjectionDao authorityDao,
    required String tenantId,
    required String nowIso,
    required String subRecipeProductId,
    required List<String> ancestors,
    required Map<String, AuthorityProduct> productsById,
    required Map<String, AuthorityRecipe> recipesById,
    required Map<String, AuthorityComponent> componentsById,
    required Map<String, AuthorityInsumo> insumosById,
  }) async {
    // `ancestors` holds the root product plus every product on the path down
    // to (but not including) this one, so its length is this node's nesting
    // level and its contents are the cycle guard (the backend's
    // `visitedStack`, which pops on the way out so a diamond — the same
    // sub-recipe reached from two branches — stays legal).
    final subProduct = await _database.productDao.findProductById(
      subRecipeProductId,
    );
    if (ancestors.length > SubRecipeBomExplosion.maxDepth) {
      throw CheckoutAuthorityException(
        reason: CheckoutAuthorityFailureReason.maxDepthExceeded,
        productName: subProduct?.name ?? subRecipeProductId,
      );
    }
    if (ancestors.contains(subRecipeProductId)) {
      throw CheckoutAuthorityException(
        reason: CheckoutAuthorityFailureReason.circularRecipe,
        productName: subProduct?.name ?? subRecipeProductId,
      );
    }

    if (subProduct == null) {
      throw const CheckoutAuthorityException(
        reason: CheckoutAuthorityFailureReason.unresolvedInsumo,
      );
    }
    productsById.putIfAbsent(
      subRecipeProductId,
      () => AuthorityProduct(
        id: subRecipeProductId,
        tenantId: tenantId,
        inventoryKind: _inventoryKindOf(subProduct.productType),
      ),
    );

    final versions = await authorityDao.findActivePublishedVersions(
      tenantId,
      subRecipeProductId,
      nowIso,
    );
    if (versions.isEmpty) {
      throw const CheckoutAuthorityException();
    }
    final version = versions.first;
    recipesById.putIfAbsent(
      version.id,
      () => AuthorityRecipe(
        id: version.id,
        tenantId: tenantId,
        productId: subRecipeProductId,
        isPublished: version.publicationState == 'PUBLISHED',
      ),
    );

    final subComponents = await authorityDao.findComponentsByVersion(
      tenantId,
      version.id,
    );
    if (subComponents.isEmpty) {
      throw const CheckoutAuthorityException();
    }

    final nextAncestors = <String>[...ancestors, subRecipeProductId];
    for (final c in subComponents) {
      final ingredientType = parseAuthorityIngredientType(c.ingredientType);
      componentsById.putIfAbsent(
        c.id,
        () => AuthorityComponent(
          id: c.id,
          tenantId: tenantId,
          recipeId: version.id,
          insumoId: c.insumoId,
          quantityPerSaleUnit: _netQuantityPerSaleUnit(
            grossQuantity: c.grossQuantity,
            technicalShrinkPct: c.technicalShrinkPct,
            yieldQuantity: version.yieldQuantity,
          ),
          ingredientType: ingredientType,
          referenceVersionId: c.referenceVersionId,
        ),
      );

      if (ingredientType == AuthorityIngredientType.subRecipe) {
        await _hydrateSubRecipeClosure(
          authorityDao: authorityDao,
          tenantId: tenantId,
          nowIso: nowIso,
          subRecipeProductId: c.insumoId,
          ancestors: nextAncestors,
          productsById: productsById,
          recipesById: recipesById,
          componentsById: componentsById,
          insumosById: insumosById,
        );
      } else {
        final leaf = await authorityDao.findInsumoById(tenantId, c.insumoId);
        if (leaf == null) {
          throw const CheckoutAuthorityException();
        }
        insumosById.putIfAbsent(
          leaf.id,
          () => AuthorityInsumo(id: leaf.id, tenantId: tenantId),
        );
      }
    }
  }

  /// Backend parity with `recipe.service.ts` createNewVersion:
  /// `recipe_details.quantity` (consumption for ONE sold unit) is
  /// `gross × (1 − componentShrink/100) ÷ yieldQuantity`. Hydrating the
  /// authority from `grossQuantity` alone made every lote recipe
  /// (yield > 1) deduct the whole batch per sold unit — a silent
  /// over-deduction the V1 freeze then froze into the kardex.
  /// A non-positive yield fails closed like any other authority gap.
  static double _netQuantityPerSaleUnit({
    required double grossQuantity,
    required double technicalShrinkPct,
    required double yieldQuantity,
  }) {
    if (yieldQuantity <= 0) throw const CheckoutAuthorityException();
    return double.parse(
      (grossQuantity * (1 - technicalShrinkPct / 100) / yieldQuantity)
          .toStringAsFixed(4),
    );
  }

  static AuthorityInventoryKind _inventoryKindOf(String? productType) =>
      switch (productType) {
        'PREPARED' => AuthorityInventoryKind.prepared,
        'COMPOUND' => AuthorityInventoryKind.compound,
        _ => AuthorityInventoryKind.simple,
      };
}
