// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'customer_point_transaction.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

CustomerPointTransaction _$CustomerPointTransactionFromJson(
    Map<String, dynamic> json) {
  return _CustomerPointTransaction.fromJson(json);
}

/// @nodoc
mixin _$CustomerPointTransaction {
  String get id => throw _privateConstructorUsedError;
  String get customerId => throw _privateConstructorUsedError;
  String? get invoiceId => throw _privateConstructorUsedError;
  PointTransactionType get type => throw _privateConstructorUsedError;
  double get points => throw _privateConstructorUsedError;
  double get balanceAfter => throw _privateConstructorUsedError;
  double get conversionRate => throw _privateConstructorUsedError;
  String? get reason => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  SyncStatus get syncStatus =>
      throw _privateConstructorUsedError; // --- V1 Loyalty fields ---
  String? get loyaltyProgramId => throw _privateConstructorUsedError;
  String? get ticketId => throw _privateConstructorUsedError;
  String? get rewardId => throw _privateConstructorUsedError;
  String? get transactionType => throw _privateConstructorUsedError;
  int? get units => throw _privateConstructorUsedError;
  String? get reversalOfTransactionId => throw _privateConstructorUsedError;
  String? get idempotencyKey => throw _privateConstructorUsedError;
  String? get sourceEventId => throw _privateConstructorUsedError;
  String? get actorUserId => throw _privateConstructorUsedError;
  String? get branchId => throw _privateConstructorUsedError;
  String? get terminalId => throw _privateConstructorUsedError;
  int? get programVersion => throw _privateConstructorUsedError;
  int? get rewardVersion => throw _privateConstructorUsedError;
  String? get commercialSnapshot => throw _privateConstructorUsedError;
  String? get origin => throw _privateConstructorUsedError;
  DateTime? get occurredAt => throw _privateConstructorUsedError;
  DateTime? get recordedAt => throw _privateConstructorUsedError;
  bool get legacyImported => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $CustomerPointTransactionCopyWith<CustomerPointTransaction> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CustomerPointTransactionCopyWith<$Res> {
  factory $CustomerPointTransactionCopyWith(CustomerPointTransaction value,
          $Res Function(CustomerPointTransaction) then) =
      _$CustomerPointTransactionCopyWithImpl<$Res, CustomerPointTransaction>;
  @useResult
  $Res call(
      {String id,
      String customerId,
      String? invoiceId,
      PointTransactionType type,
      double points,
      double balanceAfter,
      double conversionRate,
      String? reason,
      DateTime createdAt,
      SyncStatus syncStatus,
      String? loyaltyProgramId,
      String? ticketId,
      String? rewardId,
      String? transactionType,
      int? units,
      String? reversalOfTransactionId,
      String? idempotencyKey,
      String? sourceEventId,
      String? actorUserId,
      String? branchId,
      String? terminalId,
      int? programVersion,
      int? rewardVersion,
      String? commercialSnapshot,
      String? origin,
      DateTime? occurredAt,
      DateTime? recordedAt,
      bool legacyImported});
}

/// @nodoc
class _$CustomerPointTransactionCopyWithImpl<$Res,
        $Val extends CustomerPointTransaction>
    implements $CustomerPointTransactionCopyWith<$Res> {
  _$CustomerPointTransactionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? customerId = null,
    Object? invoiceId = freezed,
    Object? type = null,
    Object? points = null,
    Object? balanceAfter = null,
    Object? conversionRate = null,
    Object? reason = freezed,
    Object? createdAt = null,
    Object? syncStatus = null,
    Object? loyaltyProgramId = freezed,
    Object? ticketId = freezed,
    Object? rewardId = freezed,
    Object? transactionType = freezed,
    Object? units = freezed,
    Object? reversalOfTransactionId = freezed,
    Object? idempotencyKey = freezed,
    Object? sourceEventId = freezed,
    Object? actorUserId = freezed,
    Object? branchId = freezed,
    Object? terminalId = freezed,
    Object? programVersion = freezed,
    Object? rewardVersion = freezed,
    Object? commercialSnapshot = freezed,
    Object? origin = freezed,
    Object? occurredAt = freezed,
    Object? recordedAt = freezed,
    Object? legacyImported = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      customerId: null == customerId
          ? _value.customerId
          : customerId // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceId: freezed == invoiceId
          ? _value.invoiceId
          : invoiceId // ignore: cast_nullable_to_non_nullable
              as String?,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as PointTransactionType,
      points: null == points
          ? _value.points
          : points // ignore: cast_nullable_to_non_nullable
              as double,
      balanceAfter: null == balanceAfter
          ? _value.balanceAfter
          : balanceAfter // ignore: cast_nullable_to_non_nullable
              as double,
      conversionRate: null == conversionRate
          ? _value.conversionRate
          : conversionRate // ignore: cast_nullable_to_non_nullable
              as double,
      reason: freezed == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String?,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as SyncStatus,
      loyaltyProgramId: freezed == loyaltyProgramId
          ? _value.loyaltyProgramId
          : loyaltyProgramId // ignore: cast_nullable_to_non_nullable
              as String?,
      ticketId: freezed == ticketId
          ? _value.ticketId
          : ticketId // ignore: cast_nullable_to_non_nullable
              as String?,
      rewardId: freezed == rewardId
          ? _value.rewardId
          : rewardId // ignore: cast_nullable_to_non_nullable
              as String?,
      transactionType: freezed == transactionType
          ? _value.transactionType
          : transactionType // ignore: cast_nullable_to_non_nullable
              as String?,
      units: freezed == units
          ? _value.units
          : units // ignore: cast_nullable_to_non_nullable
              as int?,
      reversalOfTransactionId: freezed == reversalOfTransactionId
          ? _value.reversalOfTransactionId
          : reversalOfTransactionId // ignore: cast_nullable_to_non_nullable
              as String?,
      idempotencyKey: freezed == idempotencyKey
          ? _value.idempotencyKey
          : idempotencyKey // ignore: cast_nullable_to_non_nullable
              as String?,
      sourceEventId: freezed == sourceEventId
          ? _value.sourceEventId
          : sourceEventId // ignore: cast_nullable_to_non_nullable
              as String?,
      actorUserId: freezed == actorUserId
          ? _value.actorUserId
          : actorUserId // ignore: cast_nullable_to_non_nullable
              as String?,
      branchId: freezed == branchId
          ? _value.branchId
          : branchId // ignore: cast_nullable_to_non_nullable
              as String?,
      terminalId: freezed == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String?,
      programVersion: freezed == programVersion
          ? _value.programVersion
          : programVersion // ignore: cast_nullable_to_non_nullable
              as int?,
      rewardVersion: freezed == rewardVersion
          ? _value.rewardVersion
          : rewardVersion // ignore: cast_nullable_to_non_nullable
              as int?,
      commercialSnapshot: freezed == commercialSnapshot
          ? _value.commercialSnapshot
          : commercialSnapshot // ignore: cast_nullable_to_non_nullable
              as String?,
      origin: freezed == origin
          ? _value.origin
          : origin // ignore: cast_nullable_to_non_nullable
              as String?,
      occurredAt: freezed == occurredAt
          ? _value.occurredAt
          : occurredAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      recordedAt: freezed == recordedAt
          ? _value.recordedAt
          : recordedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      legacyImported: null == legacyImported
          ? _value.legacyImported
          : legacyImported // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$CustomerPointTransactionImplCopyWith<$Res>
    implements $CustomerPointTransactionCopyWith<$Res> {
  factory _$$CustomerPointTransactionImplCopyWith(
          _$CustomerPointTransactionImpl value,
          $Res Function(_$CustomerPointTransactionImpl) then) =
      __$$CustomerPointTransactionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String customerId,
      String? invoiceId,
      PointTransactionType type,
      double points,
      double balanceAfter,
      double conversionRate,
      String? reason,
      DateTime createdAt,
      SyncStatus syncStatus,
      String? loyaltyProgramId,
      String? ticketId,
      String? rewardId,
      String? transactionType,
      int? units,
      String? reversalOfTransactionId,
      String? idempotencyKey,
      String? sourceEventId,
      String? actorUserId,
      String? branchId,
      String? terminalId,
      int? programVersion,
      int? rewardVersion,
      String? commercialSnapshot,
      String? origin,
      DateTime? occurredAt,
      DateTime? recordedAt,
      bool legacyImported});
}

