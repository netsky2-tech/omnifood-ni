import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:sqflite/sqflite.dart' as sqflite;

import 'audit_chain_verifier.dart';

/// Base exception for operator-facing backup/restore failures (#526).
class TerminalBackupException implements Exception {
  final String message;

  const TerminalBackupException(this.message);

  @override
  String toString() => message;
}

/// Thrown when restoring a backup would replay a DGI fiscal sequence already
/// recorded in the cloud (#526 B5 / AC-1 / AC-2 / AC-3).
class FiscalSequenceReplayRestoreException extends TerminalBackupException {
  final int backupSequence;
  final int cloudHighestSequence;

  FiscalSequenceReplayRestoreException({
    required this.backupSequence,
    required this.cloudHighestSequence,
  }) : super(
          'No se puede restaurar este respaldo: su consecutivo fiscal '
          '($backupSequence) es menor o igual al máximo registrado en la nube '
          '($cloudHighestSequence). No facture y contacte a soporte.',
        );
}

class TerminalBackupManifest {
  final int formatVersion;
  final int schemaVersion;
  final String createdAtIso;
  final int invoiceCount;
  final int highestInvoiceSequence;
  final int? dgiCurrentNumber;
  final String? dgiPrefix;
  final int auditLogCount;
  final String auditChainStatus;
  final String payloadSha256;

  const TerminalBackupManifest({
    required this.formatVersion,
    required this.schemaVersion,
    required this.createdAtIso,
    required this.invoiceCount,
    required this.highestInvoiceSequence,
    required this.dgiCurrentNumber,
    required this.dgiPrefix,
    required this.auditLogCount,
    required this.auditChainStatus,
    required this.payloadSha256,
  });

  Map<String, dynamic> toJson() => {
        'formatVersion': formatVersion,
        'schemaVersion': schemaVersion,
        'createdAtIso': createdAtIso,
        'invoiceCount': invoiceCount,
        'highestInvoiceSequence': highestInvoiceSequence,
        'dgiCurrentNumber': dgiCurrentNumber,
        'dgiPrefix': dgiPrefix,
        'auditLogCount': auditLogCount,
        'auditChainStatus': auditChainStatus,
        'payloadSha256': payloadSha256,
      };

  factory TerminalBackupManifest.fromJson(Map<String, dynamic> json) {
    return TerminalBackupManifest(
      formatVersion: (json['formatVersion'] as num).toInt(),
      schemaVersion: (json['schemaVersion'] as num).toInt(),
      createdAtIso: json['createdAtIso'] as String,
      invoiceCount: (json['invoiceCount'] as num).toInt(),
      highestInvoiceSequence: (json['highestInvoiceSequence'] as num).toInt(),
      dgiCurrentNumber: (json['dgiCurrentNumber'] as num?)?.toInt(),
      dgiPrefix: json['dgiPrefix'] as String?,
      auditLogCount: (json['auditLogCount'] as num).toInt(),
      auditChainStatus: json['auditChainStatus'] as String? ?? 'UNKNOWN',
      payloadSha256: json['payloadSha256'] as String,
    );
  }
}

class TerminalBackupExportResult {
  final String filePath;
  final int sizeBytes;
  final TerminalBackupManifest manifest;
  final AuditChainVerificationReport auditChainReport;

  const TerminalBackupExportResult({
    required this.filePath,
    required this.sizeBytes,
    required this.manifest,
    required this.auditChainReport,
  });
}

class StagedRestoreResult {
  final String stagedDatabasePath;
  final TerminalBackupManifest manifest;
  final AuditChainVerificationReport auditChainReport;

  const StagedRestoreResult({
    required this.stagedDatabasePath,
    required this.manifest,
    required this.auditChainReport,
  });
}

class AppliedRestoreNotice {
  final String restoredAtIso;
  final TerminalBackupManifest manifest;
  final Map<String, dynamic> auditChainReport;

  const AppliedRestoreNotice({
    required this.restoredAtIso,
    required this.manifest,
    required this.auditChainReport,
  });
}

