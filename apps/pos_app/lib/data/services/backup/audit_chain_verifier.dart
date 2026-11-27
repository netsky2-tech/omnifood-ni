import 'package:sqflite/sqflite.dart' as sqflite;

/// Describes a single forensic hash-chain anomaly detected inside `audit_logs`.
class AuditChainStreamIssue {
  final String streamKey;
  final int sequenceNo;
  final String reason;

  const AuditChainStreamIssue({
    required this.streamKey,
    required this.sequenceNo,
    required this.reason,
  });

  Map<String, dynamic> toJson() => {
        'streamKey': streamKey,
        'sequenceNo': sequenceNo,
        'reason': reason,
      };
}

/// Deterministic integrity report for the local `audit_logs` hash chain
/// (#526 B6 / AC-10).
class AuditChainVerificationReport {
  final int totalRows;
  final int streamCount;
  final List<AuditChainStreamIssue> issues;

  const AuditChainVerificationReport({
    required this.totalRows,
    required this.streamCount,
    required this.issues,
  });

  bool get isIntact => issues.isEmpty;

  String get statusCode =>
      isIntact ? 'INTACT' : 'BROKEN_STREAMS_DETECTED';

  Map<String, dynamic> toJson() => {
        'status': statusCode,
        'totalRows': totalRows,
        'streamCount': streamCount,
        'issueCount': issues.length,
        'issues': issues.map((i) => i.toJson()).toList(),
      };
}

/// Verifies `audit_logs` forensic hash-chain contiguity per
/// `(tenant_id, device_id, user_id)` stream without modifying any row.
class AuditChainVerifier {
  const AuditChainVerifier._();

  static Future<AuditChainVerificationReport> verifyDatabase(
    sqflite.DatabaseExecutor db,
  ) async {
    final tableRows = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'",
    );
    if (tableRows.isEmpty) {
      return const AuditChainVerificationReport(
        totalRows: 0,
        streamCount: 0,
        issues: [],
      );
    }

    final columns = await db.rawQuery('PRAGMA table_info(audit_logs)');
    final colNames = columns.map((r) => r['name']?.toString() ?? '').toSet();
    final hasTenantId = colNames.contains('tenant_id');

    final selectCols = hasTenantId
        ? 'id, tenant_id, device_id, user_id, sequence_no, prev_hash, entry_hash'
        : 'id, device_id, user_id, sequence_no, prev_hash, entry_hash';

    final rows = await db.rawQuery(
      'SELECT $selectCols FROM audit_logs ORDER BY sequence_no ASC, id ASC',
    );

    if (rows.isEmpty) {
      return const AuditChainVerificationReport(
        totalRows: 0,
        streamCount: 0,
        issues: [],
      );
    }

    final streams = <String, List<Map<String, Object?>>>{};
    for (final row in rows) {
      final tenantId = hasTenantId ? (row['tenant_id']?.toString() ?? '') : '';
      final deviceId = row['device_id']?.toString() ?? '';
      final userId = row['user_id']?.toString() ?? '';
      final key = '$tenantId|$deviceId|$userId';
      streams.putIfAbsent(key, () => []).add(row);
    }

    final issues = <AuditChainStreamIssue>[];
    for (final entry in streams.entries) {
      final streamKey = entry.key;
      final streamRows = entry.value;
      int? prevSeq;
      String? prevEntryHash;

      for (final row in streamRows) {
        final seq = (row['sequence_no'] as num?)?.toInt() ?? 0;
        final prevHash = (row['prev_hash']?.toString() ?? '').trim();
        final entryHash = (row['entry_hash']?.toString() ?? '').trim();

        if (seq <= 0) {
          issues.add(
            AuditChainStreamIssue(
              streamKey: streamKey,
              sequenceNo: seq,
              reason: 'invalid_sequence_number',
            ),
          );
          continue;
        }
        if (prevHash.isEmpty || entryHash.isEmpty) {
          issues.add(
            AuditChainStreamIssue(
              streamKey: streamKey,
              sequenceNo: seq,
              reason: 'missing_hash',
            ),
          );
        }

        if (prevSeq == null) {
          if (seq == 1 && prevHash != 'GENESIS') {
            issues.add(
              AuditChainStreamIssue(
                streamKey: streamKey,
                sequenceNo: seq,
                reason: 'genesis_prev_hash_mismatch',
              ),
            );
          }
        } else {
          if (seq == prevSeq) {
            issues.add(
              AuditChainStreamIssue(
                streamKey: streamKey,
                sequenceNo: seq,
                reason: 'duplicate_sequence',
              ),
            );
          } else if (seq != prevSeq + 1) {
            issues.add(
              AuditChainStreamIssue(
                streamKey: streamKey,
                sequenceNo: seq,
                reason: 'sequence_gap (expected ${prevSeq + 1}, got $seq)',
              ),
            );
          } else if (prevHash != prevEntryHash) {
            issues.add(
              AuditChainStreamIssue(
                streamKey: streamKey,
                sequenceNo: seq,
                reason: 'prev_hash_mismatch',
              ),
            );
          }
        }

        prevSeq = seq;
        prevEntryHash = entryHash;
      }
    }

    return AuditChainVerificationReport(
      totalRows: rows.length,
      streamCount: streams.length,
      issues: issues,
    );
  }
}
