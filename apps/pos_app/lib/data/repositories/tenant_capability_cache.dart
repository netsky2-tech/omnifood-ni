import 'dart:convert';

import '../../core/clock/monotonic_clock.dart';
import '../../core/config/audit_config.dart';
import '../daos/local_config_dao.dart';
import '../models/local_config_entity.dart';

class TenantCapabilityCache {
  TenantCapabilityCache({
    required LocalConfigDao configDao,
    required MonotonicClock clock,
    required this.bootSessionId,
    DateTime Function()? nowUtc,
  }) : _configDao = configDao,
       _clock = clock,
       _nowUtc = nowUtc ?? (() => DateTime.now().toUtc());

  static const _maxAge = Duration(hours: 24);
  static const _allowedSkew = Duration(minutes: 5);
  final LocalConfigDao _configDao;
  final MonotonicClock _clock;
  final DateTime Function() _nowUtc;
  final String bootSessionId;
  _ActiveCapability? _active;

  Future<bool> refresh({
    required String tenantId,
    required Map<String, Object?> response,
  }) async {
    final capability = _ActiveCapability.fromResponse(
      tenantId: tenantId,
      response: response,
      receivedElapsed: _clock.elapsed(),
      bootSessionId: bootSessionId,
      nowUtc: _nowUtc(),
    );
    if (capability == null) {
      clear();
      return false;
    }

    try {
      await _configDao.saveConfig(
        LocalConfigEntity(
          key: 'audit_cap:$tenantId',
          value: jsonEncode(capability.diagnostics),
        ),
      );
    } catch (_) {
      clear();
      return false;
    }
    _active = capability;
    return true;
  }

  bool hasFreshAuthority(String tenantId) {
    final capability = _active;
    if (capability == null || capability.tenantId != tenantId) return false;
    if (capability.bootSessionId != bootSessionId) return false;
    final age = _clock.elapsed() - capability.receivedElapsed;
    return age >= Duration.zero && age <= capability.validFor;
  }

  bool isV3Eligible(String tenantId) =>
      auditV3ProducerEnabled && hasFreshAuthority(tenantId);

  void clear() => _active = null;
}

class _ActiveCapability {
  const _ActiveCapability({
    required this.tenantId,
    required this.receivedElapsed,
    required this.bootSessionId,
    required this.validFor,
    required this.diagnostics,
  });

  final String tenantId;
  final Duration receivedElapsed;
  final String bootSessionId;
  final Duration validFor;
  final Map<String, Object> diagnostics;

  static _ActiveCapability? fromResponse({
    required String tenantId,
    required Map<String, Object?> response,
    required Duration receivedElapsed,
    required String bootSessionId,
    required DateTime nowUtc,
  }) {
    final responseTenant = response['tenant_id'];
    final activeVersion = response['active_version'];
    final contractVersion = response['contract_version'];
    final fetchedAt = response['server_fetched_at'];
    final expiresAt = response['server_expires_at'];
    final fetched = fetchedAt is String ? DateTime.tryParse(fetchedAt)?.toUtc() : null;
    final expires = expiresAt is String ? DateTime.tryParse(expiresAt)?.toUtc() : null;
    final receipt = nowUtc.toUtc();
    if (tenantId.isEmpty ||
        responseTenant != tenantId ||
        activeVersion is! String ||
        activeVersion != 'v3-jcs-rfc8785' ||
        contractVersion is! int ||
        contractVersion != 1 ||
        fetched == null || expires == null ||
        !fetched.isBefore(expires) ||
        expires.difference(fetched) > TenantCapabilityCache._maxAge ||
        receipt.isBefore(fetched.subtract(TenantCapabilityCache._allowedSkew)) ||
        !receipt.isBefore(expires)) {
      return null;
    }
    return _ActiveCapability(
      tenantId: tenantId,
      receivedElapsed: receivedElapsed,
      bootSessionId: bootSessionId,
      validFor: expires.difference(receipt),
      diagnostics: <String, Object>{
        'tenant_id': tenantId,
        'active_version': activeVersion,
        'contract_version': contractVersion,
        'server_fetched_at': fetchedAt as String,
        'server_expires_at': expiresAt as String,
      },
    );
  }
}
