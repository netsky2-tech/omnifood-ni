import 'package:floor/floor.dart';
import 'package:pos_app/data/models/inventory/authority_ingestion_verdict_entity.dart';

/// #613 Unit A — read/write port for the append-only ingestion verdict table.
///
/// The verdict write is insert-if-absent: the same inert recipe version may
/// arrive on every sync cycle (the delta watermark only advances on a
/// successful pull), and must never duplicate a verdict row. Update and
/// delete are blocked by schema-level triggers (migrations.dart), so this DAO
/// deliberately exposes no such operation.
@dao
abstract class AuthorityIngestionVerdictDao {
  /// Aggregate count of verdict rows on this device. Null-safe read for
  /// best-effort telemetry: a missing table reports null, not a crash.
  @Query('SELECT COUNT(*) FROM authority_ingestion_verdicts')
  Future<int?> countVerdicts();

  /// Insert-if-absent (INSERT OR IGNORE): a re-pull of the same inert
  /// recipe version is a no-op, never a duplicate and never an abort.
  @Insert(onConflict: OnConflictStrategy.ignore)
  Future<void> insertVerdictIfAbsent(AuthorityIngestionVerdictEntity verdict);
}
