import 'dart:developer' as developer;

import 'package:pos_app/data/daos/inventory/authority_ingestion_verdict_dao.dart';
import 'package:pos_app/data/daos/inventory/authority_projection_dao.dart';
import 'package:pos_app/data/models/inventory/authority_ingestion_verdict_entity.dart';
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

/// One structurally valid recipe version whose product is recorded as
/// `SIMPLE` (#613 Unit A). It is inert material for the POS: the version is
/// NOT hydrated and gets a per-record ingestion verdict instead. This is a
/// report, not a business rule: a SIMPLE product keeps not consuming from a
/// recipe (#611 owns that decision).
class AuthorityInertRecipe {
  /// The recorded product type that makes a recipe version inert in the POS.
  static const String inertProductType = 'SIMPLE';

  final String recipeVersionId;
  final String productId;
  final String tenantId;

  const AuthorityInertRecipe({
    required this.recipeVersionId,
    required this.productId,
    required this.tenantId,
  });
}

class AuthorityHydrationService {
  final AuthorityProjectionDao _dao;
  final AuthorityIngestionVerdictDao? _verdictDao;

  const AuthorityHydrationService(
    this._dao, {
    AuthorityIngestionVerdictDao? verdictDao,
  }) : _verdictDao = verdictDao;

  /// Applies the hydratable rows of the payload and records one
  /// insert-if-absent ingestion verdict per inert recipe (#613 Unit A).
  ///
  /// Verdict writes are best-effort by contract: a verdict failure is
  /// swallowed and logged here so it can never reach backwards through the
  /// caller's catch and flip a successful hydration into a failed one. The
  /// applied authority rows stand on their own.
  Future<void> hydrate(
    AuthorityHydrationPayload payload, {
    List<AuthorityInertRecipe> inertRecipes = const [],
  }) async {
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

    // 4. Ingestion verdicts for inert recipes (#613 Unit A). Append-only,
    // insert-if-absent: a re-pull of the same inert version is a no-op.
    for (final inert in inertRecipes) {
      try {
        await _verdictDao?.insertVerdictIfAbsent(
          AuthorityIngestionVerdictEntity(
            recipeVersionId: inert.recipeVersionId,
            code: AuthorityIngestionVerdicts.inertSimpleProductCode,
            productId: inert.productId,
            tenantId: inert.tenantId,
            createdAt: DateTime.now().toUtc().toIso8601String(),
          ),
        );
      } catch (e, stackTrace) {
        // Degrade, never propagate: the pull stands, the verdict is simply
        // missing this cycle (telemetry/count reads handle absence).
        developer.log(
          '[HYDRATION] authority_ingestion_verdict_not_persisted '
          'version=${inert.recipeVersionId}',
          name: 'AuthorityHydrationService',
          error: e,
          stackTrace: stackTrace,
        );
      }
    }
  }
}