/// Encrypted SQLite backup & atomic staged restore service for NHILOS POS
/// (#526 B3 / B5 / B6 — DT 09-2007 Ordinal SEGUNDO 1.4).
///
/// Format `.nhilosbak` (v1):
/// - Snapshot via SQLite `VACUUM INTO` (consistent single-file image without
///   closing the live `AppDatabase` handle or copying dirty WAL segments).
/// - Key derivation: PBKDF2-HMAC-SHA256 (100,000 iterations, 16-byte random salt)
///   producing 64 bytes: 32-byte AES-256-CBC key + 32-byte HMAC-SHA256 key.
/// - Authenticated encryption (Encrypt-then-MAC): HMAC-SHA256 covers the
///   format version, canonical manifest JSON, salt, IV, and ciphertext.
/// - Restore stages `<dbPath>.pending_restore` only after MAC, SHA-256,
///   `PRAGMA integrity_check`, schema-version, and B5 cloud-sequence tripwire
///   validation; `applyPendingRestoreIfPresent` swaps it atomically in
///   `main.dart` before Floor opens `app_database.db`.
class TerminalBackupService {
  static const int currentFormatVersion = 1;
  static const int minPassphraseLength = 8;
  static const int _pbkdf2Iterations = 100000;
  static const int _saltLength = 16;
  static const int _ivLength = 16;
  static const String pendingRestoreSuffix = '.pending_restore';
  static const String pendingMetaSuffix = '.pending_restore.meta.json';
  static const String preRestoreBackupSuffix = '.pre_restore.bak';

  final sqflite.DatabaseFactory _dbFactory;
  final Random _random;

  TerminalBackupService({
    sqflite.DatabaseFactory? databaseFactory,
    Random? random,
  })  : _dbFactory = databaseFactory ?? sqflite.databaseFactory,
        _random = random ?? Random.secure();

  /// Exports an encrypted, integrity-checked `.nhilosbak` backup of [sourceDb]
  /// to [destinationPath]. Never deletes or modifies any invoice or config row.
  Future<TerminalBackupExportResult> exportEncryptedBackup({
    required sqflite.Database sourceDb,
    required String destinationPath,
    required String passphrase,
    int? expectedSchemaVersion,
  }) async {
    _validatePassphrase(passphrase);

    final destFile = File(destinationPath);
    await destFile.parent.create(recursive: true);

    final tempDir = await Directory.systemTemp.createTemp('nhilos_bak_export_');
    final snapshotPath = '${tempDir.path}/snapshot.db';

    try {
      // Atomic, consistent single-file SQLite snapshot without closing sourceDb.
      final escapedPath = snapshotPath.replaceAll("'", "''");
      await sourceDb.execute("VACUUM INTO '$escapedPath'");

      final snapshotInfo = await _inspectSqliteSnapshot(snapshotPath);
      final snapshotBytes = await File(snapshotPath).readAsBytes();
      final payloadSha256 = sha256.convert(snapshotBytes).toString();

      final manifest = TerminalBackupManifest(
        formatVersion: currentFormatVersion,
        schemaVersion: expectedSchemaVersion ?? snapshotInfo.schemaVersion,
        createdAtIso: DateTime.now().toUtc().toIso8601String(),
        invoiceCount: snapshotInfo.invoiceCount,
        highestInvoiceSequence: snapshotInfo.highestInvoiceSequence,
        dgiCurrentNumber: snapshotInfo.dgiCurrentNumber,
        dgiPrefix: snapshotInfo.dgiPrefix,
        auditLogCount: snapshotInfo.auditChainReport.totalRows,
        auditChainStatus: snapshotInfo.auditChainReport.statusCode,
        payloadSha256: payloadSha256,
      );

      final envelopeBytes = _encryptEnvelope(
        manifest: manifest,
        plaintext: snapshotBytes,
        passphrase: passphrase,
      );

      final tmpDest = File('$destinationPath.tmp');
      await tmpDest.writeAsBytes(envelopeBytes, flush: true);
      await tmpDest.rename(destinationPath);

      return TerminalBackupExportResult(
        filePath: destinationPath,
        sizeBytes: envelopeBytes.length,
        manifest: manifest,
        auditChainReport: snapshotInfo.auditChainReport,
      );
    } finally {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    }
  }

