// Robust numeric casting utilities (AGENTS.md / PRD data isolation).
//
// PostgreSQL numeric/decimal columns are serialized as JSON strings by
// the TypeORM/pg driver to preserve decimal precision without IEEE 754 drift.
// These helpers coerce both num and String representations into safe
// typed primitives, returning null when absent or unparseable.

double? asDouble(dynamic val) {
  if (val == null) return null;
  if (val is num) return val.toDouble();
  if (val is String) {
    final trimmed = val.trim();
    if (trimmed.isEmpty) return null;
    return double.tryParse(trimmed);
  }
  return null;
}

int? asInt(dynamic val) {
  if (val == null) return null;
  if (val is num) return val.toInt();
  if (val is String) {
    final trimmed = val.trim();
    if (trimmed.isEmpty) return null;
    return int.tryParse(trimmed);
  }
  return null;
}
