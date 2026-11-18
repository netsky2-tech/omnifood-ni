import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';

import '../../../data/daos/local_config_dao.dart';
import '../../../data/models/local_config_entity.dart';
import '../../models/entitlements/entitlement_snapshot.dart';

/// ENT-04 — offline cache of the tenant entitlement snapshot served by
/// `GET /api/tenant/entitlements` (catalog §6 and §9).
///
/// Storage mirrors the existing `TenantCapabilityCache` precedent: a JSON
/// snapshot under a namespaced `local_configs` key (`entitlements:<tenantId>`),
/// NOT a Floor entity and NOT a migration. The snapshot is a cached transport
/// contract: the POS NEVER decides a sale by it (§6.6 / §7 — the nucleus is
/// not gated), it only explains premium features and plan refusals.
///
/// Failure discipline: `load()` and `refresh()` never throw into the UI. A
/// corrupt, missing or expired snapshot resolves to
/// [EntitlementSnapshot.empty]; a failed refresh keeps the previous snapshot.
class EntitlementSnapshotService {
  EntitlementSnapshotService({
    required LocalConfigDao configDao,
    required Dio dio,
    required Future<String?> Function() resolveTenantId,
    DateTime Function()? nowUtc,
  })  : _configDao = configDao,
        _dio = dio,
        _resolveTenantId = resolveTenantId,
        _nowUtc = nowUtc ?? (() => DateTime.now().toUtc());

  /// `local_configs` key prefix, tenant-scoped like the `audit_cap:<tenantId>`
  /// precedent in `TenantCapabilityCache`.
  static const String keyPrefix = 'entitlements:';

  /// Backend route relative to the resolved base URL (the global `/api`
  /// prefix is part of every configured base URL).
  static const String entitlementsPath = '/tenant/entitlements';

  final LocalConfigDao _configDao;
  final Dio _dio;
  final Future<String?> Function() _resolveTenantId;
  final DateTime Function() _nowUtc;

  EntitlementSnapshot _snapshot = const EntitlementSnapshot();

  /// Current in-memory snapshot. Starts as the empty snapshot ("no snapshot":
  /// no premium capabilities, no limits — the nucleus is never checked here).
  EntitlementSnapshot get snapshot => _snapshot;

  bool has(String capability) => _snapshot.capabilities.contains(capability);

  /// Resolved limit for [limitKey]; `null` means unlimited, and an absent key
  /// is treated as unlimited too.
  int? limit(String limitKey) => _snapshot.limits[limitKey];

  final StreamController<EntitlementSnapshot> _changeController =
      StreamController<EntitlementSnapshot>.broadcast();

  /// Emits the snapshot only when its content actually changes (an unchanged
  /// refresh does not emit, so a sync-cycle refresh never spurious-unblocks a
  /// plan-blocked domain watching this stream).
  Stream<EntitlementSnapshot> get onChanged => _changeController.stream;

  /// Reads the persisted snapshot for the resolved tenant. Corrupt JSON, a
  /// missing row, and an `expiresAt` in the past all resolve to
  /// [EntitlementSnapshot.empty] (catalog §6.6).
  Future<EntitlementSnapshot> load() async {
    try {
      final tenantId = await _resolveTenantId();
      if (tenantId == null || tenantId.trim().isEmpty) {
        return _replace(const EntitlementSnapshot());
      }
      final entity =
          await _configDao.getConfigByKey('$keyPrefix${tenantId.trim()}');
      final raw = entity?.value;
      if (raw == null || raw.trim().isEmpty) {
        return _replace(const EntitlementSnapshot());
      }
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return _replace(const EntitlementSnapshot());
      }
      final parsed = EntitlementSnapshot.fromJson(
        Map<String, Object?>.from(decoded),
      );
      if (parsed.isExpiredAt(_nowUtc())) {
        return _replace(const EntitlementSnapshot());
      }
      return _replace(parsed);
    } catch (e, st) {
      developer.log(
        'Entitlement snapshot load failed; treating as no snapshot.',
        name: 'EntitlementSnapshotService',
        error: e,
        stackTrace: st,
      );
      return _replace(const EntitlementSnapshot());
    }
  }

  /// Fetches the fresh snapshot from the backend, stores the raw JSON and
  /// returns it. Any failure (network, non-2xx, storage) keeps the previous
  /// snapshot and never throws into the UI.
  Future<EntitlementSnapshot> refresh() async {
    try {
      final tenantId = await _resolveTenantId();
      if (tenantId == null || tenantId.trim().isEmpty) {
        return _snapshot;
      }
      final response = await _dio.get<dynamic>(entitlementsPath);
      final data = response.data;
      // A payload we cannot parse as a snapshot is not an upgrade over the
      // cached one: keep the previous snapshot untouched.
      if (data is! Map) {
        return _snapshot;
      }
      final parsed = EntitlementSnapshot.fromJson(
        Map<String, Object?>.from(data),
      );
      // Server time is authoritative for the TTL: the payload is stored even
      // if a skewed device clock already considers it expired — the next
      // `load()` applies the §6.6 expiry rule uniformly.
      await _configDao.saveConfig(
        LocalConfigEntity(
          key: '$keyPrefix${tenantId.trim()}',
          value: jsonEncode(data),
          description: 'ENT-04 tenant entitlement snapshot (24h TTL)',
        ),
      );
      return _replace(parsed);
    } on DioException catch (e, st) {
      developer.log(
        'Entitlement snapshot refresh failed '
        '(status ${e.response?.statusCode}); keeping the previous snapshot.',
        name: 'EntitlementSnapshotService',
        error: e,
        stackTrace: st,
      );
      return _snapshot;
    } catch (e, st) {
      developer.log(
        'Entitlement snapshot refresh failed; keeping the previous snapshot.',
        name: 'EntitlementSnapshotService',
        error: e,
        stackTrace: st,
      );
      return _snapshot;
    }
  }

  /// Swaps the in-memory snapshot and notifies watchers only when the
  /// ENTITLEMENT content differs — not when a refresh merely renews the TTL.
  /// When it is unchanged, the SAME instance is kept so identity stays a cheap
  /// "plan changed" signal for SyncService (ENT-04, catalog §6.3 point 3).
  EntitlementSnapshot _replace(EntitlementSnapshot next) {
    final previous = _snapshot;
    if (previous.hasSameEntitlementsAs(next)) return previous;
    _snapshot = next;
    if (!_changeController.isClosed) {
      _changeController.add(next);
    }
    return _snapshot;
  }

  void dispose() {
    _changeController.close();
  }
}