  /// Validates and stages a `.nhilosbak` file at `<targetDatabasePath>.pending_restore`
  /// so `applyPendingRestoreIfPresent()` swaps it cleanly on next app start.
  ///
  /// Enforces:
  /// - HMAC-SHA256 authentication & SHA-256 payload digest
  /// - SQLite `PRAGMA integrity_check == 'ok'`
  /// - `schemaVersion <= currentSchemaVersion`
  /// - **B5 replay tripwire**: refuses if [cloudHighestSequence] is higher than
  ///   or equal to the backup's fiscal position (zero writes on refusal).
  /// - **B6 audit hash-chain verification**: never silent.
  Future<StagedRestoreResult> stageRestoreFromBackup({
    required String backupFilePath,
    required String passphrase,
    required String targetDatabasePath,
    required int currentSchemaVersion,
    int? cloudHighestSequence,
  }) async {
    _validatePassphrase(passphrase);

    final backupFile = File(backupFilePath);
    if (!await backupFile.exists()) {
      throw const TerminalBackupException(
        'No se encontró el archivo de respaldo seleccionado.',
      );
    }

    final rawBytes = await backupFile.readAsBytes();
    final decrypted = _decryptAndAuthenticateEnvelope(
      rawBytes: rawBytes,
      passphrase: passphrase,
    );

    final actualSha = sha256.convert(decrypted.plaintext).toString();
    if (actualSha != decrypted.manifest.payloadSha256) {
      throw const TerminalBackupException(
        'El respaldo está dañado (verificación SHA-256 fallida).',
      );
    }

    final tempDir = await Directory.systemTemp.createTemp('nhilos_bak_verify_');
    final tempDbPath = '${tempDir.path}/candidate.db';
    try {
      await File(tempDbPath).writeAsBytes(decrypted.plaintext, flush: true);
      final info = await _inspectSqliteSnapshot(tempDbPath, runIntegrityCheck: true);

      if (info.schemaVersion > currentSchemaVersion) {
        throw TerminalBackupException(
          'El respaldo proviene de una versión más nueva de la app '
          '(esquema v${info.schemaVersion} > v$currentSchemaVersion). '
          'Actualice NHILOS POS antes de restaurar.',
        );
      }

      // B5 Replay Tripwire (#526 AC-1 / AC-2 / AC-3): fail closed, zero writes.
      if (cloudHighestSequence != null && cloudHighestSequence > 0) {
        final effectiveNext = info.dgiCurrentNumber;
        final effectiveMaxIssued = info.highestInvoiceSequence;
        if ((effectiveNext != null && effectiveNext <= cloudHighestSequence) ||
            (effectiveNext == null && effectiveMaxIssued < cloudHighestSequence)) {
          throw FiscalSequenceReplayRestoreException(
            backupSequence: effectiveNext ?? effectiveMaxIssued,
            cloudHighestSequence: cloudHighestSequence,
          );
        }
      }

      final targetFile = File(targetDatabasePath);
      await targetFile.parent.create(recursive: true);

      final stagedPath = '$targetDatabasePath$pendingRestoreSuffix';
      final stagedTmp = File('$stagedPath.tmp');
      await stagedTmp.writeAsBytes(decrypted.plaintext, flush: true);
      await stagedTmp.rename(stagedPath);

      final metaPath = '$targetDatabasePath$pendingMetaSuffix';
      final metaJson = jsonEncode({
        'stagedAtIso': DateTime.now().toUtc().toIso8601String(),
        'manifest': decrypted.manifest.toJson(),
        'auditChainReport': info.auditChainReport.toJson(),
      });
      await File(metaPath).writeAsString(metaJson, flush: true);

      return StagedRestoreResult(
        stagedDatabasePath: stagedPath,
        manifest: decrypted.manifest,
        auditChainReport: info.auditChainReport,
      );
    } finally {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    }
  }

