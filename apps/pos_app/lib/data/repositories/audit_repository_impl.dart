import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';

import '../../domain/models/audit_log.dart';
import '../../domain/models/user.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/audit_log_dao.dart';
import '../daos/inventory/forensic_alert_dao.dart';
import '../models/audit_log_entity.dart';
import '../mappers/audit_mapper.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';
import '../../core/audit/v3/canonicalizer.dart';
import '../../core/audit/v3/frame.dart';
import '../../core/audit/v3/sha256.dart';
import '../../core/audit/v3/types.dart';
import 'tenant_capability_cache.dart';

class AuditRepositoryImpl implements AuditRepository {
  final AuditDao _auditDao;
  final AuthRepository _authRepository;
  final Dio _dio;
  final String _deviceId;
  final TenantCapabilityCache _capabilityCache;
  final ForensicAlertDao _forensicAlertDao;
  final DateTime Function() _now;
  static const _uuid = Uuid();
  static const _forensicHashVersion = 'v2-canonical-json';

  AuditRepositoryImpl(
    this._auditDao,
    this._authRepository,
    this._dio,
    this._deviceId, {
    required TenantCapabilityCache capabilityCache,
    required ForensicAlertDao forensicAlertDao,
    DateTime Function()? now,
  }) : _capabilityCache = capabilityCache,
       _forensicAlertDao = forensicAlertDao,
       _now = now ?? DateTime.now;

  @override
  String get deviceId => _deviceId;

  @override
  Future<void> log(String action, {String? metadata}) async {
    return logForensic(action, metadata: metadata);
  }

  @override
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {
    final user = await _authRepository.getCurrentUser();
    final tenantId = user?.tenantId;
    if (user == null || tenantId == null || tenantId.isEmpty) return;
    await _auditDao.appendForensicLog(
      tenantId,
      _deviceId,
      user.id,
      (sequenceNo, prevHash) => _buildAuditEntity(
        user,
        tenantId,
        action,
        sequenceNo: sequenceNo,
        prevHash: prevHash,
        metadata: metadata,
        metodoAutorizacion: metodoAutorizacion,
        usuarioAutorizadorId: usuarioAutorizadorId,
      ),
    );
  }

  @override
  Future<AuditLog?> prepareLog(String action, {String? metadata}) async {
    final user = await _authRepository.getCurrentUser();
    final tenantId = user?.tenantId;
    if (user == null || tenantId == null || tenantId.isEmpty) return null;
    final head = await _auditDao.getLastAuditLogByStream(
      tenantId,
      _deviceId,
      user.id,
    );
    return AuditMapper.toDomain(
      _buildAuditEntity(
        user,
        tenantId,
        action,
        sequenceNo: (head?.sequenceNo ?? 0) + 1,
        prevHash: head?.entryHash ?? 'GENESIS',
        metadata: metadata,
      ),
    );
  }

