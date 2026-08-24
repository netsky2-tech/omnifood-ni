// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'cash_movement.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

CashMovement _$CashMovementFromJson(Map<String, dynamic> json) {
  return _CashMovement.fromJson(json);
}

/// @nodoc
mixin _$CashMovement {
  String get id => throw _privateConstructorUsedError;
  String get shiftId => throw _privateConstructorUsedError;
  String get terminalId => throw _privateConstructorUsedError;
  CashMovementType get type => throw _privateConstructorUsedError;
  double get amountNio => throw _privateConstructorUsedError;
  double get amountUsd => throw _privateConstructorUsedError;
  String get reason => throw _privateConstructorUsedError;
  String? get authorizedByUserId => throw _privateConstructorUsedError;
  DateTime get timestamp => throw _privateConstructorUsedError;
  String get syncStatus => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $CashMovementCopyWith<CashMovement> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CashMovementCopyWith<$Res> {
  factory $CashMovementCopyWith(
          CashMovement value, $Res Function(CashMovement) then) =
      _$CashMovementCopyWithImpl<$Res, CashMovement>;
  @useResult
  $Res call(
      {String id,
      String shiftId,
      String terminalId,
      CashMovementType type,
      double amountNio,
      double amountUsd,
      String reason,
      String? authorizedByUserId,
      DateTime timestamp,
      String syncStatus});
}

/// @nodoc
class _$CashMovementCopyWithImpl<$Res, $Val extends CashMovement>
    implements $CashMovementCopyWith<$Res> {
  _$CashMovementCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? shiftId = null,
    Object? terminalId = null,
    Object? type = null,
    Object? amountNio = null,
    Object? amountUsd = null,
    Object? reason = null,
    Object? authorizedByUserId = freezed,
    Object? timestamp = null,
    Object? syncStatus = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      shiftId: null == shiftId
          ? _value.shiftId
          : shiftId // ignore: cast_nullable_to_non_nullable
              as String,
      terminalId: null == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as CashMovementType,
      amountNio: null == amountNio
          ? _value.amountNio
          : amountNio // ignore: cast_nullable_to_non_nullable
              as double,
      amountUsd: null == amountUsd
          ? _value.amountUsd
          : amountUsd // ignore: cast_nullable_to_non_nullable
              as double,
      reason: null == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String,
      authorizedByUserId: freezed == authorizedByUserId
          ? _value.authorizedByUserId
          : authorizedByUserId // ignore: cast_nullable_to_non_nullable
              as String?,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$CashMovementImplCopyWith<$Res>
    implements $CashMovementCopyWith<$Res> {
  factory _$$CashMovementImplCopyWith(
          _$CashMovementImpl value, $Res Function(_$CashMovementImpl) then) =
      __$$CashMovementImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String shiftId,
      String terminalId,
      CashMovementType type,
      double amountNio,
      double amountUsd,
      String reason,
      String? authorizedByUserId,
      DateTime timestamp,
      String syncStatus});
}

/// @nodoc
class __$$CashMovementImplCopyWithImpl<$Res>
    extends _$CashMovementCopyWithImpl<$Res, _$CashMovementImpl>
    implements _$$CashMovementImplCopyWith<$Res> {
  __$$CashMovementImplCopyWithImpl(
      _$CashMovementImpl _value, $Res Function(_$CashMovementImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? shiftId = null,
    Object? terminalId = null,
    Object? type = null,
    Object? amountNio = null,
    Object? amountUsd = null,
    Object? reason = null,
    Object? authorizedByUserId = freezed,
    Object? timestamp = null,
    Object? syncStatus = null,
  }) {
    return _then(_$CashMovementImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      shiftId: null == shiftId
          ? _value.shiftId
          : shiftId // ignore: cast_nullable_to_non_nullable
              as String,
      terminalId: null == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as CashMovementType,
      amountNio: null == amountNio
          ? _value.amountNio
          : amountNio // ignore: cast_nullable_to_non_nullable
              as double,
      amountUsd: null == amountUsd
          ? _value.amountUsd
          : amountUsd // ignore: cast_nullable_to_non_nullable
              as double,
      reason: null == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String,
      authorizedByUserId: freezed == authorizedByUserId
          ? _value.authorizedByUserId
          : authorizedByUserId // ignore: cast_nullable_to_non_nullable
              as String?,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$CashMovementImpl implements _CashMovement {
  const _$CashMovementImpl(
      {required this.id,
      required this.shiftId,
      this.terminalId = 'default-terminal',
      required this.type,
      required this.amountNio,
      this.amountUsd = 0.0,
      required this.reason,
      this.authorizedByUserId,
      required this.timestamp,
      this.syncStatus = 'pending'});

  factory _$CashMovementImpl.fromJson(Map<String, dynamic> json) =>
      _$$CashMovementImplFromJson(json);

  @override
  final String id;
  @override
  final String shiftId;
  @override
  @JsonKey()
  final String terminalId;
  @override
  final CashMovementType type;
  @override
  final double amountNio;
  @override
  @JsonKey()
  final double amountUsd;
  @override
  final String reason;
  @override
  final String? authorizedByUserId;
  @override
  final DateTime timestamp;
  @override
  @JsonKey()
  final String syncStatus;

  @override
  String toString() {
    return 'CashMovement(id: $id, shiftId: $shiftId, terminalId: $terminalId, type: $type, amountNio: $amountNio, amountUsd: $amountUsd, reason: $reason, authorizedByUserId: $authorizedByUserId, timestamp: $timestamp, syncStatus: $syncStatus)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CashMovementImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.shiftId, shiftId) || other.shiftId == shiftId) &&
            (identical(other.terminalId, terminalId) ||
                other.terminalId == terminalId) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.amountNio, amountNio) ||
                other.amountNio == amountNio) &&
            (identical(other.amountUsd, amountUsd) ||
                other.amountUsd == amountUsd) &&
            (identical(other.reason, reason) || other.reason == reason) &&
            (identical(other.authorizedByUserId, authorizedByUserId) ||
                other.authorizedByUserId == authorizedByUserId) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.syncStatus, syncStatus) ||
                other.syncStatus == syncStatus));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, shiftId, terminalId, type,
      amountNio, amountUsd, reason, authorizedByUserId, timestamp, syncStatus);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$CashMovementImplCopyWith<_$CashMovementImpl> get copyWith =>
      __$$CashMovementImplCopyWithImpl<_$CashMovementImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CashMovementImplToJson(
      this,
    );
  }
}

abstract class _CashMovement implements CashMovement {
  const factory _CashMovement(
      {required final String id,
      required final String shiftId,
      final String terminalId,
      required final CashMovementType type,
      required final double amountNio,
      final double amountUsd,
      required final String reason,
      final String? authorizedByUserId,
      required final DateTime timestamp,
      final String syncStatus}) = _$CashMovementImpl;

  factory _CashMovement.fromJson(Map<String, dynamic> json) =
      _$CashMovementImpl.fromJson;

  @override
  String get id;
  @override
  String get shiftId;
  @override
  String get terminalId;
  @override
  CashMovementType get type;
  @override
  double get amountNio;
  @override
  double get amountUsd;
  @override
  String get reason;
  @override
  String? get authorizedByUserId;
  @override
  DateTime get timestamp;
  @override
  String get syncStatus;
  @override
  @JsonKey(ignore: true)
  _$$CashMovementImplCopyWith<_$CashMovementImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
