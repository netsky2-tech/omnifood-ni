import 'package:pos_app/data/services/authority_hydration_service.dart';

/// Outcome of adapting the inbound nested `recipeVersions` delta (#519 U2)
/// into the flat `AuthorityHydrationPayload` the hydrator expects.
///
/// Failures are values, not exceptions: a refused payload reports a
/// machine-readable [failureReason] and never a partially hydrated version,
/// because a version that hydrates without all of its components would
/// under-deduct inventory silently (issue #519 bug class).
class AuthorityDeltaAdaptation {
  final AuthorityHydrationPayload? payload;

  /// Single tenant all payload rows agree on; null on failure.
  final String? tenantId;

  /// Machine-readable reason when the payload is refused.
  final String? failureReason;

  /// Structurally valid recipes whose product is recorded `SIMPLE` (#613
  /// Unit A): inert material, excluded from the payload and reported here
  /// for per-record verdicts. Always empty on failure.
  final List<AuthorityInertRecipe> inertRecipes;

  const AuthorityDeltaAdaptation._(
    this.payload,
    this.tenantId,
    this.failureReason,
    this.inertRecipes,
  );

  const AuthorityDeltaAdaptation.success(this.payload, this.tenantId)
      : failureReason = null,
        inertRecipes = const [];

  const AuthorityDeltaAdaptation.failure(this.failureReason)
      : payload = null,
        tenantId = null,
        inertRecipes = const [];

  bool get isSuccess => payload != null;

  /// Version ids of the inert recipes, in wire order. Empty on failure.
  List<String> get inertRecipeVersionIds =>
      inertRecipes.map((r) => r.recipeVersionId).toList(growable: false);

  /// Empty input (no key or empty list) is an empty success: nothing to
  /// hydrate, not an error.
  const AuthorityDeltaAdaptation.empty()
      : this._(
          const AuthorityHydrationPayload(
              insumos: [], recipeVersions: [], components: []),
          null,
          null,
          const [],
        );
  int get insumoCount => payload?.insumos.length ?? 0;
  int get versionCount => payload?.recipeVersions.length ?? 0;
  int get componentCount => payload?.components.length ?? 0;
}

