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
    if (tenantId.trim().isEmpty || offlineUserId.trim().isEmpty) {
      throw const CheckoutAuthorityException();
    }

    final authorityDao = _database.authorityProjectionDao;
    final nowIso = invoice.createdAt.toUtc().toIso8601String();

    final authorityProducts = <AuthorityProduct>[];
    final authorityInsumos = <AuthorityInsumo>[];
    final authorityMappings = <AuthorityMapping>[];
    final authorityRecipes = <AuthorityRecipe>[];
    final authorityComponents = <AuthorityComponent>[];

    for (final item in items) {
      // 1. Product & mapping
      final productEntity = await _database.productDao.findProductById(item.productId);
      final productType = productEntity?.productType ?? 'SIMPLE';
      final kind = switch (productType) {
        'PREPARED' => AuthorityInventoryKind.prepared,
        'COMPOUND' => AuthorityInventoryKind.compound,
        _ => AuthorityInventoryKind.simple,
      };

      authorityProducts.add(AuthorityProduct(
        id: item.productId,
        tenantId: tenantId,
        inventoryKind: kind,
      ));

      if (productEntity?.mappingVersionId != null && productEntity?.insumoId != null) {
        authorityMappings.add(AuthorityMapping(
          id: productEntity!.mappingVersionId!,
          tenantId: tenantId,
          productId: item.productId,
          insumoId: productEntity.insumoId!,
        ));
      }

      // 2. Active published recipe version
      final activeVersions = await authorityDao.findActivePublishedVersions(
        tenantId,
        item.productId,
        nowIso,
      );

      if (activeVersions.isNotEmpty) {
        final active = activeVersions.first;
        authorityRecipes.add(AuthorityRecipe(
          id: active.id,
          tenantId: tenantId,
          productId: item.productId,
          isPublished: active.publicationState == 'PUBLISHED',
        ));

        // 3. Components
        final components = await authorityDao.findComponentsByVersion(
          tenantId,
          active.id,
        );

        for (final c in components) {
          authorityComponents.add(AuthorityComponent(
            id: c.id,
            tenantId: tenantId,
            recipeId: active.id,
            insumoId: c.insumoId,
            quantityPerSaleUnit: c.grossQuantity,
          ));

          final insumo = await authorityDao.findInsumoById(tenantId, c.insumoId);
          if (insumo != null) {
            authorityInsumos.add(AuthorityInsumo(
              id: insumo.id,
              tenantId: tenantId,
            ));
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
      products: authorityProducts,
      insumos: authorityInsumos,
      mappings: authorityMappings,
      recipes: authorityRecipes,
      components: authorityComponents,
    );

    final planner = SaleInventoryOutcomePlanner();
    final plan = planner.plan(
      lines: items
          .map((i) => SaleInventoryLine(
                id: i.id,
                productId: i.productId,
                quantity: i.quantity,
              ))
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
      for (final l in buildResult.lines) l.lineId: l.snapshot
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
      InvoiceInventoryOutcome.appliedNoInventoryImpact => 'APPLIED_NO_INVENTORY_IMPACT',
      InvoiceInventoryOutcome.appliedInventoryPending => 'APPLIED_INVENTORY_PENDING',
    };

    final reasonName = buildResult.reason == null
        ? null
        : switch (buildResult.reason!.code) {
            InvoiceInventoryReasonCode.noExplicitInsumoMapping => 'NO_EXPLICIT_INSUMO_MAPPING',
            InvoiceInventoryReasonCode.missingPublishedRecipe => 'MISSING_PUBLISHED_RECIPE',
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