  /// Builds a forensic [AuditLogEntity] from a stream head without persisting.
  AuditLogEntity _buildAuditEntity(
    User user,
    String tenantId,
    String action, {
    required int sequenceNo,
    required String prevHash,
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) {
    final timestamp = _now().toIso8601String();
    final metadataObject = _normalizeMetadataToJsonObject(metadata);
    final canonicalMetadata = jsonEncode(metadataObject);
    final selectedVersion = _capabilityCache.isV3Eligible(tenantId)
        ? 'v3-jcs-rfc8785'
        : _forensicHashVersion;
    final v3Provenance = selectedVersion == 'v3-jcs-rfc8785'
        ? _buildV3Provenance(
            user.id,
            action,
            timestamp,
            sequenceNo,
            prevHash,
            metadata,
            metodoAutorizacion,
            usuarioAutorizadorId,
          )
        : null;
    if (selectedVersion == 'v3-jcs-rfc8785' && v3Provenance == null) {
      throw StateError('Unable to construct v3 audit evidence');
    }
    final hashVersion = v3Provenance == null
        ? _forensicHashVersion
        : selectedVersion;
    final entryHash =
        v3Provenance?.$1 ??
        _computeCanonicalHash(
          userId: user.id,
          action: action,
          timestamp: timestamp,
          sequenceNo: sequenceNo,
          prevHash: prevHash,
          metodoAutorizacion: metodoAutorizacion,
          usuarioAutorizadorId: usuarioAutorizadorId,
          canonicalMetadata: canonicalMetadata,
        );

    return AuditLogEntity(
      userId: user.id,
      action: action,
      timestamp: timestamp,
      deviceId: _deviceId,
      metadata: v3Provenance?.$2 ?? canonicalMetadata,
      isSynced: false,
      sequenceNo: sequenceNo,
      prevHash: prevHash,
      entryHash: entryHash,
      metodoAutorizacion: metodoAutorizacion,
      usuarioAutorizadorId: usuarioAutorizadorId,
      remoteRefUuid: _uuid.v4(),
      hashVersion: hashVersion,
      hasMetodoAutorizacion: metodoAutorizacion != null,
      hasUsuarioAutorizadorId: usuarioAutorizadorId != null,
      tenantId: tenantId,
      metadataRaw: metadata,
    );
  }

  (String, String)? _buildV3Provenance(
    String userId,
    String action,
    String timestamp,
    int sequenceNo,
    String prevHash,
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  ) {
    final canonical = canonicalizeNumberFreeJson(
      utf8.encode(metadata ?? 'null'),
    );
    if (canonical is! AuditV3Success<Uint8List>) return null;
    final frame = buildAuditV3Frame(
      AuditV3FrameFields(
        userId: userId,
        resolvedAction: action,
        deviceId: _deviceId,
        timestamp: timestamp,
        sequenceNo: '$sequenceNo',
        prevHash: prevHash,
        metodoAutorizacion: metodoAutorizacion == null
            ? const FieldState.absent()
            : FieldState.text(metodoAutorizacion),
        usuarioAutorizadorId: usuarioAutorizadorId == null
            ? const FieldState.absent()
            : FieldState.text(usuarioAutorizadorId),
      ),
      canonical.value,
    );
    return frame is AuditV3Success<Uint8List>
        ? (sha256LowerHex(frame.value), utf8.decode(canonical.value))
        : null;
  }

  @override
  Future<AuditSyncOutcome> syncLogs() async {
    final unsynced = await _auditDao.findUnsyncedLogs();
    if (unsynced.isEmpty) return const AuditSyncOutcome.complete();
    var completedStreams = 0;
    var failedStreams = 0;
    var offlineFailures = 0;
    var terminalFailures = 0;
    final legacy = unsynced.where((row) => row.tenantId == null).toList();
    if (legacy.isNotEmpty) {
      final result = await _syncLegacy(legacy);
      if (result.$1) {
        completedStreams++;
      } else {
        failedStreams++;
        if (result.$2) offlineFailures++;
        if (result.$3) terminalFailures++;
      }
    }
    final activeTenantId = (await _authRepository.getCurrentUser())?.tenantId;
    if (activeTenantId == null || activeTenantId.isEmpty) {
      return _outcome(
        completedStreams,
        failedStreams,
        offlineFailures,
        terminalFailures,
      );
    }
    final streams = <(String, String, String), List<AuditLogEntity>>{};
    for (final row in unsynced.where((row) => row.tenantId == activeTenantId)) {
      streams
          .putIfAbsent((
            row.tenantId!,
            row.deviceId,
            row.userId,
          ), () => <AuditLogEntity>[])
          .add(row);
    }
    final orderedStreams = streams.entries.toList()
      ..sort((a, b) => _compareStream(a.key, b.key));
    for (final stream in orderedStreams) {
      final result = await _syncStream(stream.key, stream.value);
      if (result.$1) {
        completedStreams++;
      } else {
        failedStreams++;
        if (result.$2) offlineFailures++;
        if (result.$3) terminalFailures++;
      }
    }
    return _outcome(
      completedStreams,
      failedStreams,
      offlineFailures,
      terminalFailures,
    );
  }

  AuditSyncOutcome _outcome(
    int completedStreams,
    int failedStreams,
    int offlineFailures,
    int terminalFailures,
  ) {
    if (failedStreams == 0) {
      return AuditSyncOutcome.complete(completedStreams: completedStreams);
    }
    if (completedStreams > 0) {
      return AuditSyncOutcome.partial(
        completedStreams: completedStreams,
        failedStreams: failedStreams,
      );
    }
    if (terminalFailures > 0) {
      return AuditSyncOutcome.terminal(failedStreams: failedStreams);
    }
    return offlineFailures == failedStreams
        ? AuditSyncOutcome.offline(failedStreams: failedStreams)
        : AuditSyncOutcome.retryable(failedStreams: failedStreams);
  }

  Future<(bool, bool, bool)> _syncLegacy(List<AuditLogEntity> rows) async {
    if ((await _forensicAlertDao.countActiveAuditTerminalAlerts(
              rows.first.remoteRefUuid,
            ) ??
            0) >
        0) {
      return (false, false, true);
    }
    try {
      await _dio.post(
        '/identity/audit',
        data: {'logs': rows.map(_payload).toList()},
      );
      await _auditDao.markAsSynced(rows.map((row) => row.id!).toList());
      return (true, false, false);
    } catch (error) {
      final terminal = _isTerminalBackendRejection(error);
      if (terminal) {
        final row = rows.first;
        await _recordTerminalRejection(row, (
          'legacy',
          row.deviceId,
          row.userId,
        ), error as DioException);
      }
      return (false, _isOffline(error), terminal);
    }
  }

  Future<(bool, bool, bool)> _syncStream(
    (String, String, String) stream,
    List<AuditLogEntity> rows,
  ) async {
    rows.sort((a, b) {
      final sequence = a.sequenceNo.compareTo(b.sequenceNo);
      return sequence != 0
          ? sequence
          : a.remoteRefUuid.compareTo(b.remoteRefUuid);
    });
    if (rows.isNotEmpty &&
        (await _forensicAlertDao.countActiveAuditTerminalAlerts(
                  rows.first.remoteRefUuid,
                ) ??
                0) >
            0) {
      return (false, false, true);
    }
    final safe = <AuditLogEntity>[];
    AuditLogEntity? previous;
    for (var index = 0; index < rows.length; index++) {
      final row = rows[index];
      if (index + 1 < rows.length &&
          row.sequenceNo == rows[index + 1].sequenceNo) {
        await _recordIncident(row, stream, 'duplicate_sequence');
        break;
      }
      if (!_isContiguous(row, previous)) break;
      try {
        _payload(row);
      } catch (_) {
        if (row.hashVersion == 'v3-jcs-rfc8785') {
          await _recordIncident(row, stream, 'v3_payload_unserializable');
        }
        break;
      }
      safe.add(row);
      previous = row;
    }
    if (safe.isEmpty) return (false, false, false);
    for (final row in safe) {
      try {
        final response = await _dio.post(
          '/identity/audit',
          data: {'logs': [_payload(row)]},
        );
        final accepted = _acceptedRows([row], response.data);
        if (accepted.isNotEmpty) {
          await _auditDao.markAsSynced(accepted.map((row) => row.id!).toList());
        }
        if (accepted.length != 1) return (false, false, false);
      } catch (error) {
        if (_isTerminalBackendRejection(error)) {
          await _recordTerminalRejection(
            row,
            stream,
            error as DioException,
          );
        }
        return (false, _isOffline(error), _isTerminalBackendRejection(error));
      }
    }
    return (safe.length == rows.length, false, false);
  }

  bool _isOffline(Object error) =>
      error is DioException &&
      (error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.connectionTimeout);

  bool _isTerminalBackendRejection(Object error) =>
      error is DioException &&
      (error.response?.statusCode == 400 || error.response?.statusCode == 409);

  bool _isContiguous(AuditLogEntity row, AuditLogEntity? previous) {
    if (row.sequenceNo <= 0 || row.prevHash.isEmpty) return false;
    if (previous == null) {
      return row.sequenceNo != 1 || row.prevHash == 'GENESIS';
    }
    return row.sequenceNo == previous.sequenceNo + 1 &&
        row.prevHash == previous.entryHash;
  }

  int _compareStream(
    (String, String, String) left,
    (String, String, String) right,
  ) {
    for (final pair in [
      (left.$1, right.$1),
      (left.$2, right.$2),
      (left.$3, right.$3),
    ]) {
      final result = pair.$1.compareTo(pair.$2);
      if (result != 0) return result;
    }
    return 0;
  }

  List<AuditLogEntity> _acceptedRows(
    List<AuditLogEntity> rows,
    dynamic response,
  ) {
    if (response is! Map) return const [];
    final ids = response['accepted_ids'];
    if (ids is List) {
      final accepted = ids.whereType<String>().toSet();
      return rows.where((row) => accepted.contains(row.remoteRefUuid)).toList();
    }
    return response['count'] == rows.length ? rows : const [];
  }

  Future<void> _recordIncident(
    AuditLogEntity row,
    (String, String, String) stream,
    String failureType,
  ) async {
    final metadata = jsonEncode({
      'tenant_id': stream.$1,
      'device_id': stream.$2,
      'user_id': stream.$3,
      'sequence_no': row.sequenceNo,
      'hash_version': row.hashVersion,
      'failure_type': failureType,
    });
    try {
      await _forensicAlertDao.insertIfAbsentForensicAlert(
        'audit-$failureType-${sha256.convert(utf8.encode(row.remoteRefUuid))}',
        failureType == 'duplicate_sequence'
            ? 'AUDIT_STREAM_DUPLICATE_SEQUENCE'
            : 'AUDIT_V3_POISON',
        'critical',
        failureType == 'duplicate_sequence'
            ? 'Audit stream contains a duplicate sequence.'
            : 'Audit v3 payload cannot be serialized.',
        _now().toUtc().toIso8601String(),
        'active',
        'audit_log',
        row.remoteRefUuid,
        metadata,
        false,
      );
    } catch (_) {}
  }

  Future<void> _recordTerminalRejection(
    AuditLogEntity row,
    (String, String, String) stream,
    DioException error,
  ) async {
    final statusCode = error.response?.statusCode;
    final category = 'http_$statusCode';
    final streamKey = sha256
        .convert(utf8.encode('${stream.$1}|${stream.$2}|${stream.$3}'))
        .toString();
    try {
      await _forensicAlertDao.insertIfAbsentForensicAlert(
        'audit-terminal-rejection-${sha256.convert(utf8.encode(row.remoteRefUuid))}',
        'AUDIT_BACKEND_TERMINAL_REJECTION',
        'critical',
        'Audit backend rejected forensic evidence ($category).',
        _now().toUtc().toIso8601String(),
        'active',
        'audit_log',
        row.remoteRefUuid,
        jsonEncode({
          'stream_key': streamKey,
          'sequence_no': row.sequenceNo,
          'hash_version': row.hashVersion,
          'status_code': statusCode,
          'backend_category': category,
        }),
        false,
      );
    } catch (_) {}
  }

  Map<String, dynamic> _payload(AuditLogEntity e) {
    final isV3 = e.hashVersion == 'v3-jcs-rfc8785';
    final metadataRaw =
        e.metadataRaw ??
        (isV3 ? (e.metadata ?? 'null') : _extractLegacyMetadataRaw(e.metadata));
    final payload = <String, dynamic>{
      'id': e.remoteRefUuid,
      'user_id': e.userId,
      'action': e.action,
      'timestamp': e.timestamp,
      'device_id': e.deviceId,
      'sequence_no': e.sequenceNo,
      'prev_hash': e.prevHash,
      'entry_hash': e.entryHash,
      'metadata': isV3
          ? jsonDecode(metadataRaw!)
          : _normalizeMetadataToJsonObject(e.metadata),
      'metadata_raw': metadataRaw,
    };
    if (!isV3 || e.hasMetodoAutorizacion == true) {
      payload['metodo_autorizacion'] = e.metodoAutorizacion;
    }
    if (!isV3 || e.hasUsuarioAutorizadorId == true) {
      payload['usuario_autorizador_id'] = e.usuarioAutorizadorId;
    }
    if (e.hashVersion != null) payload['hash_version'] = e.hashVersion;
    return payload;
  }

  String _computeCanonicalHash({
    required String userId,
    required String action,
    required String timestamp,
    required int sequenceNo,
    required String prevHash,
    required String canonicalMetadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) {
    final payload =
        '$userId|$action|$_deviceId|$timestamp|$sequenceNo|$prevHash|${metodoAutorizacion ?? 'null'}|${usuarioAutorizadorId ?? 'null'}|$canonicalMetadata';
    return sha256.convert(utf8.encode(payload)).toString();
  }

  String? _extractLegacyMetadataRaw(String? metadata) {
    if (metadata == null || metadata.trim().isEmpty) {
      return null;
    }

    try {
      final decoded = jsonDecode(metadata);
      if (decoded is Map && decoded['raw_text'] is String) {
        return decoded['raw_text'] as String;
      }
      return null;
    } catch (_) {
      return metadata;
    }
  }

  Map<String, dynamic> _normalizeMetadataToJsonObject(String? metadata) {
    if (metadata == null || metadata.trim().isEmpty) {
      return <String, dynamic>{};
    }

    try {
      final decoded = jsonDecode(metadata);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
      return <String, dynamic>{'value': decoded};
    } catch (_) {
      return <String, dynamic>{'raw_text': metadata};
    }
  }

  @override
  Future<List<AuditLog>> getLocalLogs({
    DateTime? start,
    DateTime? end,
    String? userId,
  }) async {
    final startTime =
        (start ?? DateTime.now().subtract(const Duration(days: 30)))
            .toIso8601String();
    final endTime = (end ?? DateTime.now()).toIso8601String();

    final entities = await _auditDao.findLogsWithFilters(
      startTime,
      endTime,
      userId ?? "",
    );
    return entities.map(AuditMapper.toDomain).toList();
  }
}
