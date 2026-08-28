import 'dart:convert';

class RecipeVersionComponentDocument {
  const RecipeVersionComponentDocument({
    required this.ingredientId,
    required this.ingredientName,
    required this.ingredientType,
    required this.grossQuantity,
    required this.netQuantity,
    required this.technicalShrinkPct,
    this.referenceVersionId,
    // Slice 2.2: UOM the component quantity is expressed in. Nullable for
    // backward compatibility with documents synced/stored before this slice;
    // a missing UOM is treated as the insumo's base consumption UOM at
    // movement-processing time (see MovementEngineImpl).
    this.componentUom,
  });

  final String ingredientId;
  final String ingredientName;
  final String ingredientType;
  final double grossQuantity;
  final double netQuantity;
  final double technicalShrinkPct;
  final String? referenceVersionId;
  final String? componentUom;

  Map<String, Object?> toJson() => {
        'ingredientId': ingredientId,
        'ingredientName': ingredientName,
        'ingredientType': ingredientType,
        'grossQuantity': grossQuantity,
        'netQuantity': netQuantity,
        'technicalShrinkPct': technicalShrinkPct,
        'referenceVersionId': referenceVersionId,
        'componentUom': componentUom,
      };

  factory RecipeVersionComponentDocument.fromJson(Map<String, dynamic> json) {
    final gross = (json['grossQuantity'] ?? json['gross_quantity'] as num?)?.toDouble() ?? 0.0;
    final net = (json['netQuantity'] ?? json['net_quantity'] as num?)?.toDouble() ?? gross;
    return RecipeVersionComponentDocument(
      ingredientId: (json['ingredientId'] ?? json['ingredient_id'])?.toString() ?? '',
      ingredientName: (json['ingredientName'] ?? json['ingredient_name'])?.toString() ?? 'Insumo',
      ingredientType: (json['ingredientType'] ?? json['ingredient_type'])?.toString() ?? 'INSUMO',
      grossQuantity: gross,
      netQuantity: net,
      technicalShrinkPct: (json['technicalShrinkPct'] ?? json['technical_shrink_pct'] as num?)?.toDouble() ?? 0.0,
      referenceVersionId: (json['referenceVersionId'] ?? json['reference_version_id'])?.toString(),
      // Missing in legacy documents → null → resolved to base UOM at processing.
      componentUom: (json['componentUom'] ?? json['component_uom'])?.toString(),
    );
  }
}

class RecipeVersionDocument {
  const RecipeVersionDocument({
    required this.id,
    required this.productId,
    required this.productName,
    required this.versionNumber,
    required this.yieldQuantity,
    required this.technicalShrinkPct,
    required this.createdAt,
    required this.components,
    this.versionNote,
    this.publishedAt,
    this.isSynced = false,
    this.diasVidaUtil = 2,
    this.umbralDesviacionPermitido = 5.0,
  });

  final String id;
  final String productId;
  final String productName;
  final int versionNumber;
  final double yieldQuantity;
  final double technicalShrinkPct;
  final DateTime createdAt;
  final List<RecipeVersionComponentDocument> components;
  final String? versionNote;
  final DateTime? publishedAt;
  final bool isSynced;
  final int diasVidaUtil;
  final double umbralDesviacionPermitido;

  DateTime calculateExpirationDate(DateTime fromDate) {
    final effectiveDays = diasVidaUtil > 0 ? diasVidaUtil : 2;
    return fromDate.add(Duration(days: effectiveDays));
  }

  RecipeVersionDocument copyWith({
    bool? isSynced,
    DateTime? publishedAt,
    List<RecipeVersionComponentDocument>? components,
    int? diasVidaUtil,
    double? umbralDesviacionPermitido,
  }) {
    return RecipeVersionDocument(
      id: id,
      productId: productId,
      productName: productName,
      versionNumber: versionNumber,
      yieldQuantity: yieldQuantity,
      technicalShrinkPct: technicalShrinkPct,
      createdAt: createdAt,
      components: components ?? this.components,
      versionNote: versionNote,
      publishedAt: publishedAt ?? this.publishedAt,
      isSynced: isSynced ?? this.isSynced,
      diasVidaUtil: diasVidaUtil ?? this.diasVidaUtil,
      umbralDesviacionPermitido:
          umbralDesviacionPermitido ?? this.umbralDesviacionPermitido,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'productId': productId,
        'productName': productName,
        'versionNumber': versionNumber,
        'yieldQuantity': yieldQuantity,
        'technicalShrinkPct': technicalShrinkPct,
        'createdAt': createdAt.toIso8601String(),
        'versionNote': versionNote,
        'publishedAt': publishedAt?.toIso8601String(),
        'isSynced': isSynced,
        'diasVidaUtil': diasVidaUtil,
        'umbralDesviacionPermitido': umbralDesviacionPermitido,
        'components': components.map((component) => component.toJson()).toList(),
      };

  String encodeComponents() => jsonEncode(
        components.map((component) => component.toJson()).toList(growable: false),
      );

  factory RecipeVersionDocument.fromJson(Map<String, dynamic> json) {
    final componentList = (json['components'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map>()
        .map(
          (component) => RecipeVersionComponentDocument.fromJson(
            Map<String, dynamic>.from(component),
          ),
        )
        .toList(growable: false);

    return RecipeVersionDocument(
      id: (json['id'] ?? json['recipe_version_id'])?.toString() ?? '',
      productId: (json['productId'] ?? json['product_id'])?.toString() ?? '',
      productName: (json['productName'] ?? json['product_name'])?.toString() ?? 'Producto',
      versionNumber: (json['versionNumber'] ?? json['version_number'] as num?)?.toInt() ?? 1,
      yieldQuantity: (json['yieldQuantity'] ?? json['yield_quantity'] as num?)?.toDouble() ?? 1.0,
      technicalShrinkPct: (json['technicalShrinkPct'] ?? json['technical_shrink_pct'] as num?)?.toDouble() ?? 0.0,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : (json['created_at'] != null
              ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
              : DateTime.now()),
      versionNote: (json['versionNote'] ?? json['version_note'])?.toString(),
      publishedAt: json['publishedAt'] != null
          ? DateTime.tryParse(json['publishedAt'].toString())
          : (json['published_at'] != null
              ? DateTime.tryParse(json['published_at'].toString())
              : null),
      isSynced: (json['isSynced'] ?? json['is_synced'] as bool?) ?? false,
      diasVidaUtil: (json['diasVidaUtil'] ?? json['dias_vida_util'] as num?)?.toInt() ?? 2,
      umbralDesviacionPermitido:
          (json['umbralDesviacionPermitido'] ?? json['umbral_desviacion_permitido'] as num?)
                  ?.toDouble() ??
              5.0,
      components: componentList,
    );
  }

  static List<RecipeVersionComponentDocument> decodeComponents(String? encoded) {
    if (encoded == null || encoded.trim().isEmpty) return const [];
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map(
              (component) => RecipeVersionComponentDocument.fromJson(
                Map<String, dynamic>.from(component),
              ),
            )
            .toList(growable: false);
      }
    } catch (_) {}
    return const [];
  }
}
