import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';

import '../../domain/models/audit_log.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/audit_log_dao.dart';
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
  final DateTime Function() _now;
  static const _uuid = Uuid();
  static const _forensicHashVersion = 'v2-canonical-json';

  AuditRepositoryImpl(
    this._auditDao,
    this._authRepository,
    this._dio,
    this._deviceId, {
    required TenantCapabilityCache capabilityCache,
    DateTime Function()? now,
  }) : _capabilityCache = capabilityCache, _now = now ?? DateTime.now;

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
    final entity = await _buildAuditEntity(
      action,
      metadata: metadata,
      metodoAutorizacion: metodoAutorizacion,
      usuarioAutorizadorId: usuarioAutorizadorId,
    );
    if (entity == null) return;
    await _auditDao.insertLog(entity);
  }

  @override
  Future<AuditLog?> prepareLog(String action, {String? metadata}) async {
    final entity = await _buildAuditEntity(action, metadata: metadata);
    if (entity == null) return null;
    return AuditMapper.toDomain(entity);
  }

  /// Builds the forensic, hash-chained [AuditLogEntity] WITHOUT persisting
  /// it. Returns `null` when there is no current user (mirrors [log]).
  Future<AuditLogEntity?> _buildAuditEntity(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {
    final user = await _authRepository.getCurrentUser();
    final tenantId = user?.tenantId;
    if (user == null || tenantId == null || tenantId.isEmpty) return null;

    final lastSeq = await _auditDao.getLastSequenceNoByStream(
      tenantId,
      _deviceId,
      user.id,
    );
    final nextSeq = (lastSeq ?? 0) + 1;
    final prevHash =
        await _auditDao.getLastEntryHashByStream(
          tenantId,
          _deviceId,
          user.id,
        ) ??
        'GENESIS';

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
            nextSeq,
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
          sequenceNo: nextSeq,
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
      sequenceNo: nextSeq,
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
  Future<void> syncLogs() async {
    final unsynced = await _auditDao.findUnsyncedLogs();
    if (unsynced.isEmpty) return;

    try {
      final logsJson = <Map<String, dynamic>>[];
      for (final e in unsynced) {
        final isV3 = e.hashVersion == 'v3-jcs-rfc8785';
        final normalizedMetadata = _normalizeMetadataToJsonObject(e.metadata);
        final metadataRaw = e.metadataRaw ??
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
          'metadata': isV3 ? jsonDecode(metadataRaw!) : normalizedMetadata,
          'metadata_raw': metadataRaw,
        };
        if (!isV3 || e.hasMetodoAutorizacion == true) {
          payload['metodo_autorizacion'] = e.metodoAutorizacion;
        }
        if (!isV3 || e.hasUsuarioAutorizadorId == true) {
          payload['usuario_autorizador_id'] = e.usuarioAutorizadorId;
        }
        if (e.hashVersion != null) {
          payload['hash_version'] = e.hashVersion;
        }
        logsJson.add(payload);
      }

      await _dio.post('/identity/audit', data: {'logs': logsJson});

      final ids = unsynced.map((e) => e.id!).toList();
      await _auditDao.markAsSynced(ids);
    } catch (e) {
      // Offline or error
    }
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
