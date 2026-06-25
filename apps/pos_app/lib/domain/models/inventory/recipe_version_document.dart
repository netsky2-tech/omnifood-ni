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
    return RecipeVersionComponentDocument(
      ingredientId: json['ingredientId'] as String,
      ingredientName: json['ingredientName'] as String,
      ingredientType: json['ingredientType'] as String,
      grossQuantity: (json['grossQuantity'] as num).toDouble(),
      netQuantity: (json['netQuantity'] as num).toDouble(),
      technicalShrinkPct: (json['technicalShrinkPct'] as num).toDouble(),
      referenceVersionId: json['referenceVersionId'] as String?,
      // Missing in legacy documents → null → resolved to base UOM at processing.
      componentUom: json['componentUom'] as String?,
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

  RecipeVersionDocument copyWith({
    bool? isSynced,
    DateTime? publishedAt,
    List<RecipeVersionComponentDocument>? components,
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
        'components': components.map((component) => component.toJson()).toList(),
      };

  String encodeComponents() => jsonEncode(
        components.map((component) => component.toJson()).toList(growable: false),
      );

  factory RecipeVersionDocument.fromJson(Map<String, dynamic> json) {
    final componentList = (json['components'] as List<dynamic>? ?? const <dynamic>[])
        .map(
          (component) => RecipeVersionComponentDocument.fromJson(
            Map<String, dynamic>.from(component as Map),
          ),
        )
        .toList(growable: false);

    return RecipeVersionDocument(
      id: json['id'] as String,
      productId: json['productId'] as String,
      productName: json['productName'] as String,
      versionNumber: (json['versionNumber'] as num).toInt(),
      yieldQuantity: (json['yieldQuantity'] as num).toDouble(),
      technicalShrinkPct: (json['technicalShrinkPct'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      versionNote: json['versionNote'] as String?,
      publishedAt: json['publishedAt'] == null
          ? null
          : DateTime.parse(json['publishedAt'] as String),
      isSynced: (json['isSynced'] as bool?) ?? false,
      components: componentList,
    );
  }

  static List<RecipeVersionComponentDocument> decodeComponents(String encoded) {
    final decoded = jsonDecode(encoded) as List<dynamic>;
    return decoded
        .map(
          (component) => RecipeVersionComponentDocument.fromJson(
            Map<String, dynamic>.from(component as Map),
          ),
        )
        .toList(growable: false);
  }
}