/// @nodoc
class __$$CustomerPointTransactionImplCopyWithImpl<$Res>
    extends _$CustomerPointTransactionCopyWithImpl<$Res,
        _$CustomerPointTransactionImpl>
    implements _$$CustomerPointTransactionImplCopyWith<$Res> {
  __$$CustomerPointTransactionImplCopyWithImpl(
      _$CustomerPointTransactionImpl _value,
      $Res Function(_$CustomerPointTransactionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? customerId = null,
    Object? invoiceId = freezed,
    Object? type = null,
    Object? points = null,
    Object? balanceAfter = null,
    Object? conversionRate = null,
    Object? reason = freezed,
    Object? createdAt = null,
    Object? syncStatus = null,
    Object? loyaltyProgramId = freezed,
    Object? ticketId = freezed,
    Object? rewardId = freezed,
    Object? transactionType = freezed,
    Object? units = freezed,
    Object? reversalOfTransactionId = freezed,
    Object? idempotencyKey = freezed,
    Object? sourceEventId = freezed,
    Object? actorUserId = freezed,
    Object? branchId = freezed,
    Object? terminalId = freezed,
    Object? programVersion = freezed,
    Object? rewardVersion = freezed,
    Object? commercialSnapshot = freezed,
    Object? origin = freezed,
    Object? occurredAt = freezed,
    Object? recordedAt = freezed,
    Object? legacyImported = null,
  }) {
    return _then(_$CustomerPointTransactionImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      customerId: null == customerId
          ? _value.customerId
          : customerId // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceId: freezed == invoiceId
          ? _value.invoiceId
          : invoiceId // ignore: cast_nullable_to_non_nullable
              as String?,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as PointTransactionType,
      points: null == points
          ? _value.points
          : points // ignore: cast_nullable_to_non_nullable
              as double,
      balanceAfter: null == balanceAfter
          ? _value.balanceAfter
          : balanceAfter // ignore: cast_nullable_to_non_nullable
              as double,
      conversionRate: null == conversionRate
          ? _value.conversionRate
          : conversionRate // ignore: cast_nullable_to_non_nullable
              as double,
      reason: freezed == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String?,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as SyncStatus,
      loyaltyProgramId: freezed == loyaltyProgramId
          ? _value.loyaltyProgramId
          : loyaltyProgramId // ignore: cast_nullable_to_non_nullable
              as String?,
      ticketId: freezed == ticketId
          ? _value.ticketId
          : ticketId // ignore: cast_nullable_to_non_nullable
              as String?,
      rewardId: freezed == rewardId
          ? _value.rewardId
          : rewardId // ignore: cast_nullable_to_non_nullable
              as String?,
      transactionType: freezed == transactionType
          ? _value.transactionType
          : transactionType // ignore: cast_nullable_to_non_nullable
              as String?,
      units: freezed == units
          ? _value.units
          : units // ignore: cast_nullable_to_non_nullable
              as int?,
      reversalOfTransactionId: freezed == reversalOfTransactionId
          ? _value.reversalOfTransactionId
          : reversalOfTransactionId // ignore: cast_nullable_to_non_nullable
              as String?,
      idempotencyKey: freezed == idempotencyKey
          ? _value.idempotencyKey
          : idempotencyKey // ignore: cast_nullable_to_non_nullable
              as String?,
      sourceEventId: freezed == sourceEventId
          ? _value.sourceEventId
          : sourceEventId // ignore: cast_nullable_to_non_nullable
              as String?,
      actorUserId: freezed == actorUserId
          ? _value.actorUserId
          : actorUserId // ignore: cast_nullable_to_non_nullable
              as String?,
      branchId: freezed == branchId
          ? _value.branchId
          : branchId // ignore: cast_nullable_to_non_nullable
              as String?,
      terminalId: freezed == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String?,
      programVersion: freezed == programVersion
          ? _value.programVersion
          : programVersion // ignore: cast_nullable_to_non_nullable
              as int?,
      rewardVersion: freezed == rewardVersion
          ? _value.rewardVersion
          : rewardVersion // ignore: cast_nullable_to_non_nullable
              as int?,
      commercialSnapshot: freezed == commercialSnapshot
          ? _value.commercialSnapshot
          : commercialSnapshot // ignore: cast_nullable_to_non_nullable
              as String?,
      origin: freezed == origin
          ? _value.origin
          : origin // ignore: cast_nullable_to_non_nullable
              as String?,
      occurredAt: freezed == occurredAt
          ? _value.occurredAt
          : occurredAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      recordedAt: freezed == recordedAt
          ? _value.recordedAt
          : recordedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      legacyImported: null == legacyImported
          ? _value.legacyImported
          : legacyImported // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$CustomerPointTransactionImpl implements _CustomerPointTransaction {
  const _$CustomerPointTransactionImpl(
      {required this.id,
      required this.customerId,
      this.invoiceId,
      required this.type,
      required this.points,
      required this.balanceAfter,
      this.conversionRate = 0.1,
      this.reason,
      required this.createdAt,
      this.syncStatus = SyncStatus.pending,
      this.loyaltyProgramId,
      this.ticketId,
      this.rewardId,
      this.transactionType,
      this.units,
      this.reversalOfTransactionId,
      this.idempotencyKey,
      this.sourceEventId,
      this.actorUserId,
      this.branchId,
      this.terminalId,
      this.programVersion,
      this.rewardVersion,
      this.commercialSnapshot,
      this.origin,
      this.occurredAt,
      this.recordedAt,
      this.legacyImported = false});

  factory _$CustomerPointTransactionImpl.fromJson(Map<String, dynamic> json) =>
      _$$CustomerPointTransactionImplFromJson(json);

  @override
  final String id;
  @override
  final String customerId;
  @override
  final String? invoiceId;
  @override
  final PointTransactionType type;
  @override
  final double points;
  @override
  final double balanceAfter;
  @override
  @JsonKey()
  final double conversionRate;
  @override
  final String? reason;
  @override
  final DateTime createdAt;
  @override
  @JsonKey()
  final SyncStatus syncStatus;
// --- V1 Loyalty fields ---
  @override
  final String? loyaltyProgramId;
  @override
  final String? ticketId;
  @override
  final String? rewardId;
  @override
  final String? transactionType;
  @override
  final int? units;
  @override
  final String? reversalOfTransactionId;
  @override
  final String? idempotencyKey;
  @override
  final String? sourceEventId;
  @override
  final String? actorUserId;
  @override
  final String? branchId;
  @override
  final String? terminalId;
  @override
  final int? programVersion;
  @override
  final int? rewardVersion;
  @override
  final String? commercialSnapshot;
  @override
  final String? origin;
  @override
  final DateTime? occurredAt;
  @override
  final DateTime? recordedAt;
  @override
  @JsonKey()
  final bool legacyImported;

  @override
  String toString() {
    return 'CustomerPointTransaction(id: $id, customerId: $customerId, invoiceId: $invoiceId, type: $type, points: $points, balanceAfter: $balanceAfter, conversionRate: $conversionRate, reason: $reason, createdAt: $createdAt, syncStatus: $syncStatus, loyaltyProgramId: $loyaltyProgramId, ticketId: $ticketId, rewardId: $rewardId, transactionType: $transactionType, units: $units, reversalOfTransactionId: $reversalOfTransactionId, idempotencyKey: $idempotencyKey, sourceEventId: $sourceEventId, actorUserId: $actorUserId, branchId: $branchId, terminalId: $terminalId, programVersion: $programVersion, rewardVersion: $rewardVersion, commercialSnapshot: $commercialSnapshot, origin: $origin, occurredAt: $occurredAt, recordedAt: $recordedAt, legacyImported: $legacyImported)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CustomerPointTransactionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.customerId, customerId) ||
                other.customerId == customerId) &&
            (identical(other.invoiceId, invoiceId) ||
                other.invoiceId == invoiceId) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.points, points) || other.points == points) &&
            (identical(other.balanceAfter, balanceAfter) ||
                other.balanceAfter == balanceAfter) &&
            (identical(other.conversionRate, conversionRate) ||
                other.conversionRate == conversionRate) &&
            (identical(other.reason, reason) || other.reason == reason) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.syncStatus, syncStatus) ||
                other.syncStatus == syncStatus) &&
            (identical(other.loyaltyProgramId, loyaltyProgramId) ||
                other.loyaltyProgramId == loyaltyProgramId) &&
            (identical(other.ticketId, ticketId) ||
                other.ticketId == ticketId) &&
            (identical(other.rewardId, rewardId) ||
                other.rewardId == rewardId) &&
            (identical(other.transactionType, transactionType) ||
                other.transactionType == transactionType) &&
            (identical(other.units, units) || other.units == units) &&
            (identical(
                    other.reversalOfTransactionId, reversalOfTransactionId) ||
                other.reversalOfTransactionId == reversalOfTransactionId) &&
            (identical(other.idempotencyKey, idempotencyKey) ||
                other.idempotencyKey == idempotencyKey) &&
            (identical(other.sourceEventId, sourceEventId) ||
                other.sourceEventId == sourceEventId) &&
            (identical(other.actorUserId, actorUserId) ||
                other.actorUserId == actorUserId) &&
            (identical(other.branchId, branchId) ||
                other.branchId == branchId) &&
            (identical(other.terminalId, terminalId) ||
                other.terminalId == terminalId) &&
            (identical(other.programVersion, programVersion) ||
                other.programVersion == programVersion) &&
            (identical(other.rewardVersion, rewardVersion) ||
                other.rewardVersion == rewardVersion) &&
            (identical(other.commercialSnapshot, commercialSnapshot) ||
                other.commercialSnapshot == commercialSnapshot) &&
            (identical(other.origin, origin) || other.origin == origin) &&
            (identical(other.occurredAt, occurredAt) ||
                other.occurredAt == occurredAt) &&
            (identical(other.recordedAt, recordedAt) ||
                other.recordedAt == recordedAt) &&
            (identical(other.legacyImported, legacyImported) ||
                other.legacyImported == legacyImported));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hashAll([
        runtimeType,
        id,
        customerId,
        invoiceId,
        type,
        points,
        balanceAfter,
        conversionRate,
        reason,
        createdAt,
        syncStatus,
        loyaltyProgramId,
        ticketId,
        rewardId,
        transactionType,
        units,
        reversalOfTransactionId,
        idempotencyKey,
        sourceEventId,
        actorUserId,
        branchId,
        terminalId,
        programVersion,
        rewardVersion,
        commercialSnapshot,
        origin,
        occurredAt,
        recordedAt,
        legacyImported
      ]);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$CustomerPointTransactionImplCopyWith<_$CustomerPointTransactionImpl>
      get copyWith => __$$CustomerPointTransactionImplCopyWithImpl<
          _$CustomerPointTransactionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CustomerPointTransactionImplToJson(
      this,
    );
  }
}

