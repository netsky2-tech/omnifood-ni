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

  const AuthorityDeltaAdaptation._(
    this.payload,
    this.tenantId,
    this.failureReason,
  );

  const AuthorityDeltaAdaptation.success(this.payload, this.tenantId)
      : failureReason = null;

  const AuthorityDeltaAdaptation.failure(this.failureReason)
      : payload = null,
        tenantId = null;

  bool get isSuccess => payload != null;

  /// Empty input (no key or empty list) is an empty success: nothing to
  /// hydrate, not an error.
  const AuthorityDeltaAdaptation.empty()
      : this._(
          const AuthorityHydrationPayload(
              insumos: [], recipeVersions: [], components: []),
          null,
          null,
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
AuthorityDeltaAdaptation adaptAuthorityDelta(List<dynamic>? rawVersions) {
  if (rawVersions == null || rawVersions.isEmpty) {
    return const AuthorityDeltaAdaptation.empty();
  }

  String? tenant;
  final flatInsumos = <String, Map<String, dynamic>>{};
  final flatVersions = <Map<String, dynamic>>[];
  final flatComponents = <Map<String, dynamic>>[];

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
    final payload = AuthorityHydrationPayload.fromJson(
      {
        'insumos': flatInsumos.values.toList(growable: false),
        'recipeVersions': flatVersions,
        'components': flatComponents,
      },
      expectedTenantId: tenant!,
    );
    return AuthorityDeltaAdaptation.success(payload, tenant);
  } on FormatException catch (e) {
    // Defense in depth: the hydrator's own validation refused a row.
    // Nothing was hydrated; report rather than throw.
    return AuthorityDeltaAdaptation.failure('payload_rejected: ${e.message}');
  }
}