/// Adapts `rawDeltas['recipeVersions']` (nested wire shape from #519 U1)
/// into the flat document `AuthorityHydrationPayload.fromJson` requires.
///
/// Renames performed (delta wire name -> hydrator name):
/// - `version.effectiveAt` -> `effectiveFrom`
/// - `component.componentOrdinal` -> `ordinal`
/// - `component.ingredientName` -> `componentName`
/// - nested `version.components[i]` -> root `components[]`
/// Pass-through (same names): id, tenantId, recipeVersionId, productId,
/// versionNumber, isActive, publicationState, effectiveUntil,
/// yieldQuantity, technicalShrinkPct, publishedAt, createdAt, insumoId,
/// grossQuantity, ingredientType, componentUom, referenceVersionId.
/// `quantityPerSaleUnit` is deliberately NOT mapped: `grossQuantity` is
/// the authority hydration quantity.
///
/// The per-version `insumos` closure is the authority source for hydration
/// insumos (U1 payoff); the top-level `insumos` delta is never read here.
/// Closure rows are de-duplicated by id across versions; conflicting facts
/// for the same id refuse the payload.
///
/// Tenant binding: every row (versions, their components, their closure
/// insumos) must agree on exactly one non-empty tenantId. Mixed or missing
/// tenant refuses the whole payload; no default tenant is ever assumed.
///
/// Any malformed row refuses the ENTIRE payload, never part of a version.
///
/// #613 Unit A: [productTypes] carries the product type RECORDED in the
/// terminal's own catalog for the product ids referenced by the delta. A
/// row that passes every structural check but whose product type is
/// [AuthorityInertRecipe.inertProductType] is inert material: it is excluded
/// from the payload (with its components and its exclusively-referenced
/// closure insumos) and returned as a per-record [AuthorityDeltaAdaptation.inertRecipes]
/// entry instead of refusing the payload. Structural validation of inert
/// rows still runs in full: a mixed tenant or malformed component inside a
/// row that would be inert still refuses the WHOLE payload. Without
/// product-type evidence nothing is classified inert (backward compatible).
AuthorityDeltaAdaptation adaptAuthorityDelta(
  List<dynamic>? rawVersions, {
  Map<String, String> productTypes = const {},
}) {
  if (rawVersions == null || rawVersions.isEmpty) {
    return const AuthorityDeltaAdaptation.empty();
  }

  String? tenant;
  final flatInsumos = <String, Map<String, dynamic>>{};
  final flatVersions = <Map<String, dynamic>>[];
  final flatComponents = <Map<String, dynamic>>[];
  // #613 Unit A: closure + component insumo ids contributed by each row, so
  // inert subtraction can remove exactly what the inert rows brought.
  final insumoIdsByVersion = <String, Set<String>>{};

  for (var v = 0; v < rawVersions.length; v++) {
    final raw = rawVersions[v];
    if (raw is! Map) {
      return AuthorityDeltaAdaptation.failure('row_not_map[index=$v]');
    }
    final version = Map<String, dynamic>.from(raw);

    final versionTenant = version['tenantId'] as String?;
    if (versionTenant == null || versionTenant.isEmpty) {
      return AuthorityDeltaAdaptation.failure('missing_tenant_id[version=$v]');
    }
    if (tenant != null && tenant != versionTenant) {
      return AuthorityDeltaAdaptation.failure(
          'mixed_tenant_id[version=$v,expected=$tenant,got=$versionTenant]');
    }
    tenant ??= versionTenant;

    final versionId = (version['recipeVersionId'] ?? version['id']) as String?;
    if (versionId == null || versionId.isEmpty) {
      return AuthorityDeltaAdaptation.failure(
          'missing_version_identity[version=$v]');
    }
    final productId = version['productId'] as String?;
    if (productId == null || productId.isEmpty) {
      return AuthorityDeltaAdaptation.failure(
          'missing_product_id[version=$versionId]');
    }
    final effectiveAt = version['effectiveAt'] as String?;
    if (effectiveAt == null || effectiveAt.isEmpty) {
      return AuthorityDeltaAdaptation.failure(
          'missing_effective_at[version=$versionId]');
    }

    // Insumo authority closure: de-duplicate by id across versions. The
    // duplication is deliberate on the wire (fail-closed property of U1);
    // contradictory facts for the same id are a wire defect and refuse
    // the payload rather than picking a winner.
    final rawClosure = version['insumos'] as List<dynamic>? ?? const [];
    final rowInsumoIds = insumoIdsByVersion.putIfAbsent(
      versionId,
      () => <String>{},
    );
    for (final rawInsumo in rawClosure) {
      if (rawInsumo is! Map) {
        return AuthorityDeltaAdaptation.failure(
            'closure_row_not_map[version=$versionId]');
      }
      final insumo = Map<String, dynamic>.from(rawInsumo);
      final insumoTenant = insumo['tenantId'] as String?;
      if (insumoTenant == null || insumoTenant.isEmpty) {
        return AuthorityDeltaAdaptation.failure(
            'missing_tenant_id[version=$versionId,insumo]');
      }
      if (insumoTenant != tenant) {
        return AuthorityDeltaAdaptation.failure(
            'mixed_tenant_id[version=$versionId,insumo=$insumoTenant]');
      }
      final insumoId = insumo['id'] as String?;
      final name = insumo['name'] as String?;
      final uom = insumo['uom'] as String?;
      if (insumoId == null ||
          insumoId.isEmpty ||
          name == null ||
          uom == null) {
        return AuthorityDeltaAdaptation.failure(
            'missing_closure_insumo_identity[version=$versionId]');
      }
      final existing = flatInsumos[insumoId];
      if (existing != null &&
          (existing['name'] != name || existing['uom'] != uom)) {
        return AuthorityDeltaAdaptation.failure(
            'conflicting_closure_insumo_facts[insumoId=$insumoId]');
      }
      flatInsumos.putIfAbsent(
        insumoId,
        () => {
          'id': insumoId,
          'tenantId': tenant,
          'name': name,
          'uom': uom,
        },
      );
      rowInsumoIds.add(insumoId);
    }

    // Components: lift from the version into the flat root list. Order is
    // deterministic: componentOrdinal is the authority; when absent (or not
    // an int), the wire index within the version's list is the fallback,
    // with the original index as tie-breaker for a stable sort.
    final rawComponents = version['components'] as List<dynamic>? ?? const [];
    final orderedComponents = <(int, Map<String, dynamic>)>[];
    for (var i = 0; i < rawComponents.length; i++) {
      if (rawComponents[i] is! Map) {
        return AuthorityDeltaAdaptation.failure(
            'component_row_not_map[version=$versionId,component=$i]');
      }
      final component = Map<String, dynamic>.from(rawComponents[i] as Map);
      final componentTenant = component['tenantId'] as String?;
      final componentId = component['id'] as String?;
      final insumoId = component['insumoId'] as String?;
      if (componentTenant == null || componentTenant.isEmpty) {
        return AuthorityDeltaAdaptation.failure(
            'missing_tenant_id[version=$versionId,component=$i]');
      }
      if (componentTenant != tenant) {
        return AuthorityDeltaAdaptation.failure(
            'mixed_tenant_id[version=$versionId,component=$componentId,got=$componentTenant]');
      }
      if (componentId == null ||
          componentId.isEmpty ||
          insumoId == null ||
          insumoId.isEmpty) {
        return AuthorityDeltaAdaptation.failure(
            'missing_component_identity[version=$versionId,component=$i]');
      }
      final ordinal = component['componentOrdinal'] is int
          ? component['componentOrdinal'] as int
          : i;
      orderedComponents.add((
        i,
        <String, dynamic>{
          'id': componentId,
          'tenantId': tenant,
          'recipeVersionId': versionId,
          'ordinal': ordinal,
          'insumoId': insumoId,
          'grossQuantity': component['grossQuantity'],
          'technicalShrinkPct': component['technicalShrinkPct'],
          'ingredientType': component['ingredientType'],
          'componentName': component['ingredientName'],
          'componentUom': component['componentUom'],
          'referenceVersionId': component['referenceVersionId'],
        }
      ));
    }
    rowInsumoIds.addAll(
      orderedComponents.map((e) => e.$2['insumoId'] as String),
    );
    orderedComponents.sort((a, b) {
      final byOrdinal =
          (a.$2['ordinal'] as int).compareTo(b.$2['ordinal'] as int);
      return byOrdinal != 0 ? byOrdinal : a.$1.compareTo(b.$1);
    });
    flatComponents.addAll(orderedComponents.map((e) => e.$2));

    flatVersions.add(<String, dynamic>{
      'recipeVersionId': versionId,
      'tenantId': tenant,
      'productId': productId,
      'versionNumber': version['versionNumber'],
      'isActive': version['isActive'],
      'publicationState': version['publicationState'],
      'effectiveFrom': effectiveAt,
      'effectiveUntil': version['effectiveUntil'],
      'yieldQuantity': version['yieldQuantity'],
      'technicalShrinkPct': version['technicalShrinkPct'],
      'publishedAt': version['publishedAt'],
      'createdAt': version['createdAt'],
    });
  }

  try {
    // #613 Unit A: subtract inert recipes AFTER full structural validation,
    // so per-record classification can never weaken the fail-closed
    // structural refusals above.
    final inert = <AuthorityInertRecipe>[];
    final inertIds = <String>{};
    if (productTypes.isNotEmpty) {
      for (final version in flatVersions) {
        final productId = version['productId'] as String;
        if (productTypes[productId] ==
            AuthorityInertRecipe.inertProductType) {
          final versionId = version['recipeVersionId'] as String;
          inertIds.add(versionId);
          inert.add(AuthorityInertRecipe(
            recipeVersionId: versionId,
            productId: productId,
            tenantId: tenant!,
          ));
        }
      }
      if (inertIds.isNotEmpty) {
        flatVersions.removeWhere((v) => inertIds.contains(v['recipeVersionId']));
        flatComponents
            .removeWhere((c) => inertIds.contains(c['recipeVersionId']));
        // Remove exactly the closure insumos the inert rows contributed that
        // no kept component references: inert material is excluded, while
        // insumos contributed by good rows (referenced or closure-only)
        // stay.
        final inertInsumoIds = <String>{
          for (final id in inertIds) ...insumoIdsByVersion[id] ?? const <String>{},
        };
        final keptInsumoIds =
            flatComponents.map((c) => c['insumoId'] as String).toSet();
        flatInsumos.removeWhere(
          (insumoId, _) =>
              inertInsumoIds.contains(insumoId) &&
              !keptInsumoIds.contains(insumoId),
        );
      }
    }

    final payload = AuthorityHydrationPayload.fromJson(
      {
        'insumos': flatInsumos.values.toList(growable: false),
        'recipeVersions': flatVersions,
        'components': flatComponents,
      },
      expectedTenantId: tenant!,
    );
    return AuthorityDeltaAdaptation._(payload, tenant, null, inert);
  } on FormatException catch (e) {
    // Defense in depth: the hydrator's own validation refused a row.
    // Nothing was hydrated; report rather than throw.
    return AuthorityDeltaAdaptation.failure('payload_rejected: ${e.message}');
  }
}