abstract class _CustomerPointTransaction implements CustomerPointTransaction {
  const factory _CustomerPointTransaction(
      {required final String id,
      required final String customerId,
      final String? invoiceId,
      required final PointTransactionType type,
      required final double points,
      required final double balanceAfter,
      final double conversionRate,
      final String? reason,
      required final DateTime createdAt,
      final SyncStatus syncStatus,
      final String? loyaltyProgramId,
      final String? ticketId,
      final String? rewardId,
      final String? transactionType,
      final int? units,
      final String? reversalOfTransactionId,
      final String? idempotencyKey,
      final String? sourceEventId,
      final String? actorUserId,
      final String? branchId,
      final String? terminalId,
      final int? programVersion,
      final int? rewardVersion,
      final String? commercialSnapshot,
      final String? origin,
      final DateTime? occurredAt,
      final DateTime? recordedAt,
      final bool legacyImported}) = _$CustomerPointTransactionImpl;

  factory _CustomerPointTransaction.fromJson(Map<String, dynamic> json) =
      _$CustomerPointTransactionImpl.fromJson;

  @override
  String get id;
  @override
  String get customerId;
  @override
  String? get invoiceId;
  @override
  PointTransactionType get type;
  @override
  double get points;
  @override
  double get balanceAfter;
  @override
  double get conversionRate;
  @override
  String? get reason;
  @override
  DateTime get createdAt;
  @override
  SyncStatus get syncStatus;
  @override // --- V1 Loyalty fields ---
  String? get loyaltyProgramId;
  @override
  String? get ticketId;
  @override
  String? get rewardId;
  @override
  String? get transactionType;
  @override
  int? get units;
  @override
  String? get reversalOfTransactionId;
  @override
  String? get idempotencyKey;
  @override
  String? get sourceEventId;
  @override
  String? get actorUserId;
  @override
  String? get branchId;
  @override
  String? get terminalId;
  @override
  int? get programVersion;
  @override
  int? get rewardVersion;
  @override
  String? get commercialSnapshot;
  @override
  String? get origin;
  @override
  DateTime? get occurredAt;
  @override
  DateTime? get recordedAt;
  @override
  bool get legacyImported;
  @override
  @JsonKey(ignore: true)
  _$$CustomerPointTransactionImplCopyWith<_$CustomerPointTransactionImpl>
      get copyWith => throw _privateConstructorUsedError;
}
