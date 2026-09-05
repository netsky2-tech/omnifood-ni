import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'cloud_credentials.dart';

enum CredentialRecordPhase { prepared, committed }

enum CredentialState { active, cleared }

enum CredentialRecordStatus { absent, invalid, prepared, committed }

enum CredentialSlot { a, b }

final _uint64Max = BigInt.parse('18446744073709551615');
const _baseKeys = {
  'schemaVersion',
  'generation',
  'previousGeneration',
  'writerEpoch',
  'commitId',
  'state',
  'credentialState',
  'issuedAt',
  'checksum',
};
const _activeKeys = {'accessToken', 'refreshToken', 'userId', 'tenantId'};

class CloudCredentialRecord {
  CloudCredentialRecord._({
    required this.generation,
    required this.previousGeneration,
    required this.writerEpoch,
    required this.commitId,
    required this.state,
    required this.credentialState,
    required this.issuedAtUtc,
    this.credentials,
  });

  factory CloudCredentialRecord.active({
    required BigInt generation,
    required BigInt? previousGeneration,
    required BigInt writerEpoch,
    required String commitId,
    required CredentialRecordPhase state,
    required CloudCredentials credentials,
  }) => CloudCredentialRecord._validated(
    generation: generation,
    previousGeneration: previousGeneration,
    writerEpoch: writerEpoch,
    commitId: commitId,
    state: state,
    credentialState: CredentialState.active,
    issuedAtUtc: credentials.issuedAtUtc,
    credentials: credentials,
  );

  factory CloudCredentialRecord.cleared({
    required BigInt generation,
    BigInt? previousGeneration,
    required BigInt writerEpoch,
    required String commitId,
    required CredentialRecordPhase state,
    required DateTime issuedAtUtc,
  }) => CloudCredentialRecord._validated(
    generation: generation,
    previousGeneration: previousGeneration,
    writerEpoch: writerEpoch,
    commitId: commitId,
    state: state,
    credentialState: CredentialState.cleared,
    issuedAtUtc: issuedAtUtc,
  );

  factory CloudCredentialRecord._validated({
    required BigInt generation,
    required BigInt? previousGeneration,
    required BigInt writerEpoch,
    required String commitId,
    required CredentialRecordPhase state,
    required CredentialState credentialState,
    required DateTime issuedAtUtc,
    CloudCredentials? credentials,
  }) {
    if (!_validChain(generation, previousGeneration) ||
        !_positiveUint(writerEpoch) ||
        !_uuid(commitId) ||
        !issuedAtUtc.isUtc ||
        (credentialState == CredentialState.active && credentials == null) ||
        (credentialState == CredentialState.cleared && credentials != null)) {
      throw ArgumentError('Invalid credential record metadata.');
    }
    return CloudCredentialRecord._(
      generation: generation,
      previousGeneration: previousGeneration,
      writerEpoch: writerEpoch,
      commitId: commitId,
      state: state,
      credentialState: credentialState,
      issuedAtUtc: issuedAtUtc,
      credentials: credentials,
    );
  }

  final BigInt generation;
  final BigInt? previousGeneration;
  final BigInt writerEpoch;
  final String commitId;
  final CredentialRecordPhase state;
  final CredentialState credentialState;
  final DateTime issuedAtUtc;
  final CloudCredentials? credentials;

  String encode() {
    final fields = _fields();
    return jsonEncode({...fields, 'checksum': _checksum(fields)});
  }

  Map<String, dynamic> _fields() {
    final fields = <String, dynamic>{
      'schemaVersion': 1,
      'generation': generation.toString(),
      'previousGeneration': previousGeneration?.toString(),
      'writerEpoch': writerEpoch.toString(),
      'commitId': commitId,
      'state': state.name.toUpperCase(),
      'credentialState': credentialState.name.toUpperCase(),
      'issuedAt': issuedAtUtc.toIso8601String(),
    };
    if (credentials != null) {
      fields.addAll({
        'accessToken': credentials!.accessToken,
        'refreshToken': credentials!.refreshToken,
        'userId': credentials!.userId,
        'tenantId': credentials!.tenantId,
      });
    }
    return fields;
  }

  static CredentialRecordDecodeResult decode(String? raw) {
    if (raw == null) {
      return const CredentialRecordDecodeResult.absent();
    }
    try {
      final map = jsonDecode(raw);
      if (map is! Map) {
        throw const FormatException();
      }
      final fields = Map<String, dynamic>.from(map);
      final credentialState = _parseEnum(
        CredentialState.values,
        fields['credentialState'],
      );
      final expected = credentialState == CredentialState.active
          ? {..._baseKeys, ..._activeKeys}
          : _baseKeys;
      if (fields['schemaVersion'] != 1 ||
          fields.keys.toSet().length != expected.length ||
          !expected.every(fields.containsKey) ||
          !_hex(fields['checksum'])) {
        throw const FormatException();
      }
      final generation = _uint(fields['generation']);
      final previous = fields['previousGeneration'] == null
          ? null
          : _uint(fields['previousGeneration']);
      final writerEpoch = _uint(fields['writerEpoch']);
      final phase = _parseEnum(CredentialRecordPhase.values, fields['state']);
      final issuedAt = _utc(fields['issuedAt']);
      final credentials = credentialState == CredentialState.active
          ? CloudCredentials(
              accessToken: _text(fields['accessToken']),
              refreshToken: _text(fields['refreshToken']),
              userId: _text(fields['userId']),
              tenantId: _text(fields['tenantId']),
              issuedAtUtc: issuedAt,
            )
          : null;
      final record = CloudCredentialRecord._validated(
        generation: generation,
        previousGeneration: previous,
        writerEpoch: writerEpoch,
        commitId: _text(fields['commitId']),
        state: phase,
        credentialState: credentialState,
        issuedAtUtc: issuedAt,
        credentials: credentials,
      );
      if (_checksum(record._fields()) != fields['checksum']) {
        throw const FormatException();
      }
      return CredentialRecordDecodeResult(
        record,
        phase == CredentialRecordPhase.prepared
            ? CredentialRecordStatus.prepared
            : CredentialRecordStatus.committed,
      );
    } catch (_) {
      return const CredentialRecordDecodeResult.invalid();
    }
  }

