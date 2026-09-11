import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';

class AuthorityHydrationPayload {
  final List<AuthorityInsumoEntity> insumos;
  final List<AuthorityRecipeVersionEntity> recipeVersions;
  final List<AuthorityRecipeVersionComponentEntity> components;

  const AuthorityHydrationPayload({
    required this.insumos,
    required this.recipeVersions,
    required this.components,
  });

  factory AuthorityHydrationPayload.fromJson(
    Map<String, dynamic> json, {
    required String expectedTenantId,
  }) {
    final rawInsumos = json['insumos'] as List<dynamic>? ?? [];
    final rawVersions = json['recipeVersions'] as List<dynamic>? ?? [];
    final rawComponents = json['components'] as List<dynamic>? ?? [];

    final insumos = <AuthorityInsumoEntity>[];
    for (final raw in rawInsumos) {
      final map = raw as Map<String, dynamic>;
      final tenantId = map['tenantId'] as String?;
      final id = map['id'] as String?;
      final name = map['name'] as String?;
      final uom = map['uom'] as String?;

      if (tenantId == null ||
          tenantId != expectedTenantId ||
          id == null ||
          id.isEmpty ||
          name == null ||
          uom == null) {
        throw FormatException('Invalid or cross-tenant insumo authority record: $map');
      }

      insumos.add(AuthorityInsumoEntity(
        tenantId: tenantId,
        id: id,
        name: name,
        uom: uom,
      ));
    }

    final recipeVersions = <AuthorityRecipeVersionEntity>[];
    for (final raw in rawVersions) {
      final map = raw as Map<String, dynamic>;
      final tenantId = map['tenantId'] as String?;
      final id = (map['recipeVersionId'] ?? map['id']) as String?;
      final productId = map['productId'] as String?;
      final versionNumber = map['versionNumber'] as int? ?? 1;
      final isActive = map['isActive'] as bool? ?? true;
      final publicationState = map['publicationState'] as String? ?? 'PUBLISHED';
      final effectiveFrom = (map['effectiveFrom'] ?? map['fechaInicioVigencia']) as String?;
      final effectiveUntil = (map['effectiveUntil'] ?? map['fechaFinVigencia']) as String?;
      final yieldQuantity = (map['yieldQuantity'] as num?)?.toDouble() ?? 1.0;
      final technicalShrinkPct = (map['technicalShrinkPct'] as num?)?.toDouble() ?? 0.0;
      final publishedAt = map['publishedAt'] as String?;
      final createdAt = (map['createdAt'] ?? map['publishedAt'] ?? DateTime.now().toIso8601String()) as String;
      final updatedAt = (map['updatedAt'] ?? createdAt) as String;

      if (tenantId == null ||
          tenantId != expectedTenantId ||
          id == null ||
          id.isEmpty ||
          productId == null ||
          productId.isEmpty ||
          effectiveFrom == null) {
        throw FormatException('Invalid or cross-tenant recipe version authority record: $map');
      }

      recipeVersions.add(AuthorityRecipeVersionEntity(
        tenantId: tenantId,
        id: id,
        productId: productId,
        versionNumber: versionNumber,
        isActive: isActive,
        publicationState: publicationState,
        effectiveFrom: effectiveFrom,
        effectiveUntil: effectiveUntil,
        yieldQuantity: yieldQuantity,
        technicalShrinkPct: technicalShrinkPct,
        publishedAt: publishedAt,
        createdAt: createdAt,
        updatedAt: updatedAt,
      ));
    }

    final components = <AuthorityRecipeVersionComponentEntity>[];
    for (final raw in rawComponents) {
      final map = raw as Map<String, dynamic>;
      final tenantId = map['tenantId'] as String?;
      final id = map['id'] as String?;
      final versionId = (map['recipeVersionId'] ?? map['versionId']) as String?;
      final ordinal = map['ordinal'] as int? ?? 0;
      final insumoId = map['insumoId'] as String?;
      final grossQuantity = (map['grossQuantity'] as num?)?.toDouble() ?? 0.0;
      final technicalShrinkPct = (map['technicalShrinkPct'] as num?)?.toDouble() ?? 0.0;
      final ingredientType = map['ingredientType'] as String? ?? 'DIRECT';
      final componentName = map['componentName'] as String? ?? '';
      final componentUom = map['componentUom'] as String?;
      final referenceVersionId = map['referenceVersionId'] as String?;

      if (tenantId == null ||
          tenantId != expectedTenantId ||
          id == null ||
          id.isEmpty ||
          versionId == null ||
          insumoId == null) {
        throw FormatException('Invalid or cross-tenant component authority record: $map');
      }

      components.add(AuthorityRecipeVersionComponentEntity(
        tenantId: tenantId,
        id: id,
        versionId: versionId,
        ordinal: ordinal,
        insumoId: insumoId,
        grossQuantity: grossQuantity,
        technicalShrinkPct: technicalShrinkPct,
        ingredientType: ingredientType,
        componentName: componentName,
        componentUom: componentUom,
        referenceVersionId: referenceVersionId,
      ));
    }

    return AuthorityHydrationPayload(
      insumos: insumos,
      recipeVersions: recipeVersions,
      components: components,
    );
  }
}

class AuthorityHydrationService {
  final AuthorityProjectionDao _dao;

  const AuthorityHydrationService(this._dao);

  Future<void> hydrate(AuthorityHydrationPayload payload) async {
    // 1. Insumos
    for (final insumo in payload.insumos) {
      final existing = await _dao.findInsumoById(insumo.tenantId, insumo.id);
      if (existing == null) {
        await _dao.insertInsumo(insumo);
      }
    }

    // 2. Recipe Versions
    for (final version in payload.recipeVersions) {
      final active = await _dao.findActivePublishedVersions(
        version.tenantId,
        version.productId,
        version.effectiveFrom,
      );
      final match = active.where((v) => v.id == version.id).toList();
      if (match.isEmpty) {
        await _dao.insertRecipeVersion(version);
      }
    }

    // 3. Components
    for (final comp in payload.components) {
      final existingComps = await _dao.findComponentsByVersion(comp.tenantId, comp.versionId);
      final match = existingComps.where((c) => c.id == comp.id).toList();
      if (match.isEmpty) {
        await _dao.insertComponent(comp);
      }
    }
  }
}
