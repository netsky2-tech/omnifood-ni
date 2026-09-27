import 'package:floor/floor.dart';

/// #613 Unit A — machine-readable identities of the inert-recipe ingestion
/// verdict channel. Codes are stable values pilot tooling reads from the
/// database and `local_configs`; they are diagnostic-only and never enter an
/// invoice or a snapshot.
class AuthorityIngestionVerdicts {
  /// A structurally valid published recipe version whose product is recorded
  /// as `SIMPLE` in the terminal's own catalog. The version is inert
  /// material: it is NOT hydrated and gets this verdict instead.
  static const String inertSimpleProductCode = 'INERT_SIMPLE_PRODUCT';

  /// `local_configs` aggregate telemetry: number of distinct ingestion
  /// verdict rows on this device (across pulls), and the verdict code they
  /// carry ('' when zero). Best-effort, written by the sync pull.
  static const String inertCountKey = 'authority_inert_recipes_count';
  static const String inertReasonKey = 'authority_inert_recipes_reason';

  const AuthorityIngestionVerdicts._();
}

/// One ingestion verdict for one recipe version (#613 decision 3).
///
/// `authority_recipe_versions` cannot carry a status column: the authority
/// projections are immutable by `BEFORE UPDATE/DELETE` triggers and that
/// immutability is deliberate. Verdicts are facts ABOUT the ingestion, so
/// they get their own append-only table: insert-if-absent, keyed by
/// (recipe_version_id, code). Rows are never updated or deleted; there is no
/// retention machinery (deliberate at pilot scale).
@Entity(
  tableName: 'authority_ingestion_verdicts',
  primaryKeys: ['recipe_version_id', 'code'],
)
class AuthorityIngestionVerdictEntity {
  /// The recipe version the verdict is about (the wire `recipeVersionId`).
  @ColumnInfo(name: 'recipe_version_id')
  final String recipeVersionId;

  /// Machine-readable verdict code; see [AuthorityIngestionVerdicts].
  final String code;

  /// The product the inert recipe referenced, so surfacing (#613 Unit B)
  /// can name the product without re-deriving it.
  @ColumnInfo(name: 'product_id')
  final String productId;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'created_at')
  final String createdAt;

  const AuthorityIngestionVerdictEntity({
    required this.recipeVersionId,
    required this.code,
    required this.productId,
    required this.tenantId,
    required this.createdAt,
  });
}