  /// Applies a previously validated pending restore BEFORE `AppDatabase` is
  /// opened in `main.dart`. Safe no-op when no pending restore exists.
  static Future<AppliedRestoreNotice?> applyPendingRestoreIfPresent({
    required String databasePath,
  }) async {
    final pendingFile = File('$databasePath$pendingRestoreSuffix');
    if (!await pendingFile.exists()) {
      return null;
    }

    final liveFile = File(databasePath);
    if (await liveFile.exists()) {
      await liveFile.copy('$databasePath$preRestoreBackupSuffix');
    }

    // Remove any stale SQLite sidecar files before swapping the main DB.
    for (final sidecar in ['-wal', '-shm', '-journal']) {
      final f = File('$databasePath$sidecar');
      if (await f.exists()) {
        await f.delete();
      }
    }

    if (await liveFile.exists()) {
      await liveFile.delete();
    }
    await pendingFile.rename(databasePath);

    final metaFile = File('$databasePath$pendingMetaSuffix');
    AppliedRestoreNotice? notice;
    if (await metaFile.exists()) {
      try {
        final decoded =
            jsonDecode(await metaFile.readAsString()) as Map<String, dynamic>;
        notice = AppliedRestoreNotice(
          restoredAtIso: DateTime.now().toUtc().toIso8601String(),
          manifest: TerminalBackupManifest.fromJson(
            decoded['manifest'] as Map<String, dynamic>,
          ),
          auditChainReport:
              (decoded['auditChainReport'] as Map<String, dynamic>?) ??
                  const {'status': 'UNKNOWN'},
        );
      } finally {
        await metaFile.delete();
      }
    }
    return notice;
  }

  void _validatePassphrase(String passphrase) {
    if (passphrase.trim().length < minPassphraseLength) {
      throw const TerminalBackupException(
        'La clave de respaldo debe tener al menos $minPassphraseLength caracteres.',
      );
    }
  }

  Future<_SnapshotInspection> _inspectSqliteSnapshot(
    String path, {
    bool runIntegrityCheck = false,
  }) async {
    sqflite.Database? db;
    try {
      db = await _dbFactory.openDatabase(
        path,
        options: sqflite.OpenDatabaseOptions(readOnly: true),
      );

      if (runIntegrityCheck) {
        final checkRows = await db.rawQuery('PRAGMA integrity_check');
        final status = checkRows.isNotEmpty
            ? checkRows.first.values.first?.toString().toLowerCase()
            : null;
        if (status != 'ok') {
          throw const TerminalBackupException(
            'El archivo SQLite del respaldo no pasó PRAGMA integrity_check.',
          );
        }
      }

      final versionRows = await db.rawQuery('PRAGMA user_version');
      final schemaVersion = versionRows.isNotEmpty
          ? (versionRows.first.values.first as num?)?.toInt() ?? 0
          : 0;

      int invoiceCount = 0;
      int highestSeq = 0;
      final invTable = await db.rawQuery(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'",
      );
      if (invTable.isNotEmpty) {
        final countRows =
            await db.rawQuery('SELECT COUNT(*) AS cnt FROM invoices');
        invoiceCount = (countRows.first['cnt'] as num?)?.toInt() ?? 0;

        final numRows =
            await db.rawQuery('SELECT invoice_number FROM invoices');
        for (final r in numRows) {
          final parsed = _extractTrailingSequence(
            r['invoice_number']?.toString(),
          );
          if (parsed != null && parsed > highestSeq) {
            highestSeq = parsed;
          }
        }
      }

      int? dgiCurrentNumber;
      String? dgiPrefix;
      final cfgTable = await db.rawQuery(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_configs'",
      );
      if (cfgTable.isNotEmpty) {
        final cfgRows = await db.rawQuery(
          "SELECT key, value FROM local_configs WHERE key IN ('dgi_current_number', 'dgi_prefix')",
        );
        for (final r in cfgRows) {
          final k = r['key']?.toString();
          final v = r['value']?.toString().trim();
          if (k == 'dgi_current_number' && v != null && v.isNotEmpty) {
            dgiCurrentNumber = int.tryParse(v);
          } else if (k == 'dgi_prefix' && v != null && v.isNotEmpty) {
            dgiPrefix = v;
          }
        }
      }

      final auditReport = await AuditChainVerifier.verifyDatabase(db);

      return _SnapshotInspection(
        schemaVersion: schemaVersion,
        invoiceCount: invoiceCount,
        highestInvoiceSequence: highestSeq,
        dgiCurrentNumber: dgiCurrentNumber,
        dgiPrefix: dgiPrefix,
        auditChainReport: auditReport,
      );
    } on TerminalBackupException {
      rethrow;
    } catch (e) {
      throw TerminalBackupException(
        'No se pudo validar la base de datos del respaldo: $e',
      );
    } finally {
      await db?.close();
    }
  }

