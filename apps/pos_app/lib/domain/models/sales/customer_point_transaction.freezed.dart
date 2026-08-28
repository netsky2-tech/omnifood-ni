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
  SyncStatus get syncStatus => throw _privateConstructorUsedError;

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
      SyncStatus syncStatus});
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
      SyncStatus syncStatus});
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
      this.syncStatus = SyncStatus.pending});

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

  @override
  String toString() {
    return 'CustomerPointTransaction(id: $id, customerId: $customerId, invoiceId: $invoiceId, type: $type, points: $points, balanceAfter: $balanceAfter, conversionRate: $conversionRate, reason: $reason, createdAt: $createdAt, syncStatus: $syncStatus)';
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
                other.syncStatus == syncStatus));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, customerId, invoiceId, type,
      points, balanceAfter, conversionRate, reason, createdAt, syncStatus);

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
      final SyncStatus syncStatus}) = _$CustomerPointTransactionImpl;

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
  @override
  @JsonKey(ignore: true)
  _$$CustomerPointTransactionImplCopyWith<_$CustomerPointTransactionImpl>
      get copyWith => throw _privateConstructorUsedError;
}