  static bool _validChain(BigInt generation, BigInt? previous) =>
      _positiveUint(generation) &&
      ((generation == BigInt.one && previous == null) ||
          (generation > BigInt.one && previous == generation - BigInt.one));
  static bool _positiveUint(BigInt value) =>
      value > BigInt.zero && value <= _uint64Max;
  static BigInt _uint(dynamic value) {
    if (value is! String || !RegExp(r'^[1-9][0-9]*$').hasMatch(value)) {
      throw const FormatException();
    }
    final parsed = BigInt.parse(value);
    if (!_positiveUint(parsed)) {
      throw const FormatException();
    }
    return parsed;
  }

  static T _parseEnum<T extends Enum>(List<T> values, dynamic value) {
    if (value is! String) {
      throw const FormatException();
    }
    return values.firstWhere((item) => item.name.toUpperCase() == value);
  }

  static String _text(dynamic value) {
    if (value is! String || value.isEmpty) {
      throw const FormatException();
    }
    return value;
  }

  static DateTime _utc(dynamic value) {
    if (value is! String || !value.endsWith('Z')) {
      throw const FormatException();
    }
    final date = DateTime.tryParse(value);
    if (date == null || !date.isUtc) {
      throw const FormatException();
    }
    return date;
  }

  static bool _uuid(dynamic value) =>
      value is String &&
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        caseSensitive: false,
      ).hasMatch(value);
  static bool _hex(dynamic value) =>
      value is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(value);

  // JSON uint64 values use canonical unsigned decimal strings for cross-runtime exactness.
  static String _checksum(Map<String, dynamic> fields) =>
      sha256.convert(utf8.encode(_canonical(fields))).toString();
  static String _canonical(dynamic value) {
    if (value is Map) {
      final keys = value.keys.cast<String>().toList()..sort();
      return '{${keys.map((key) => '${jsonEncode(key)}:${_canonical(value[key])}').join(',')}}';
    }
    if (value is List) {
      return '[${value.map(_canonical).join(',')}]';
    }
    return jsonEncode(value);
  }
}

class CredentialRecordDecodeResult {
  const CredentialRecordDecodeResult(this.record, this.status);
  const CredentialRecordDecodeResult.absent()
    : this(null, CredentialRecordStatus.absent);
  const CredentialRecordDecodeResult.invalid()
    : this(null, CredentialRecordStatus.invalid);
  final CloudCredentialRecord? record;
  final CredentialRecordStatus status;
}

enum CredentialHintStatus { absent, invalid, valid }

class CredentialHintDecodeResult {
  const CredentialHintDecodeResult(this.hint, this.status);
  final CloudCredentialHint? hint;
  final CredentialHintStatus status;
}

class CloudCredentialHint {
  CloudCredentialHint({
    required this.generation,
    required this.slot,
    required this.commitId,
    required this.checksum,
  }) {
    if (!CloudCredentialRecord._positiveUint(generation) ||
        !CloudCredentialRecord._uuid(commitId) ||
        !CloudCredentialRecord._hex(checksum)) {
      throw ArgumentError('Invalid credential hint.');
    }
  }
  final BigInt generation;
  final CredentialSlot slot;
  final String commitId, checksum;

  static CredentialHintDecodeResult decode(String? raw) {
    if (raw == null) {
      return CredentialHintDecodeResult(null, CredentialHintStatus.absent);
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        throw const FormatException();
      }
      final fields = Map<String, dynamic>.from(decoded);
      const expected = {'generation', 'slot', 'commitId', 'checksum'};
      if (fields.keys.toSet().length != expected.length ||
          !expected.every(fields.containsKey)) {
        throw const FormatException();
      }
      return CredentialHintDecodeResult(
        CloudCredentialHint(
          generation: CloudCredentialRecord._uint(fields['generation']),
          slot: CloudCredentialRecord._parseEnum(
            CredentialSlot.values,
            fields['slot'],
          ),
          commitId: CloudCredentialRecord._text(fields['commitId']),
          checksum: CloudCredentialRecord._text(fields['checksum']),
        ),
        CredentialHintStatus.valid,
      );
    } catch (_) {
      return CredentialHintDecodeResult(null, CredentialHintStatus.invalid);
    }
  }

  String encode() => jsonEncode({
    'generation': generation.toString(),
    'slot': slot.name.toUpperCase(),
    'commitId': commitId,
    'checksum': checksum,
  });
}
