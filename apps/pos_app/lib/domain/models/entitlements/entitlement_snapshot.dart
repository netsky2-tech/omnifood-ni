/// ENT-04 — offline entitlement snapshot contract (catalog
/// `docs/plans/entitlements/catalogo_capacidades_v1.md` §9).
///
/// This is a cached transport contract, NOT a domain aggregate: it mirrors
/// the backend DTO served by `GET /api/tenant/entitlements` so the POS can
/// persist it offline. It is deliberately a plain immutable class instead of
/// Freezed, and build_runner is never run for it — a hand-written
/// `fromJson`/`toJson` keeps the cached wire contract explicit and avoids a
/// code-generation cycle for a payload that must parse defensively on every
/// boot (§6.6: corrupt, absent or expired snapshot keeps only the nucleus).
///
/// Defensive parsing: `fromJson` never throws on a malformed payload; every
/// field degrades to its "absent" value instead. An empty snapshot grants NO
/// premium capability and NO limit — the nucleus is never checked through
/// this model (catalog §7).
class EntitlementSnapshot {
  const EntitlementSnapshot({
    this.version = 0,
    this.planCode,
    this.status,
    this.supportTier,
    this.capabilities = const [],
    this.limits = const {},
    this.addOns = const [],
    this.issuedAt,
    this.expiresAt,
  });

  /// Models "no snapshot available": no premium capabilities, no limits.
  /// The POS keeps selling; only premium features stay closed (§6.6).
  factory EntitlementSnapshot.empty() => const EntitlementSnapshot();

  final int version;

  /// Null when the tenant has no subscription (`sin_plan`).
  final String? planCode;
  final String? status;
  final String? supportTier;
  final List<String> capabilities;

  /// Resolved limit keys; a stored `null` value means unlimited. An absent
  /// key is treated as unlimited too ([EntitlementSnapshot] consumers call
  /// through the service's `limit()`).
  final Map<String, int?> limits;
  final List<String> addOns;
  final DateTime? issuedAt;

  /// TTL of the cached snapshot (24h from [issuedAt] on the backend).
  final DateTime? expiresAt;

  /// True when the cached snapshot must be treated as absent (§6.6). A
  /// missing `expiresAt` counts as expired: an unverifiable TTL is not a
  /// licence to keep serving premium capabilities offline forever.
  bool isExpiredAt(DateTime now) {
    final expires = expiresAt;
    return expires == null || !now.isBefore(expires);
  }

  factory EntitlementSnapshot.fromJson(Map<String, Object?> json) {
    try {
      return EntitlementSnapshot(
        version: _readVersion(json['version']),
        planCode: _readString(json['planCode']),
        status: _readString(json['status']),
        supportTier: _readString(json['supportTier']),
        capabilities: _readStringList(json['capabilities']),
        limits: _readLimits(json['limits']),
        addOns: _readStringList(json['addOns']),
        issuedAt: _readDateTime(json['issuedAt']),
        expiresAt: _readDateTime(json['expiresAt']),
      );
    } catch (_) {
      // Defensive by contract: any unexpected structural failure degrades to
      // "no snapshot" instead of crashing the caller (§6.6).
      return EntitlementSnapshot.empty();
    }
  }

  Map<String, Object?> toJson() => {
        'version': version,
        'planCode': planCode,
        'status': status,
        'supportTier': supportTier,
        'capabilities': List<String>.unmodifiable(capabilities),
        'limits': Map<String, int?>.unmodifiable(limits),
        'addOns': List<String>.unmodifiable(addOns),
        'issuedAt': issuedAt?.toIso8601String(),
        'expiresAt': expiresAt?.toIso8601String(),
      };

  static int _readVersion(Object? value) {
    if (value is int) return value;
    if (value is num) return value.round();
    if (value is String) return int.tryParse(value.trim()) ?? 0;
    return 0;
  }

  static String? _readString(Object? value) {
    if (value is String) {
      final trimmed = value.trim();
      return trimmed.isEmpty ? null : trimmed;
    }
    return null;
  }

  static List<String> _readStringList(Object? value) {
    if (value is List) {
      return value
          .whereType<String>()
          .map((entry) => entry.trim())
          .where((entry) => entry.isNotEmpty)
          .toList(growable: false);
    }
    return const [];
  }

  static Map<String, int?> _readLimits(Object? value) {
    if (value is! Map) return const {};
    final resolved = <String, int?>{};
    for (final entry in value.entries) {
      final key = entry.key;
      if (key is! String || key.trim().isEmpty) continue;
      final raw = entry.value;
      // `null` is a VALID stored value: it means unlimited. Only
      // unparseable non-null values are dropped (an absent key is also
      // unlimited, so dropping preserves the semantics).
      if (raw == null) {
        resolved[key] = null;
      } else if (raw is int) {
        resolved[key] = raw;
      } else if (raw is num && raw == raw.round()) {
        resolved[key] = raw.round();
      } else if (raw is String) {
        final parsed = int.tryParse(raw.trim());
        if (parsed != null) resolved[key] = parsed;
      }
    }
    return Map<String, int?>.unmodifiable(resolved);
  }

  static DateTime? _readDateTime(Object? value) {
    if (value is String) {
      return DateTime.tryParse(value.trim())?.toUtc();
    }
    return null;
  }

  /// True when what the tenant is ENTITLED to is unchanged, ignoring the
  /// issuance window (`issuedAt`/`expiresAt`) and the contract `version`.
  ///
  /// A refresh that only renews the TTL is not a plan change: treating it as
  /// one would release every plan-blocked domain on each sync pass and flood
  /// the server with operations the plan still refuses (catalog §6.3 point 3).
  bool hasSameEntitlementsAs(EntitlementSnapshot other) =>
      planCode == other.planCode &&
      status == other.status &&
      supportTier == other.supportTier &&
      _listEquals(capabilities, other.capabilities) &&
      _listEquals(addOns, other.addOns) &&
      _mapEquals(limits, other.limits);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is EntitlementSnapshot &&
        other.version == version &&
        other.planCode == planCode &&
        other.status == status &&
        other.supportTier == supportTier &&
        _listEquals(other.capabilities, capabilities) &&
        _mapEquals(other.limits, limits) &&
        _listEquals(other.addOns, addOns) &&
        other.issuedAt == issuedAt &&
        other.expiresAt == expiresAt;
  }

  @override
  int get hashCode => Object.hash(
        version,
        planCode,
        status,
        supportTier,
        Object.hashAll(capabilities),
        Object.hashAll(limits.keys),
        Object.hashAll(limits.values),
        Object.hashAll(addOns),
        issuedAt,
        expiresAt,
      );

  @override
  String toString() =>
      'EntitlementSnapshot(v$version, plan: $planCode, status: $status, '
      'capabilities: ${capabilities.length}, limits: ${limits.length})';

  static bool _listEquals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  static bool _mapEquals(Map<String, int?> a, Map<String, int?> b) {
    if (a.length != b.length) return false;
    for (final entry in a.entries) {
      if (b[entry.key] != entry.value) return false;
    }
    return true;
  }
}