  static int? _extractTrailingSequence(String? invoiceNumber) {
    if (invoiceNumber == null) return null;
    final match = RegExp(r'([0-9]+)$').firstMatch(invoiceNumber.trim());
    if (match == null) return null;
    return int.tryParse(match.group(1)!);
  }

  Uint8List _randomBytes(int length) {
    final out = Uint8List(length);
    for (var i = 0; i < length; i++) {
      out[i] = _random.nextInt(256);
    }
    return out;
  }

  /// PBKDF2-HMAC-SHA256 deriving [derivedKeyLength] bytes (RFC 2898).
  static Uint8List _pbkdf2HmacSha256({
    required Uint8List password,
    required Uint8List salt,
    required int iterations,
    required int derivedKeyLength,
  }) {
    const hashLen = 32;
    final blockCount = (derivedKeyLength / hashLen).ceil();
    final output = Uint8List(blockCount * hashLen);
    final hmac = Hmac(sha256, password);

    for (var block = 1; block <= blockCount; block++) {
      final saltWithIndex = Uint8List(salt.length + 4)
        ..setRange(0, salt.length, salt)
        ..[salt.length] = (block >> 24) & 0xff
        ..[salt.length + 1] = (block >> 16) & 0xff
        ..[salt.length + 2] = (block >> 8) & 0xff
        ..[salt.length + 3] = block & 0xff;

      var u = Uint8List.fromList(hmac.convert(saltWithIndex).bytes);
      final t = Uint8List.fromList(u);

      for (var i = 1; i < iterations; i++) {
        u = Uint8List.fromList(hmac.convert(u).bytes);
        for (var j = 0; j < hashLen; j++) {
          t[j] ^= u[j];
        }
      }
      output.setRange((block - 1) * hashLen, block * hashLen, t);
    }

    return output.sublist(0, derivedKeyLength);
  }

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }

  Uint8List _encryptEnvelope({
    required TerminalBackupManifest manifest,
    required Uint8List plaintext,
    required String passphrase,
  }) {
    final salt = _randomBytes(_saltLength);
    final ivBytes = _randomBytes(_ivLength);
    final derived = _pbkdf2HmacSha256(
      password: Uint8List.fromList(utf8.encode(passphrase)),
      salt: salt,
      iterations: _pbkdf2Iterations,
      derivedKeyLength: 64,
    );

    final aesKey = enc.Key(derived.sublist(0, 32));
    final macKey = derived.sublist(32, 64);
    final iv = enc.IV(ivBytes);

    final encrypter = enc.Encrypter(enc.AES(aesKey, mode: enc.AESMode.cbc));
    final encrypted = encrypter.encryptBytes(plaintext, iv: iv);

    final manifestJson = jsonEncode(manifest.toJson());
    final saltB64 = base64Encode(salt);
    final ivB64 = base64Encode(ivBytes);
    final cipherB64 = encrypted.base64;

    final macInput =
        utf8.encode('$currentFormatVersion|$manifestJson|$saltB64|$ivB64|$cipherB64');
    final macHex = Hmac(sha256, macKey).convert(macInput).toString();

    final envelope = {
      'formatVersion': currentFormatVersion,
      'kdf': 'PBKDF2-HMAC-SHA256',
      'iterations': _pbkdf2Iterations,
      'cipher': 'AES-256-CBC+HMAC-SHA256',
      'manifest': manifest.toJson(),
      'salt': saltB64,
      'iv': ivB64,
      'ciphertext': cipherB64,
      'mac': macHex,
    };

    return Uint8List.fromList(utf8.encode(jsonEncode(envelope)));
  }

  _DecryptedEnvelope _decryptAndAuthenticateEnvelope({
    required Uint8List rawBytes,
    required String passphrase,
  }) {
    Map<String, dynamic> envelope;
    try {
      envelope = jsonDecode(utf8.decode(rawBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw const TerminalBackupException(
        'Formato de archivo de respaldo inválido (.nhilosbak corrupto).',
      );
    }

    final formatVersion = (envelope['formatVersion'] as num?)?.toInt();
    if (formatVersion != currentFormatVersion) {
      throw TerminalBackupException(
        'Versión de respaldo no soportada: $formatVersion.',
      );
    }

    final iterations =
        (envelope['iterations'] as num?)?.toInt() ?? _pbkdf2Iterations;
    final manifestMap = envelope['manifest'] as Map<String, dynamic>?;
    final saltB64 = envelope['salt'] as String?;
    final ivB64 = envelope['iv'] as String?;
    final cipherB64 = envelope['ciphertext'] as String?;
    final expectedMacHex = envelope['mac'] as String?;

    if (manifestMap == null ||
        saltB64 == null ||
        ivB64 == null ||
        cipherB64 == null ||
        expectedMacHex == null) {
      throw const TerminalBackupException(
        'El archivo de respaldo está incompleto o corrupto.',
      );
    }

    final manifest = TerminalBackupManifest.fromJson(manifestMap);
    final salt = base64Decode(saltB64);
    final ivBytes = base64Decode(ivB64);

    final derived = _pbkdf2HmacSha256(
      password: Uint8List.fromList(utf8.encode(passphrase)),
      salt: salt,
      iterations: iterations,
      derivedKeyLength: 64,
    );

    final aesKey = enc.Key(derived.sublist(0, 32));
    final macKey = derived.sublist(32, 64);

    final manifestJson = jsonEncode(manifest.toJson());
    final macInput =
        utf8.encode('$formatVersion|$manifestJson|$saltB64|$ivB64|$cipherB64');
    final actualMacHex = Hmac(sha256, macKey).convert(macInput).toString();

    if (!_constantTimeEquals(
      utf8.encode(actualMacHex),
      utf8.encode(expectedMacHex),
    )) {
      throw const TerminalBackupException(
        'Contraseña incorrecta o archivo de respaldo alterado.',
      );
    }

    try {
      final encrypter = enc.Encrypter(enc.AES(aesKey, mode: enc.AESMode.cbc));
      final plaintext = encrypter.decryptBytes(
        enc.Encrypted.fromBase64(cipherB64),
        iv: enc.IV(ivBytes),
      );
      return _DecryptedEnvelope(
        manifest: manifest,
        plaintext: Uint8List.fromList(plaintext),
      );
    } catch (_) {
      throw const TerminalBackupException(
        'No se pudo descifrar el archivo de respaldo.',
      );
    }
  }
}

class _SnapshotInspection {
  final int schemaVersion;
  final int invoiceCount;
  final int highestInvoiceSequence;
  final int? dgiCurrentNumber;
  final String? dgiPrefix;
  final AuditChainVerificationReport auditChainReport;

  const _SnapshotInspection({
    required this.schemaVersion,
    required this.invoiceCount,
    required this.highestInvoiceSequence,
    required this.dgiCurrentNumber,
    required this.dgiPrefix,
    required this.auditChainReport,
  });
}

class _DecryptedEnvelope {
  final TerminalBackupManifest manifest;
  final Uint8List plaintext;

  const _DecryptedEnvelope({
    required this.manifest,
    required this.plaintext,
  });
}
