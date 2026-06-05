import 'dart:convert';

class CountSessionStatus {
  static const String draft = 'draft';
  static const String open = 'open';
  static const String counting = 'counting';
  static const String recount = 'recount';
  static const String approvalPending = 'approval_pending';
  static const String approved = 'approved';
  static const String posted = 'posted';
  static const String closed = 'closed';
}

class CountLineEntryDocument {
  const CountLineEntryDocument({
    required this.countedQuantity,
    this.countedAt,
    this.notes,
    this.actorLabel,
    this.disputed = false,
  });

  final double countedQuantity;
  final DateTime? countedAt;
  final String? notes;
  final String? actorLabel;
  final bool disputed;

  Map<String, Object?> toJson() => {
        'countedQuantity': countedQuantity,
        'countedAt': countedAt?.toIso8601String(),
        'notes': notes,
        'actorLabel': actorLabel,
        'disputed': disputed,
      };

  factory CountLineEntryDocument.fromJson(Map<String, dynamic> json) {
    return CountLineEntryDocument(
      countedQuantity: (json['countedQuantity'] as num).toDouble(),
      countedAt: json['countedAt'] == null
          ? null
          : DateTime.parse(json['countedAt'] as String),
      notes: json['notes'] as String?,
      actorLabel: json['actorLabel'] as String?,
      disputed: (json['disputed'] as bool?) ?? false,
    );
  }
}

class CountSessionLineDocument {
  const CountSessionLineDocument({
    required this.id,
    required this.insumoId,
    required this.insumoName,
    required this.uom,
    required this.theoreticalQuantity,
    this.approvedEntryIndex,
    this.entries = const <CountLineEntryDocument>[],
  });

  final String id;
  final String insumoId;
  final String insumoName;
  final String uom;
  final double theoreticalQuantity;
  final int? approvedEntryIndex;
  final List<CountLineEntryDocument> entries;

  double? get approvedCountedQuantity {
    if (approvedEntryIndex == null) {
      return null;
    }
    if (approvedEntryIndex! < 0 || approvedEntryIndex! >= entries.length) {
      return null;
    }
    return entries[approvedEntryIndex!].countedQuantity;
  }

  double? get variance {
    final approved = approvedCountedQuantity;
    if (approved == null) {
      return null;
    }
    return approved - theoreticalQuantity;
  }

  bool get hasDispute => entries.any((entry) => entry.disputed);

  CountSessionLineDocument copyWith({
    int? approvedEntryIndex,
    List<CountLineEntryDocument>? entries,
  }) {
    return CountSessionLineDocument(
      id: id,
      insumoId: insumoId,
      insumoName: insumoName,
      uom: uom,
      theoreticalQuantity: theoreticalQuantity,
      approvedEntryIndex: approvedEntryIndex ?? this.approvedEntryIndex,
      entries: entries ?? this.entries,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'insumoId': insumoId,
        'insumoName': insumoName,
        'uom': uom,
        'theoreticalQuantity': theoreticalQuantity,
        'approvedEntryIndex': approvedEntryIndex,
        'entries': entries.map((entry) => entry.toJson()).toList(growable: false),
      };

  factory CountSessionLineDocument.fromJson(Map<String, dynamic> json) {
    return CountSessionLineDocument(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      insumoName: json['insumoName'] as String,
      uom: json['uom'] as String,
      theoreticalQuantity: (json['theoreticalQuantity'] as num).toDouble(),
      approvedEntryIndex: json['approvedEntryIndex'] as int?,
      entries: (json['entries'] as List<dynamic>? ?? const <dynamic>[])
          .map(
            (entry) => CountLineEntryDocument.fromJson(
              Map<String, dynamic>.from(entry as Map),
            ),
          )
          .toList(growable: false),
    );
  }
}

class CountSessionDocument {
  const CountSessionDocument({
    required this.id,
    required this.warehouseId,
    required this.warehouseName,
    required this.cutoffAt,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.notes,
    this.postedAt,
    this.movementReferences = const <String>[],
    this.lines = const <CountSessionLineDocument>[],
    this.isSynced = false,
  });

  final String id;
  final String warehouseId;
  final String warehouseName;
  final DateTime cutoffAt;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? notes;
  final DateTime? postedAt;
  final List<String> movementReferences;
  final List<CountSessionLineDocument> lines;
  final bool isSynced;

  int get approvedLineCount =>
      lines.where((line) => line.approvedCountedQuantity != null).length;

  CountSessionDocument copyWith({
    String? status,
    DateTime? updatedAt,
    String? notes,
    DateTime? postedAt,
    List<String>? movementReferences,
    List<CountSessionLineDocument>? lines,
    bool? isSynced,
  }) {
    return CountSessionDocument(
      id: id,
      warehouseId: warehouseId,
      warehouseName: warehouseName,
      cutoffAt: cutoffAt,
      status: status ?? this.status,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      notes: notes ?? this.notes,
      postedAt: postedAt ?? this.postedAt,
      movementReferences: movementReferences ?? this.movementReferences,
      lines: lines ?? this.lines,
      isSynced: isSynced ?? this.isSynced,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'warehouseId': warehouseId,
        'warehouseName': warehouseName,
        'cutoffAt': cutoffAt.toIso8601String(),
        'status': status,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'notes': notes,
        'postedAt': postedAt?.toIso8601String(),
        'movementReferences': movementReferences,
        'lines': lines.map((line) => line.toJson()).toList(growable: false),
        'isSynced': isSynced,
      };

  String encodeLines() => jsonEncode(
        lines.map((line) => line.toJson()).toList(growable: false),
      );

  String encodeMovementReferences() => jsonEncode(movementReferences);

  factory CountSessionDocument.fromJson(Map<String, dynamic> json) {
    return CountSessionDocument(
      id: json['id'] as String,
      warehouseId: json['warehouseId'] as String,
      warehouseName: json['warehouseName'] as String,
      cutoffAt: DateTime.parse(json['cutoffAt'] as String),
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      notes: json['notes'] as String?,
      postedAt: json['postedAt'] == null
          ? null
          : DateTime.parse(json['postedAt'] as String),
      movementReferences: (json['movementReferences'] as List<dynamic>? ?? const <dynamic>[])
          .map((entry) => entry as String)
          .toList(growable: false),
      lines: (json['lines'] as List<dynamic>? ?? const <dynamic>[])
          .map(
            (line) => CountSessionLineDocument.fromJson(
              Map<String, dynamic>.from(line as Map),
            ),
          )
          .toList(growable: false),
      isSynced: (json['isSynced'] as bool?) ?? false,
    );
  }

  static List<CountSessionLineDocument> decodeLines(String encoded) {
    final decoded = jsonDecode(encoded) as List<dynamic>;
    return decoded
        .map(
          (line) => CountSessionLineDocument.fromJson(
            Map<String, dynamic>.from(line as Map),
          ),
        )
        .toList(growable: false);
  }

  static List<String> decodeMovementReferences(String encoded) {
    final decoded = jsonDecode(encoded) as List<dynamic>;
    return decoded.map((entry) => entry as String).toList(growable: false);
  }
}
